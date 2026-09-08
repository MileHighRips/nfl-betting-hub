import type { BookLine, Game, ModelFactor, ModelPick } from './types';
import { TEAMS } from './teams';
import {
  americanToProb,
  confidenceScore,
  coverProb,
  kellyUnits,
  marginToWinProb,
  noVigProb,
} from './odds';

/**
 * ============================================================================
 *  THE MODEL — a transparent, weighted NFL betting engine.
 * ============================================================================
 *  Every pick is built from an explainable stack of factors rather than a
 *  black box. The engine blends a power-rating projection with the market's
 *  vig-free price, then sizes stakes with fractional Kelly.
 *
 *  Factor stack (game sides & totals):
 *   1. Power rating differential (neutral field)
 *   2. Home-field advantage
 *   3. Rest / bye differential
 *   4. Quarterback availability (injury)
 *   5. Divisional familiarity dampener
 *   6. Ken Barkley pass-defense regression signal (season level)
 *   7. Market anchor (vig-removed consensus) — regression to the market
 *
 *  The model projection and the market are blended so we never stray absurdly
 *  from an efficient market, but we still express a real edge when factors
 *  disagree with the price.
 * ============================================================================
 */

export const MODEL_CONFIG = {
  homeFieldAdvantage: 1.7,
  restPointPerDay: 0.12,
  restCap: 2.0,
  qbOutSwing: 6.5,
  divisionDampener: 0.85,
  marketBlend: 0.45, // weight given to the market projection vs. our model
  sigma: 13.2,
  totalBase: 44.5,
};

function consensus(books: BookLine[]) {
  const n = books.length;
  const avg = (fn: (b: BookLine) => number) => books.reduce((s, b) => s + fn(b), 0) / n;
  return {
    spread: avg((b) => b.spread),
    total: avg((b) => b.total),
  };
}

/** Best available price for a side across books. */
function bestPrice<T extends BookLine>(
  books: T[],
  pick: (b: T) => number,
): { book: T['book']; price: number } {
  let best = books[0];
  for (const b of books) if (pick(b) > pick(best)) best = b;
  return { book: best.book, price: pick(best) };
}

export interface GameAnalysis {
  game: Game;
  projectedMargin: number; // home perspective
  projectedTotal: number;
  factors: ModelFactor[];
  spread: ModelPick;
  moneyline: ModelPick;
  total: ModelPick;
  prop: ModelPick;
  upset?: ModelPick;
  topPick: ModelPick;
}

export function analyzeGame(game: Game): GameAnalysis {
  const home = TEAMS[game.home];
  const away = TEAMS[game.away];
  const c = game.context;
  const factors: ModelFactor[] = [];

  // 1. Power rating differential.
  let margin = home.rating - away.rating;
  factors.push({
    label: 'Power Rating Edge',
    detail: `${home.name} ${home.rating.toFixed(1)} vs ${away.name} ${away.rating.toFixed(1)}`,
    impact: home.rating - away.rating,
  });

  // 2. Home-field advantage.
  const hfa = c.neutralSite ? 0 : MODEL_CONFIG.homeFieldAdvantage;
  margin += hfa;
  if (hfa) factors.push({ label: 'Home Field', detail: `${home.name} at home`, impact: hfa });

  // 3. Rest / bye differential.
  const restDiff = Math.max(
    -MODEL_CONFIG.restCap,
    Math.min(
      MODEL_CONFIG.restCap,
      (c.homeRestDays - c.awayRestDays) * MODEL_CONFIG.restPointPerDay,
    ),
  );
  if (Math.abs(restDiff) >= 0.1) {
    margin += restDiff;
    factors.push({
      label: 'Rest Differential',
      detail: `${c.homeRestDays}d vs ${c.awayRestDays}d`,
      impact: restDiff,
    });
  }

  // 4. Quarterback availability.
  if (c.homeQbOut) {
    margin -= MODEL_CONFIG.qbOutSwing;
    factors.push({
      label: 'QB Out (Home)',
      detail: `${home.name} starter unavailable`,
      impact: -MODEL_CONFIG.qbOutSwing,
    });
  }
  if (c.awayQbOut) {
    margin += MODEL_CONFIG.qbOutSwing;
    factors.push({
      label: 'QB Out (Away)',
      detail: `${away.name} starter unavailable`,
      impact: MODEL_CONFIG.qbOutSwing,
    });
  }

  // 5. Divisional dampener (rivals play closer than raw ratings suggest).
  if (c.divisionGame) {
    const before = margin;
    margin *= MODEL_CONFIG.divisionDampener;
    factors.push({
      label: 'Division Game',
      detail: 'Familiarity tightens the margin',
      impact: margin - before,
    });
  }

  // 6. Ken Barkley pass-defense regression signal (points nudge on season expectation).
  const passRegress =
    passDefenseSignal(home.passDefRankPrev) - passDefenseSignal(away.passDefRankPrev);
  if (Math.abs(passRegress) >= 0.15) {
    margin += passRegress;
    factors.push({
      label: 'Pass-D Regression (Ken)',
      detail: 'Prior-year pass defense is the least sticky unit — mean reversion applied',
      impact: passRegress,
    });
  }

  const modelMargin = margin;

  // 7. Blend with the market (vig-removed) so we regress toward an efficient price.
  const con = consensus(game.books);
  const marketMargin = -con.spread; // home margin implied by the spread
  const blended =
    modelMargin * (1 - MODEL_CONFIG.marketBlend) + marketMargin * MODEL_CONFIG.marketBlend;

  // ---- SPREAD PICK ----
  const spreadPick = buildSpreadPick(game, blended);

  // ---- MONEYLINE PICK ----
  const moneylinePick = buildMoneylinePick(game, blended);

  // ---- TOTAL PICK ----
  const projectedTotal = projectTotal(game);
  const totalPick = buildTotalPick(game, projectedTotal, con.total);

  // ---- PROP PICK ----
  const propPick = buildPropPick(game);

  // ---- UNDERDOG UPSET DETECTION ----
  let upset: ModelPick | undefined;
  const homeWinProb = marginToWinProb(blended, MODEL_CONFIG.sigma);
  const dogIsHome = con.spread > 0;
  const dogWinProb = dogIsHome ? homeWinProb : 1 - homeWinProb;
  const dogMlRaw = dogIsHome
    ? bestPrice(game.books, (b) => b.moneylineHome)
    : bestPrice(game.books, (b) => b.moneylineAway);
  const dogMarketProb = noVigProb(
    dogIsHome ? game.books[0].moneylineHome : game.books[0].moneylineAway,
    dogIsHome ? game.books[0].moneylineAway : game.books[0].moneylineHome,
  );
  if (dogMlRaw.price > 0 && dogWinProb - dogMarketProb > 0.05 && dogWinProb > 0.4) {
    const edge = dogWinProb - dogMarketProb;
    upset = {
      gameId: game.id,
      type: 'Moneyline',
      selection: `${dogIsHome ? home.name : away.name} ML (upset)`,
      side: dogIsHome ? 'home_ml' : 'away_ml',
      book: dogMlRaw.book,
      price: dogMlRaw.price,
      line: 0,
      marketProb: dogMarketProb,
      modelProb: dogWinProb,
      edge,
      confidence: confidenceScore(dogWinProb, edge),
      units: kellyUnits(dogWinProb, dogMlRaw.price),
      isUnderdogUpset: true,
      factors,
    };
  }

  const candidates = [spreadPick, moneylinePick, totalPick, propPick];
  const topPick = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));

  return {
    game,
    projectedMargin: blended,
    projectedTotal,
    factors,
    spread: spreadPick,
    moneyline: moneylinePick,
    total: totalPick,
    prop: propPick,
    upset,
    topPick,
  };
}

/** Convert a prior-year pass-defense rank into a season-level points nudge. */
function passDefenseSignal(rank: number): number {
  // Rank 32 (worst) regresses UP (positive for the team's future). Rank 1 regresses DOWN.
  // Centered at 16.5, scaled to ±~1.2 points.
  return ((rank - 16.5) / 15.5) * 1.2;
}

function buildSpreadPick(game: Game, projectedMargin: number): ModelPick {
  const home = TEAMS[game.home];
  const away = TEAMS[game.away];
  // Home covers if margin > -homeSpread. Compare each book's home spread.
  const con = consensus(game.books);
  const homeCover = coverProb(projectedMargin, con.spread, MODEL_CONFIG.sigma);
  const takeHome = homeCover >= 0.5;
  const prob = takeHome ? homeCover : 1 - homeCover;
  const priced = takeHome
    ? bestPrice(game.books, (b) => b.spreadPriceHome)
    : bestPrice(game.books, (b) => b.spreadPriceAway);
  const marketProb = noVigProb(
    takeHome ? game.books[0].spreadPriceHome : game.books[0].spreadPriceAway,
    takeHome ? game.books[0].spreadPriceAway : game.books[0].spreadPriceHome,
  );
  const line = takeHome ? con.spread : -con.spread;
  const team = takeHome ? home.name : away.name;
  const edge = prob - marketProb;
  return {
    gameId: game.id,
    type: 'Spread',
    selection: `${team} ${line > 0 ? '+' : ''}${line.toFixed(1)}`,
    side: takeHome ? 'home_spread' : 'away_spread',
    book: priced.book,
    price: priced.price,
    line,
    marketProb,
    modelProb: prob,
    edge,
    confidence: confidenceScore(prob, edge),
    units: kellyUnits(prob, priced.price),
    factors: [],
  };
}

function buildMoneylinePick(game: Game, projectedMargin: number): ModelPick {
  const home = TEAMS[game.home];
  const away = TEAMS[game.away];
  const homeWin = marginToWinProb(projectedMargin, MODEL_CONFIG.sigma);
  const takeHome = homeWin >= 0.5;
  const prob = takeHome ? homeWin : 1 - homeWin;
  const priced = takeHome
    ? bestPrice(game.books, (b) => b.moneylineHome)
    : bestPrice(game.books, (b) => b.moneylineAway);
  const marketProb = noVigProb(
    takeHome ? game.books[0].moneylineHome : game.books[0].moneylineAway,
    takeHome ? game.books[0].moneylineAway : game.books[0].moneylineHome,
  );
  const edge = prob - marketProb;
  return {
    gameId: game.id,
    type: 'Moneyline',
    selection: `${takeHome ? home.name : away.name} ML`,
    side: takeHome ? 'home_ml' : 'away_ml',
    book: priced.book,
    price: priced.price,
    line: 0,
    marketProb,
    modelProb: prob,
    edge,
    confidence: confidenceScore(prob, edge),
    units: kellyUnits(prob, priced.price),
    factors: [],
  };
}

/** Light, transparent total projection (no O/D splits required). */
export function projectTotal(game: Game): number {
  const home = TEAMS[game.home];
  const away = TEAMS[game.away];
  let total = MODEL_CONFIG.totalBase;
  // Stronger overall teams tend to have better offenses; small positive nudge.
  total += (home.rating + away.rating) * 0.18;
  const w = game.context.weather;
  if (w === 'dome') total += 1.0;
  if (w === 'wind') total -= 3.0;
  if (w === 'rain') total -= 2.0;
  if (w === 'snow') total -= 4.0;
  if (w === 'cold') total -= 1.5;
  return total;
}

function buildTotalPick(game: Game, projectedTotal: number, marketTotal: number): ModelPick {
  const diff = projectedTotal - marketTotal;
  const takeOver = diff >= 0;
  // Convert points of disagreement to a probability with total sigma ~10.
  const prob = 0.5 + Math.min(0.22, Math.abs(diff) / 10 / 2);
  const priced = takeOver
    ? bestPrice(game.books, (b) => b.overPrice)
    : bestPrice(game.books, (b) => b.underPrice);
  const marketProb = noVigProb(
    takeOver ? game.books[0].overPrice : game.books[0].underPrice,
    takeOver ? game.books[0].underPrice : game.books[0].overPrice,
  );
  const edge = prob - marketProb;
  return {
    gameId: game.id,
    type: 'Total',
    selection: `${takeOver ? 'Over' : 'Under'} ${marketTotal.toFixed(1)}`,
    side: takeOver ? 'over' : 'under',
    book: priced.book,
    price: priced.price,
    line: marketTotal,
    marketProb,
    modelProb: prob,
    edge,
    confidence: confidenceScore(prob, edge),
    units: kellyUnits(prob, priced.price),
    factors: [],
  };
}

function buildPropPick(game: Game): ModelPick {
  const p = game.prop;
  const prob = Math.max(0.5, Math.min(0.85, p.confidence / 100));
  const marketProb = americanToProb(p.price);
  const edge = prob - marketProb;
  return {
    gameId: game.id,
    type: 'Prop',
    selection: `${p.player} ${p.side} ${p.line} ${p.market}`,
    side: 'prop',
    book: p.book,
    price: p.price,
    line: p.line,
    marketProb,
    modelProb: prob,
    edge,
    confidence: p.confidence,
    units: kellyUnits(prob, p.price),
    factors: [{ label: 'Projection', detail: p.rationale, impact: p.projection - p.line }],
  };
}

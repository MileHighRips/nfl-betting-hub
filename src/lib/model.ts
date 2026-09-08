import type { BookLine, Game, ModelFactor, ModelPick, PlayerProp } from './types';
import { TEAMS } from './teams';
import { americanToProb, confidenceScore, kellyUnits, noVigProb } from './odds';
import { bestProp } from './props';
import { homeCoverProb, overProb, simulateGame, type GameSim } from './simulation';
import type { Ratings } from './form';

/**
 * The model layer. Every game is run through the Monte-Carlo simulation engine
 * (see simulation.ts); spread, moneyline and total picks are read off the same
 * simulated score distribution, then blended with the vig-free market price for
 * staking. Stakes use fractional Kelly, hard-capped at 1 unit.
 */

export const MODEL_WEIGHT = 0.55; // weight on the model vs. the market when blending

function consensus(books: BookLine[]) {
  const n = books.length || 1;
  return {
    spread: books.reduce((s, b) => s + b.spread, 0) / n,
    total: books.reduce((s, b) => s + b.total, 0) / n,
  };
}

function bestPrice<T extends BookLine>(books: T[], pick: (b: T) => number) {
  let best = books[0];
  for (const b of books) if (pick(b) > pick(best)) best = b;
  return { book: best.book, price: pick(best) };
}

export interface GameAnalysis {
  game: Game;
  sim: GameSim;
  projectedMargin: number;
  projectedTotal: number;
  projHome: number;
  projAway: number;
  homeWinProb: number;
  factors: ModelFactor[];
  spread: ModelPick;
  moneyline: ModelPick;
  total: ModelPick;
  prop: ModelPick;
  propDetail: PlayerProp;
  upset?: ModelPick;
  topPick: ModelPick;
}

export function analyzeGame(game: Game, ratings?: Ratings): GameAnalysis {
  const sim = simulateGame(game, ratings);
  const con = consensus(game.books);

  const spread = buildSpreadPick(game, sim, con.spread);
  const moneyline = buildMoneylinePick(game, sim);
  const total = buildTotalPick(game, sim, con.total);

  const propDetail = bestProp(game, game.livePropLines, {
    projHome: sim.projHome,
    projAway: sim.projAway,
    marginMean: sim.marginMean,
    totalMean: sim.totalMean,
  });
  const prop = buildPropPick(game, propDetail);

  const upset = detectUpset(game, sim, con.spread);

  const candidates = [spread, moneyline, total, prop];
  const topPick = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));

  return {
    game,
    sim,
    projectedMargin: sim.marginMean,
    projectedTotal: sim.totalMean,
    projHome: sim.projHome,
    projAway: sim.projAway,
    homeWinProb: sim.homeWinProb,
    factors: sim.factors,
    spread,
    moneyline,
    total,
    prop,
    propDetail,
    upset,
    topPick,
  };
}

function blendUnits(modelProb: number, marketProb: number, price: number): number {
  const blended = MODEL_WEIGHT * modelProb + (1 - MODEL_WEIGHT) * marketProb;
  return kellyUnits(blended, price);
}

function buildSpreadPick(game: Game, sim: GameSim, conSpread: number): ModelPick {
  const home = TEAMS[game.home];
  const away = TEAMS[game.away];
  const homeCover = homeCoverProb(sim, conSpread);
  const takeHome = homeCover >= 0.5;
  const prob = takeHome ? homeCover : 1 - homeCover;
  const priced = takeHome
    ? bestPrice(game.books, (b) => b.spreadPriceHome)
    : bestPrice(game.books, (b) => b.spreadPriceAway);
  const marketProb = noVigProb(
    takeHome ? game.books[0].spreadPriceHome : game.books[0].spreadPriceAway,
    takeHome ? game.books[0].spreadPriceAway : game.books[0].spreadPriceHome,
  );
  const line = takeHome ? conSpread : -conSpread;
  const edge = prob - marketProb;
  return {
    gameId: game.id,
    type: 'Spread',
    selection: `${takeHome ? home.name : away.name} ${line > 0 ? '+' : ''}${line.toFixed(1)}`,
    side: takeHome ? 'home_spread' : 'away_spread',
    book: priced.book,
    price: priced.price,
    line,
    marketProb,
    modelProb: prob,
    edge,
    confidence: confidenceScore(prob, edge),
    units: blendUnits(prob, marketProb, priced.price),
    factors: sim.factors,
  };
}

function buildMoneylinePick(game: Game, sim: GameSim): ModelPick {
  const home = TEAMS[game.home];
  const away = TEAMS[game.away];
  const takeHome = sim.homeWinProb >= 0.5;
  const prob = takeHome ? sim.homeWinProb : 1 - sim.homeWinProb;
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
    units: blendUnits(prob, marketProb, priced.price),
    factors: [],
  };
}

function buildTotalPick(game: Game, sim: GameSim, conTotal: number): ModelPick {
  const over = overProb(sim, conTotal);
  const takeOver = over >= 0.5;
  const prob = takeOver ? over : 1 - over;
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
    selection: `${takeOver ? 'Over' : 'Under'} ${conTotal.toFixed(1)}`,
    side: takeOver ? 'over' : 'under',
    book: priced.book,
    price: priced.price,
    line: conTotal,
    marketProb,
    modelProb: prob,
    edge,
    confidence: confidenceScore(prob, edge),
    units: blendUnits(prob, marketProb, priced.price),
    factors: [],
  };
}

function buildPropPick(game: Game, p: PlayerProp): ModelPick {
  const prob = Math.max(0.5, Math.min(0.9, p.confidence / 100));
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

function detectUpset(game: Game, sim: GameSim, conSpread: number): ModelPick | undefined {
  const dogIsHome = conSpread > 0;
  const dogWinProb = dogIsHome ? sim.homeWinProb : 1 - sim.homeWinProb;
  const priced = dogIsHome
    ? bestPrice(game.books, (b) => b.moneylineHome)
    : bestPrice(game.books, (b) => b.moneylineAway);
  if (priced.price <= 0) return undefined;
  const marketProb = noVigProb(
    dogIsHome ? game.books[0].moneylineHome : game.books[0].moneylineAway,
    dogIsHome ? game.books[0].moneylineAway : game.books[0].moneylineHome,
  );
  const edge = dogWinProb - marketProb;
  if (edge <= 0.045 || dogWinProb <= 0.38) return undefined;
  const team = dogIsHome ? TEAMS[game.home] : TEAMS[game.away];
  return {
    gameId: game.id,
    type: 'Moneyline',
    selection: `${team.name} ML (upset)`,
    side: dogIsHome ? 'home_ml' : 'away_ml',
    book: priced.book,
    price: priced.price,
    line: 0,
    marketProb,
    modelProb: dogWinProb,
    edge,
    confidence: confidenceScore(dogWinProb, edge),
    units: blendUnits(dogWinProb, marketProb, priced.price),
    isUnderdogUpset: true,
    factors: sim.factors,
  };
}

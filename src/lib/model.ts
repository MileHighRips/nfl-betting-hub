import type { BookLine, Game, ModelFactor, ModelPick, PlayerProp } from './types';
import { TEAMS } from './teams';
import {
  americanToProb,
  americanToProfit,
  confidenceScore,
  kellyUnits,
  noVigProb,
  sharpUnits,
} from './odds';
import { bestProp, bestProps } from './props';
import { homeCoverProb, overProb, simulateGame, type GameSim } from './simulation';
import { passesConviction } from './calibration';
import { calibrateTdProb, getTdCalibration } from './props-model';
import { softTotalEdge } from './segments';
import type { Ratings } from './form';
import { WEEK1_HISTORICAL_PICKS, type HistoricalPickOverride } from '@/data/historicalPicks';

/**
 * The model layer. Every game is run through the Monte-Carlo simulation engine
 * (see simulation.ts); spread, moneyline and total picks are read off the same
 * simulated score distribution, then blended with the vig-free market price for
 * staking. Stakes use fractional Kelly, hard-capped at 1 unit.
 */

export const MODEL_WEIGHT = 0.55; // weight on the model vs. the market when blending

// Adaptive blend by market: lean on the sharp market for sides (our weaker
// suit), and on our proven simulation for totals. Measured, not guessed.
const WEIGHT_SIDE = 0.4; // spread & moneyline — lean harder on the sharp market (we're weak here)
const WEIGHT_TOTAL = 0.65; // totals — the model's demonstrated edge (63% through wk3)
const WEIGHT_PROP = 0.5;

// Modest conviction bump for the validated situational-total spots (see segments.ts).
// Kept small because the segment edge is promising but not yet proven live.
const SOFT_TOTAL_BUMP = 1.2;

// Conviction stake (uncapped quarter-Kelly on the 0.55 blend) shown on the slate
// and True Units page — kept at MODEL_WEIGHT so historical numbers don't shift.
function trueUnitsFor(modelProb: number, marketProb: number, price: number): number {
  return sharpUnits(MODEL_WEIGHT * modelProb + (1 - MODEL_WEIGHT) * marketProb, price);
}

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
  /** Every +EV prop in the game (best first). Locked games hold only the frozen one. */
  props: { pick: ModelPick; detail: PlayerProp }[];
  upset?: ModelPick;
  anytimeTd?: AnytimeTdPick;
  anytimeTdLongshot?: AnytimeTdPick;
  /** Every +EV anytime-TD scorer (best first). Locked games hold only frozen ones. */
  anytimeTds: AnytimeTdPick[];
  locked?: boolean;
  topPick: ModelPick;
}

export interface AnytimeTdPick {
  player: string;
  team: import('./types').TeamAbbr;
  price: number;
  book: 'DraftKings' | 'Model';
  prob: number; // model probability of scoring a TD
  impliedProb: number; // DK implied probability
  edge: number;
  ev: number; // expected profit per 1u staked
  units: number;
  trueUnits?: number; // conviction stake for the slate
}

export function analyzeGame(
  game: Game,
  ratings?: Ratings,
  opts?: { ignoreHistorical?: boolean },
): GameAnalysis {
  const sim = simulateGame(game, ratings);
  const con = consensus(game.books);

  const historical =
    game.week === 1 && !opts?.ignoreHistorical
      ? WEEK1_HISTORICAL_PICKS.find((p) => p.away === game.away && p.home === game.home)
      : undefined;
  const historicalPick = (type: HistoricalPickOverride['type'], upset = false) =>
    historical?.picks.find((pick) => pick.type === type && Boolean(pick.isUnderdogUpset) === upset);

  const spread = historicalPick('Spread')
    ? buildHistoricalPick(game, historicalPick('Spread')!)
    : buildSpreadPick(game, sim, con.spread);
  const moneyline = buildMoneylinePick(game, sim);
  const total = buildTotalPick(game, sim, con.total, con.spread);

  const historicalProp = historicalPick('Prop');
  const propDetail = historicalProp
    ? buildHistoricalProp(historicalProp)
    : bestProp(game, game.livePropLines, {
        projHome: sim.projHome,
        projAway: sim.projAway,
        marginMean: sim.marginMean,
        totalMean: sim.totalMean,
      });
  const prop = historicalProp ? buildHistoricalPick(game, historicalProp) : buildPropPick(game, propDetail);

  const historicalMoneyline = historicalPick('Moneyline');
  const historicalUpset = historicalPick('Moneyline', true);
  const moneylinePick = historical?.suppressMoneyline
    ? { ...moneyline, units: 0 }
    : historicalMoneyline
      ? buildHistoricalPick(game, historicalMoneyline)
      : moneyline;
  const upset = historicalUpset?.isUnderdogUpset
    ? buildHistoricalPick(game, historicalUpset)
    : detectUpset(game, sim, con.spread);

  // From Week 2 on, every value game pick is a flat 1-unit play (props/spreads/
  // totals/moneylines/upsets). Anytime-TD keeps its own optimal sizing.
  const flat = (p: ModelPick): ModelPick =>
    game.week >= 2 && p.units > 0 ? { ...p, units: 1 } : p;
  const spreadPick = flat(spread);
  const totalPick = flat(total);
  const mlPick = flat(moneylinePick);
  const propPickFlat = flat(prop);
  const upsetPick = upset ? flat(upset) : undefined;

  // Every genuinely +EV prop for the slate (value only). A locked/historical
  // game keeps only its frozen prop.
  // Only genuinely strong props survive — a wider edge bar and a hard 2-per-game
  // cap. Volume props ran ~50% (a loser at -114); quality over quantity.
  const props = historicalProp
    ? [{ pick: propPickFlat, detail: propDetail }]
    : bestProps(
        game,
        game.livePropLines,
        {
          projHome: sim.projHome,
          projAway: sim.projAway,
          marginMean: sim.marginMean,
          totalMean: sim.totalMean,
        },
        { minEdge: 0.05, limit: 2 },
      ).map((e) => ({ pick: flat(buildPropPick(game, e.prop)), detail: e.prop }));

  const candidates = [spreadPick, mlPick, totalPick, propPickFlat];
  const topPick = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));

  const atdPicks = evaluateAnytimeTds(game, sim, con);
  // Primary: the most profitable likely scorer (shorter than +250).
  const anytimeTd = maxEv(atdPicks.filter((p) => p.price <= 250)) ?? maxEv(atdPicks);
  // Longshot: bigger payouts only (+1000 and up), a real red-zone threat
  // (>=6% to score), best value with likelihood weighted in.
  const distinct = (p: AnytimeTdPick) => p.player !== anytimeTd?.player;
  // Longshot: only a genuine +EV big payout — never a forced no-edge dart.
  let anytimeTdLongshot = bestLongshot(
    atdPicks.filter((p) => p.price >= 1000 && p.prob >= 0.06 && p.ev > 0 && distinct(p)),
  );
  // If no +1000 value exists, allow a shorter (+300 or longer) +EV underdog scorer.
  if (!anytimeTdLongshot) {
    anytimeTdLongshot = bestLongshot(
      atdPicks.filter((p) => p.price >= 300 && p.ev > 0 && distinct(p)),
    );
  }

  // Anytime-TD ran 35% (a big loser). Surface only high-EV scorers — a real EV
  // floor and at most 2 per game, best first.
  const anytimeTds = atdPicks
    .filter((p) => p.ev > 0.1)
    .sort((a, b) => b.ev - a.ev)
    .slice(0, 2);

  return {
    game,
    sim,
    projectedMargin: sim.marginMean,
    projectedTotal: sim.totalMean,
    projHome: sim.projHome,
    projAway: sim.projAway,
    homeWinProb: sim.homeWinProb,
    factors: sim.factors,
    spread: spreadPick,
    moneyline: mlPick,
    total: totalPick,
    prop: propPickFlat,
    propDetail,
    props,
    upset: upsetPick,
    anytimeTd,
    anytimeTdLongshot,
    anytimeTds,
    topPick,
  };
}

function buildHistoricalPick(game: Game, pick: HistoricalPickOverride): ModelPick {
  return {
    gameId: game.id,
    type: pick.type,
    selection: pick.selection,
    side: pick.side,
    book: 'DraftKings',
    price: pick.price,
    line: pick.line,
    marketProb: pick.marketProb,
    modelProb: pick.modelProb,
    edge: pick.edge,
    confidence: pick.confidence,
    units: pick.units,
    player: pick.player,
    propMarket: pick.market,
    isUnderdogUpset: pick.isUnderdogUpset,
    factors: [],
  };
}

function buildHistoricalProp(pick: HistoricalPickOverride): PlayerProp {
  return {
    player: pick.player!,
    team: pick.team!,
    market: pick.market!,
    line: pick.line,
    side: pick.propSide!,
    price: pick.price,
    book: 'DraftKings',
    projection: pick.projection ?? pick.line,
    confidence: pick.confidence,
    rationale: pick.rationale ?? 'Historical Week 1 snapshot.',
  };
}

function blendUnits(
  modelProb: number,
  marketProb: number,
  price: number,
  weight = MODEL_WEIGHT,
): number {
  const blended = weight * modelProb + (1 - weight) * marketProb;
  return kellyUnits(blended, price);
}

function buildSpreadPick(game: Game, sim: GameSim, conSpread: number): ModelPick {
  const home = TEAMS[game.home];
  const away = TEAMS[game.away];
  const takeHome = homeCoverProb(sim, conSpread) >= 0.5;

  // Shop every book's ACTUAL spread + price on our side and keep the max-EV
  // number. Because the sim is push-aware, a half-point across a key number
  // (3, 7) changes the cover probability, so key-number value is priced in.
  let best:
    | { book: Game['books'][number]; price: number; prob: number; marketProb: number; ev: number }
    | undefined;
  for (const b of game.books) {
    const cover = homeCoverProb(sim, b.spread);
    const prob = takeHome ? cover : 1 - cover;
    const price = takeHome ? b.spreadPriceHome : b.spreadPriceAway;
    const marketProb = noVigProb(
      takeHome ? b.spreadPriceHome : b.spreadPriceAway,
      takeHome ? b.spreadPriceAway : b.spreadPriceHome,
    );
    const ev = prob * americanToProfit(price) - (1 - prob);
    if (!best || ev > best.ev) best = { book: b, price, prob, marketProb, ev };
  }
  const chosen = best!;
  const line = takeHome ? chosen.book.spread : -chosen.book.spread;
  const edge = chosen.prob - chosen.marketProb;
  // Backtest: side edges under 55% realized ~25% — do not stake them.
  const conviction = passesConviction('Spread', chosen.prob);
  return {
    gameId: game.id,
    type: 'Spread',
    selection: `${takeHome ? home.name : away.name} ${line > 0 ? '+' : ''}${line.toFixed(1)}`,
    side: takeHome ? 'home_spread' : 'away_spread',
    book: chosen.book.book,
    price: chosen.price,
    line,
    marketProb: chosen.marketProb,
    modelProb: chosen.prob,
    edge,
    confidence: confidenceScore(chosen.prob, edge),
    units: conviction ? blendUnits(chosen.prob, chosen.marketProb, chosen.price, WEIGHT_SIDE) : 0,
    trueUnits: conviction ? trueUnitsFor(chosen.prob, chosen.marketProb, chosen.price) : 0,
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
  // Backtest: moneyline edges under 55% realized ~25% — do not stake them.
  const conviction = passesConviction('Moneyline', prob);
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
    units: conviction ? blendUnits(prob, marketProb, priced.price, WEIGHT_SIDE) : 0,
    trueUnits: conviction ? trueUnitsFor(prob, marketProb, priced.price) : 0,
    factors: [],
  };
}

function buildTotalPick(game: Game, sim: GameSim, conTotal: number, conSpread = 0): ModelPick {
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
  // Validated situational totals edge (15-season segment hunt): modest, tagged bump.
  const soft = softTotalEdge(game, conSpread);
  const baseTrue = trueUnitsFor(prob, marketProb, priced.price);
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
    units: blendUnits(prob, marketProb, priced.price, WEIGHT_TOTAL),
    trueUnits: soft.active ? Math.min(5, Number((baseTrue * SOFT_TOTAL_BUMP).toFixed(2))) : baseTrue,
    situational: soft.active ? `Situational total · ${soft.reason}` : undefined,
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
    // Shrink toward the market like the other markets — no over-staking props.
    units: blendUnits(prob, marketProb, p.price, WEIGHT_PROP),
    trueUnits: trueUnitsFor(prob, marketProb, p.price),
    player: p.player,
    propMarket: p.market,
    factors: [{ label: 'Projection', detail: p.rationale, impact: p.projection - p.line }],
  };
}

/**
 * Evaluate every anytime-TD candidate for a game with a market-anchored TD
 * model. DraftKings' own anytime price is the base probability — it already
 * bakes in red-zone/goal-line usage the market prices sharply — de-vigged for
 * the market hold, then scaled by how much more (or less) we project the
 * player's team to score than the market's implied team total. Usage from the
 * live yards lines further concentrates the edge into featured players, so a
 * team we love lifts its red-zone backs and target hogs, not its fullbacks.
 */
function evaluateAnytimeTds(
  game: Game,
  sim: GameSim,
  con: { spread: number; total: number },
): AnytimeTdPick[] {
  const cands = game.anytimeTdCandidates;
  if (!cands?.length) return [];

  const props = game.livePropCandidates ?? [];
  const out = new Set((game.outPlayers ?? []).map((p) => p.toLowerCase()));

  // Usage share (from yards lines) to concentrate team scoring into featured players.
  const usage = new Map<string, number>();
  const teamUsage: Partial<Record<string, number>> = {};
  for (const p of props) {
    if (p.market !== 'Rush Yards' && p.market !== 'Receiving Yards') continue;
    const w = p.market === 'Rush Yards' ? p.line * 1.15 : p.line; // rushing scores slightly more
    usage.set(p.player.toLowerCase(), (usage.get(p.player.toLowerCase()) ?? 0) + w);
    teamUsage[p.team] = (teamUsage[p.team] ?? 0) + w;
  }

  const mktHome = (con.total - con.spread) / 2;
  const mktAway = (con.total + con.spread) / 2;
  const DEVIG = 0.9; // anytime-TD markets carry a real hold — shade the implied down
  const tdCal = getTdCalibration(); // 15-season calibration: anchor probs to the market

  const picks: AnytimeTdPick[] = [];
  for (const c of cands) {
    const k = c.player.toLowerCase();
    if (out.has(k)) continue;

    const ourImplied = c.team === game.home ? sim.projHome : sim.projAway;
    const mktImplied = c.team === game.home ? mktHome : mktAway;
    if (mktImplied <= 0) continue;
    const teamFactor = Math.max(0.7, Math.min(1.4, ourImplied / mktImplied));

    // Usage tilt: featured players get the extra scoring, fringe players don't.
    const share = teamUsage[c.team] ? (usage.get(k) ?? 0) / teamUsage[c.team]! : 0;
    const avgShare = teamUsage[c.team] ? 1 / new Set(props.filter((p) => p.team === c.team).map((p) => p.player)).size : 0;
    const usageTilt = avgShare > 0 ? Math.max(0.85, Math.min(1.25, 0.85 + 0.4 * (share / avgShare))) : 1;

    const impliedProb = americanToProb(c.price);
    // Vig-free market anchor, then apply our tilts, then calibrate back toward the
    // (well-priced) market so featured-player enthusiasm can't over-rate a scorer.
    const anchor = Math.min(0.95, impliedProb * DEVIG);
    const raw = anchor * teamFactor * usageTilt;
    const prob = calibrateTdProb(raw, anchor, tdCal);
    const profit = americanToProfit(c.price);
    const ev = prob * profit - (1 - prob);
    const edge = prob - impliedProb;
    const units = Math.min(0.5, kellyUnits(prob, c.price)); // longshot variance: cap at 0.5u
    picks.push({
      player: c.player,
      team: c.team,
      price: c.price,
      book: 'DraftKings',
      prob,
      impliedProb,
      edge,
      ev,
      units,
      trueUnits: sharpUnits(prob, c.price),
    });
  }
  return picks;
}

function maxEv(picks: AnytimeTdPick[]): AnytimeTdPick | undefined {
  return picks.reduce<AnytimeTdPick | undefined>(
    (best, p) => (!best || p.ev > best.ev ? p : best),
    undefined,
  );
}

/** Rank longshots by EV weighted toward likelihood — profitable but as live as possible. */
function bestLongshot(picks: AnytimeTdPick[]): AnytimeTdPick | undefined {
  const score = (p: AnytimeTdPick) => p.ev * (1 + p.prob);
  return picks.reduce<AnytimeTdPick | undefined>(
    (best, p) => (!best || score(p) > score(best) ? p : best),
    undefined,
  );
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

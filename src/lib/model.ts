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
import { bestProp, bestProps, bestPropAlts } from './props';
import { homeCoverProb, overProb, simulateGame, type GameSim } from './simulation';
import { passesConviction } from './calibration';
import { calibrateTdProb, getTdCalibration, getPropResidualSds } from './props-model';
import { softTotalEdge } from './segments';
import { gradeDisconnect, MARGIN_SD, TOTAL_SD, type Disconnect } from './disconnect';
import { buildAltPicks, type AltPick } from './alt-lines';
import { computeGameScript, type GameScript } from './game-script';
import type { Ratings } from './form';
import { WEEK1_HISTORICAL_PICKS, type HistoricalPickOverride } from '@/data/historicalPicks';

/**
 * The model layer. Every game is run through the Monte-Carlo simulation engine
 * (see simulation.ts); spread, moneyline and total picks are read off the same
 * simulated score distribution, then blended with the vig-free market price for
 * staking. Provisional stakes use one-eighth Kelly, capped at 0.5 units until
 * the live-pick archive demonstrates that model probabilities are calibrated.
 */

export const MODEL_WEIGHT = 0.3; // default provisional model weight until live validation establishes calibration

// Reduce reliance on markets with recent losses; all remain market-anchored.
const WEIGHT_SPREAD = 0.4;
const WEIGHT_MONEYLINE = 0.25;
const WEIGHT_TOTAL = 0.3;
const WEIGHT_PROP = 0.25;

// Modest conviction bump for the validated situational-total spots (see segments.ts).
// Kept small because the segment edge is promising but not yet proven live.
const SOFT_TOTAL_BUMP = 1.2;

// Live picks are not yet proven profitable out of sample; limit model exposure.
const KELLY_FRACTION = 0.125;
const MAX_TRUE_UNITS = 0.5;
const TOTAL_MAX_UNITS = 0.5;

// Book minimum of $2.50/bet = 0.25u at the $10 default unit. Surfaced +EV bets
// are rounded up to this so they're placeable; sub-floor non-+EV bets are dropped.
const MIN_STAKE_UNITS = 0.25;

// Newer prop markets (added round 29) aren't yet tracker-validated — size them
// provisionally smaller than the core yardage/reception markets.
const NEW_PROP_MARKETS = new Set<string>([
  'Pass TDs',
  'Pass Attempts',
  'Completions',
  'Rush Attempts',
  'Interceptions',
  'Rush + Rec Yards',
]);

// Provisional conviction stake on the same model/market blend used elsewhere.
function trueUnitsFor(
  modelProb: number,
  marketProb: number,
  price: number,
  weight = MODEL_WEIGHT,
): number {
  return sharpUnits(
    weight * modelProb + (1 - weight) * marketProb,
    price,
    KELLY_FRACTION,
    MAX_TRUE_UNITS,
  );
}

export function blendPickProbability(
  market: 'Spread' | 'Moneyline' | 'Total' | 'Prop' | 'Alt Spread' | 'Alt Total',
  modelProb: number,
  marketProb: number,
): number {
  const weight =
    market === 'Prop'
      ? WEIGHT_PROP
      : market === 'Total' || market === 'Alt Total'
        ? WEIGHT_TOTAL
        : market === 'Spread' || market === 'Alt Spread'
          ? WEIGHT_SPREAD
          : WEIGHT_MONEYLINE;
  return weight * modelProb + (1 - weight) * marketProb;
}

function consensus(books: BookLine[]) {
  // Use the primary book as the anchor for determining the model's preferred
  // direction. Each candidate's probability and value are evaluated at its own
  // exact book line before a placement quote is selected.
  const b = books[0];
  return { spread: b.spread, total: b.total };
}

function bestPrice<T extends BookLine>(books: T[], pick: (b: T) => number) {
  let best = books[0];
  for (const b of books) if (pick(b) > pick(best)) best = b;
  return { book: best.book, price: pick(best), quote: best };
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
  /** Alternate-line value (key-number spreads / strong-disconnect totals). */
  altPicks?: AltPick[];
  locked?: boolean;
  topPick: ModelPick;
  /** Projected game script (high/low scoring, blowout) from the sim. */
  script?: GameScript;
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
  disconnect?: Disconnect;
  /** Structured beat-writer/role signal reason (e.g. "lead/goal-line role"). */
  note?: string;
  /** Bearish status (questionable/reduced/out) — a warning, never a reason to bet. */
  caution?: string;
  /** Aligned with the projected game script (blowout usage tilt). */
  narrative?: boolean;
  scriptTag?: string;
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

  // Keep the displayed recommendation stake aligned with the provisional
  // conviction stake instead of overriding it with a flat, larger unit.
  const flat = (p: ModelPick): ModelPick =>
    game.week >= 2 && p.units > 0
      ? { ...p, units: Math.min(MAX_TRUE_UNITS, p.trueUnits ?? p.units) }
      : p;
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
      ).map((e) => ({ pick: flat(buildPropPick(game, e.prop, { prob: e.prob, edge: e.edge })), detail: e.prop }));

  // Alternate ("N+") prop rungs with real book value, priced vs our projection.
  // Locked/historical games keep only their frozen prop — no new alts injected.
  if (!historicalProp) {
    const chosen = new Set(props.map((p) => p.detail.player.toLowerCase()));
    const altProps = bestPropAlts(
      game,
      game.livePropAlts,
      game.livePropLines,
      {
        projHome: sim.projHome,
        projAway: sim.projAway,
        marginMean: sim.marginMean,
        totalMean: sim.totalMean,
      },
      { minEdge: 0.05, limit: 2 },
    )
      // Don't double-list a player already on the main-line board.
      .filter((e) => !chosen.has(e.prop.player.toLowerCase()))
      .map((e) => ({ pick: flat(buildPropPick(game, e.prop, { prob: e.prob, edge: e.edge })), detail: e.prop }));
    props.push(...altProps);
  }

  const candidates = [spreadPick, mlPick, totalPick, propPickFlat];
  const topPick = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));

  const atdPicks = evaluateAnytimeTds(game, sim, con);
  for (const p of atdPicks) p.disconnect = gradeDisconnect(p.edge);

  // Reconciled anytime-TD book: LONGSHOTS ONLY (+500 and up, up to +3000) that
  // have value. Within that floor, show a scorer when it's genuinely +EV (>=2%),
  // OR when a News/Narrative signal backs it — the scraped edge the market hasn't
  // priced yet. Ranked so news-driven value leads; sub-EV news/narrative leans get
  // a tiny sprinkle so they're bettable but can't sink the book.
  const LONGSHOT_MIN = 500;
  const SPRINKLE = 0.15;
  const atdScore = (p: AnytimeTdPick) => p.ev + (p.note ? 1 : 0) + (p.narrative ? 0.25 : 0);
  const longshotTds = atdPicks
    .filter((p) => p.price >= LONGSHOT_MIN && (p.ev >= 0.02 || p.note || p.narrative))
    .map((p) =>
      p.ev >= 0.02
        ? p
        : { ...p, units: Math.max(p.units, SPRINKLE), trueUnits: Math.max(p.trueUnits ?? 0, SPRINKLE) },
    )
    .sort((a, b) => atdScore(b) - atdScore(a));
  const anytimeTd = longshotTds[0];
  const anytimeTdLongshot = longshotTds[1];

  // Attach a market-disconnect score to every pick (magnitude of value vs the
  // price). Display/ranking only — edge already drives staking, so no double-count.
  const propSds = getPropResidualSds();
  spreadPick.disconnect = gradeDisconnect(spreadPick.edge, {
    projection: sim.marginMean,
    line: spreadPick.line,
    sd: MARGIN_SD,
  });
  totalPick.disconnect = gradeDisconnect(totalPick.edge, {
    projection: sim.totalMean,
    line: totalPick.line,
    sd: TOTAL_SD,
  });
  mlPick.disconnect = gradeDisconnect(mlPick.edge);
  if (upsetPick) upsetPick.disconnect = gradeDisconnect(upsetPick.edge);
  for (const { pick, detail } of props) {
    pick.disconnect = gradeDisconnect(pick.edge, {
      projection: detail.projection,
      line: detail.line,
      sd: propSds[detail.market as keyof typeof propSds],
    });
  }
  propPickFlat.disconnect =
    props.find((p) => p.pick === propPickFlat)?.pick.disconnect ??
    gradeDisconnect(propPickFlat.edge, {
      projection: propDetail.projection,
      line: propDetail.line,
      sd: propSds[propDetail.market as keyof typeof propSds],
    });

  // Narrative lane: tag picks aligned with the projected game script. News lane:
  // label a prop whose player has a structured beat-writer/role signal.
  const script = computeGameScript(sim, game.home, game.away);
  const overSide = (s: string) => /over/i.test(s);
  if (totalPick.situational) {
    totalPick.narrative = true;
    totalPick.scriptTag = totalPick.situational;
  } else if (
    (totalPick.side === 'over' && script.scoring === 'high') ||
    (totalPick.side === 'under' && script.scoring === 'low')
  ) {
    totalPick.narrative = true;
    totalPick.scriptTag = script.tags[0];
  }
  const tagProp = (pick: ModelPick, side: string, player: string) => {
    const sig = game.playerSignals?.[player.toLowerCase()];
    if (sig) pick.note = sig.reason;
    if (
      (overSide(side) && script.scoring === 'high') ||
      (!overSide(side) && script.scoring === 'low')
    ) {
      pick.narrative = true;
      pick.scriptTag = script.tags[0];
    }
  };
  for (const { pick, detail } of props) tagProp(pick, detail.side, detail.player);
  tagProp(propPickFlat, propDetail.side, propDetail.player);

  // Always surface the single best scorer; add a 2nd/3rd ONLY when they carry real
  // value (+EV or a news signal) — narrative-only extras don't pad the card. So
  // most games show 1, a couple show 2-3 when there's genuine upside.
  const top = longshotTds[0];
  const extras = longshotTds.slice(1).filter((p) => p.ev >= 0.02 || !!p.note).slice(0, 2);
  const anytimeTds = top ? [top, ...extras] : [];

  // Alternate-line value: price the book's real alt ladder against our sim.
  // Narrow by design (key-number spreads, >=1σ totals) and small-capped.
  const altPicks = buildAltPicks(game, sim, spreadPick, totalPick);

  // Correlation cap: the total AND props all key off the same game script, so one
  // game can't sink a stack of correlated bets (the 16u PIT@CLE unders). Totals are
  // our weakest live market, so they're scaled in the budget too — not protected.
  const GAME_CORR_CAP = 4;
  const corr = [totalPick, ...props.map((p) => p.pick)];
  const corrTrue = corr.reduce((s, p) => s + (p.trueUnits ?? 0), 0);
  if (corrTrue > GAME_CORR_CAP) {
    const f = GAME_CORR_CAP / corrTrue;
    for (const p of corr) if (p.trueUnits) p.trueUnits = Number((p.trueUnits * f).toFixed(2));
  }

  // Book minimum: $2.50/bet = 0.25u at the $10 default unit. Round genuine +EV
  // bets UP to the floor so every surfaced play is actually placeable; drop
  // sub-floor bets that aren't +EV (narrative ATD darts) rather than force a
  // $2.50 −EV position. Applied last so it wins over the correlation scaling.
  const floorStake = (p: { trueUnits?: number }, keep: boolean) => {
    const t = p.trueUnits ?? 0;
    if (t > 0 && t < MIN_STAKE_UNITS) p.trueUnits = keep ? MIN_STAKE_UNITS : 0;
  };
  for (const p of [spreadPick, mlPick, totalPick, propPickFlat]) floorStake(p, p.edge > 0);
  if (upsetPick) floorStake(upsetPick, upsetPick.edge > 0);
  for (const { pick } of props) floorStake(pick, pick.edge > 0);
  for (const alt of altPicks) floorStake(alt, alt.edge > 0);
  for (const td of anytimeTds) floorStake(td, td.ev > 0);
  if (anytimeTd) floorStake(anytimeTd, anytimeTd.ev > 0);
  if (anytimeTdLongshot) floorStake(anytimeTdLongshot, anytimeTdLongshot.ev > 0);

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
    altPicks,
    topPick,
    script,
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
  // The chosen side must be favored; the live Bet Now filter tests value vs market.
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
    units: conviction
      ? blendUnits(chosen.prob, chosen.marketProb, chosen.price, WEIGHT_SPREAD)
      : 0,
    trueUnits: conviction
      ? trueUnitsFor(chosen.prob, chosen.marketProb, chosen.price, WEIGHT_SPREAD)
      : 0,
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
    takeHome ? priced.quote.moneylineHome : priced.quote.moneylineAway,
    takeHome ? priced.quote.moneylineAway : priced.quote.moneylineHome,
  );
  const edge = prob - marketProb;
  // The chosen side must be favored; the live Bet Now filter tests value vs market.
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
    units: conviction
      ? blendUnits(prob, marketProb, priced.price, WEIGHT_MONEYLINE)
      : 0,
    trueUnits: conviction
      ? trueUnitsFor(prob, marketProb, priced.price, WEIGHT_MONEYLINE)
      : 0,
    factors: [],
  };
}

function buildTotalPick(game: Game, sim: GameSim, conTotal: number, conSpread = 0): ModelPick {
  const takeOver = overProb(sim, conTotal) >= 0.5;
  let best:
    | {
        book: Game['books'][number];
        price: number;
        line: number;
        prob: number;
        marketProb: number;
        ev: number;
      }
    | undefined;
  for (const book of game.books) {
    const over = overProb(sim, book.total);
    const prob = takeOver ? over : 1 - over;
    const price = takeOver ? book.overPrice : book.underPrice;
    const marketProb = noVigProb(
      takeOver ? book.overPrice : book.underPrice,
      takeOver ? book.underPrice : book.overPrice,
    );
    const ev = prob * americanToProfit(price) - (1 - prob);
    if (!best || ev > best.ev)
      best = { book, price, line: book.total, prob, marketProb, ev };
  }
  const chosen = best!;
  const edge = chosen.prob - chosen.marketProb;
  // Validated situational totals edge (15-season segment hunt): modest, tagged bump.
  const soft = softTotalEdge(game, conSpread);
  const baseTrue = trueUnitsFor(chosen.prob, chosen.marketProb, chosen.price, WEIGHT_TOTAL);
  // Totals are the weakest live market (−27.6% W3–W4, ~0 CLV) — cap tighter than sides.
  const totalTrue = soft.active
    ? Math.min(TOTAL_MAX_UNITS, Number((baseTrue * SOFT_TOTAL_BUMP).toFixed(2)))
    : Math.min(TOTAL_MAX_UNITS, baseTrue);
  return {
    gameId: game.id,
    type: 'Total',
    selection: `${takeOver ? 'Over' : 'Under'} ${chosen.line.toFixed(1)}`,
    side: takeOver ? 'over' : 'under',
    book: chosen.book.book,
    price: chosen.price,
    line: chosen.line,
    marketProb: chosen.marketProb,
    modelProb: chosen.prob,
    edge,
    confidence: confidenceScore(chosen.prob, edge),
    units: blendUnits(chosen.prob, chosen.marketProb, chosen.price, WEIGHT_TOTAL),
    trueUnits: totalTrue,
    situational: soft.active ? `Situational total · ${soft.reason}` : undefined,
    factors: [],
  };
}

function buildPropPick(game: Game, p: PlayerProp, ev?: { prob: number; edge: number }): ModelPick {
  const marketProb = americanToProb(p.price);
  // Use the real model probability when the caller has it. The confidence proxy
  // (clamped 50–90%) is one-sided and WRONG for sub-50% alt rungs — it inflates
  // both the shown value and the Kelly stake on longshot "N+" lottery tickets.
  const prob = ev ? ev.prob : Math.max(0.5, Math.min(0.9, p.confidence / 100));
  const edge = ev ? ev.edge : prob - marketProb;
  // Low-variance markets (esp. Receptions, SD~2.2) inflate the edge, which inflates
  // the Kelly stake on what are really thin reads. Dampen + hard-cap prop stakes so
  // one noisy prop can't balloon into a 3u bet.
  const damp = p.market === 'Receptions' ? 0.5 : 0.8;
  // Stake caps by reliability: alt "N+" rungs are high-variance lottery tickets
  // (tightest); the newer markets are provisional until the tracker validates them;
  // core yardage/receptions keep the standard cap.
  const [unitCap, trueCap] = p.alt
    ? [0.25, MAX_TRUE_UNITS]
    : NEW_PROP_MARKETS.has(p.market)
      ? [MAX_TRUE_UNITS, MAX_TRUE_UNITS]
      : [MAX_TRUE_UNITS, MAX_TRUE_UNITS];
  const units = Math.min(
  unitCap,
  blendUnits(prob, marketProb, p.price, WEIGHT_PROP) * damp,
  );
  const trueUnits = Math.min(
    trueCap,
    trueUnitsFor(prob, marketProb, p.price, WEIGHT_PROP) * damp,
  );
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
    units,
    trueUnits,
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
  const rushW = new Map<string, number>();
  const recW = new Map<string, number>();
  for (const p of props) {
    if (p.market !== 'Rush Yards' && p.market !== 'Receiving Yards') continue;
    // Next man up: an OUT player's workload vacates, so his share redistributes to
    // teammates (raising the backup's TD prob) instead of diluting the pool.
    if (out.has(p.player.toLowerCase())) continue;
    const k = p.player.toLowerCase();
    const w = p.market === 'Rush Yards' ? p.line * 1.15 : p.line; // rushing scores slightly more
    usage.set(k, (usage.get(k) ?? 0) + w);
    teamUsage[p.team] = (teamUsage[p.team] ?? 0) + w;
    if (p.market === 'Rush Yards') rushW.set(k, (rushW.get(k) ?? 0) + p.line);
    else recW.set(k, (recW.get(k) ?? 0) + p.line);
  }

  // Projected game script: in a blowout the leader runs clock (lead RB rush TDs ↑)
  // and the trailer throws to catch up (pass-catcher receiving TDs ↑).
  const blowout = Math.abs(sim.marginMean) >= 10;
  const leader = sim.marginMean > 0 ? game.home : game.away;
  const trailer = sim.marginMean > 0 ? game.away : game.home;

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
    // Blowout game-script tilt (bounded): clock-killing lead RB / chasing trailer's
    // pass-catchers get a modest bump — a real second-order effect the base usage
    // model doesn't capture.
    let scriptMult = 1;
    let scriptTag: string | undefined;
    if (blowout) {
      const rW = rushW.get(k) ?? 0;
      const cW = recW.get(k) ?? 0;
      if (c.team === leader && rW >= cW && rW > 0) {
        scriptMult = 1.12;
        scriptTag = 'blowout: lead-team run ↑';
      } else if (c.team === trailer && cW > rW && cW > 0) {
        scriptMult = 1.1;
        scriptTag = 'blowout: trail-team pass ↑';
      }
    }
    const raw = anchor * teamFactor * usageTilt * scriptMult;
    let prob = calibrateTdProb(raw, anchor, tdCal);

    // Structured beat-writer/role signal. A lead/goal-line promotion gives an
    // INDEPENDENT TD floor that can exceed the market anchor — the real disconnect
    // when the price hasn't caught up to the role. Role up/down is a bounded nudge.
    const sig = game.playerSignals?.[k];
    if (sig) {
      if (sig.lead) {
        const teamTDs = Math.max(1, ourImplied / 7);
        const indep = Math.max(0.2, Math.min(0.55, 0.14 + 0.1 * teamTDs));
        prob = Math.min(0.6, Math.max(prob, 0.5 * prob + 0.5 * indep));
      }
      if (sig.roleBoost !== 1) prob = Math.max(0.01, Math.min(0.75, prob * sig.roleBoost));
    }
    // Narrative lane: blowout usage tilt OR a high-scoring team tailwind.
    if (!scriptTag && ourImplied >= 27) scriptTag = `high-scoring (${c.team})`;
    // News lane = BULLISH role news only (promotion / next-man-up). A bearish status
    // (questionable / reduced / out) already dampened prob above, so it reads as a
    // caution — never as a reason to bet (it must not boost ranking, tier or filters).
    const bullish = !!sig && (sig.lead || sig.roleBoost > 1);
    const note = bullish ? sig!.reason : undefined;
    const caution = sig && !bullish ? sig.reason : undefined;
    const narrative = !!scriptTag;

    const profit = americanToProfit(c.price);
    const ev = prob * profit - (1 - prob);
    const edge = prob - impliedProb;
    // Keep speculative anytime-TD exposure below the main-market cap.
    const units = Math.min(0.25, kellyUnits(prob, c.price, KELLY_FRACTION));
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
      trueUnits: sharpUnits(prob, c.price, KELLY_FRACTION, 0.25),
      note,
      caution,
      narrative,
      scriptTag,
    });
  }
  return picks;
}

function detectUpset(game: Game, sim: GameSim, conSpread: number): ModelPick | undefined {
  const dogIsHome = conSpread > 0;
  const dogWinProb = dogIsHome ? sim.homeWinProb : 1 - sim.homeWinProb;
  const priced = dogIsHome
    ? bestPrice(game.books, (b) => b.moneylineHome)
    : bestPrice(game.books, (b) => b.moneylineAway);
  if (priced.price <= 0) return undefined;
  const marketProb = noVigProb(
    dogIsHome ? priced.quote.moneylineHome : priced.quote.moneylineAway,
    dogIsHome ? priced.quote.moneylineAway : priced.quote.moneylineHome,
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

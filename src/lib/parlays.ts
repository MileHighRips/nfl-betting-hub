import { americanToProb, americanToProfit, kellyUnits } from './odds';
import { TEAMS } from './teams';
import type { GameAnalysis, AnytimeTdPick } from './model';
import type { ModelPick, PlayerProp } from './types';

export interface ParlayLeg {
  gameId: string;
  matchup: string;
  label: string; // e.g. "Spread", "Over", "Prop", "Anytime TD"
  selection: string;
  price: number;
  prob: number; // model probability
  edge: number;
}

export interface ParlaySuggestion {
  id: string;
  kind: 'Parlay' | 'SGP';
  legs: ParlayLeg[];
  americanOdds: number;
  modelProb: number;
  ev: number; // expected profit per 1u
  units: number;
  /** SGP payouts are model-estimated (no live SGP price feed) — verify at the book. */
  estimate?: boolean;
}

// Same-game legs are positively correlated but books shade the payout. Estimate
// conservatively: modest correlation uplift on the joint probability, a real
// haircut on the payout, and only surface with an EV buffer for the guesswork.
const SGP_UPLIFT = 1.12;
const SGP_HAIRCUT = 0.72;
const SGP_EV_BUFFER = 0.03;

function decimalToAmerican(dec: number): number {
  if (dec <= 1) return 0;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

function matchupOf(a: GameAnalysis): string {
  return `${TEAMS[a.game.away].abbr} @ ${TEAMS[a.game.home].abbr}`;
}

function legFromPick(a: GameAnalysis, p: ModelPick, label: string): ParlayLeg {
  return {
    gameId: a.game.id,
    matchup: matchupOf(a),
    label,
    selection: p.selection,
    price: p.price,
    prob: p.modelProb,
    edge: p.edge,
  };
}

function legFromProp(a: GameAnalysis, pick: ModelPick, detail: PlayerProp): ParlayLeg {
  return {
    gameId: a.game.id,
    matchup: matchupOf(a),
    label: 'Prop',
    selection: `${detail.player} ${detail.side} ${detail.line} ${detail.market}`,
    price: pick.price,
    prob: pick.modelProb,
    edge: pick.edge,
  };
}

function legFromTd(a: GameAnalysis, td: AnytimeTdPick): ParlayLeg {
  return {
    gameId: a.game.id,
    matchup: matchupOf(a),
    label: 'Anytime TD',
    selection: `${td.player} Anytime TD`,
    price: td.price,
    prob: td.prob,
    edge: td.edge,
  };
}

/** The single strongest +EV leg in a game (for cross-game parlays). */
function bestLeg(a: GameAnalysis): ParlayLeg | undefined {
  const legs: ParlayLeg[] = [];
  for (const [p, label] of [
    [a.spread, 'Spread'],
    [a.total, 'Total'],
    [a.moneyline, 'Moneyline'],
  ] as const) {
    if (p.edge > 0.02 && p.units > 0) legs.push(legFromPick(a, p, label));
  }
  for (const pr of a.props) if (pr.pick.edge > 0.02) legs.push(legFromProp(a, pr.pick, pr.detail));
  for (const td of a.anytimeTds) if (td.ev > 0.03) legs.push(legFromTd(a, td));
  if (!legs.length) return undefined;
  return legs.reduce((b, l) => (l.edge > b.edge ? l : b));
}

function makeStraight(kind: 'Parlay', legs: ParlayLeg[]): ParlaySuggestion | undefined {
  const decimal = legs.reduce((d, l) => d * (1 + americanToProfit(l.price)), 1);
  const joint = legs.reduce((p, l) => p * l.prob, 1);
  const ev = joint * decimal - 1;
  if (ev <= 0) return undefined;
  const american = decimalToAmerican(decimal);
  return {
    id: `par-${legs.map((l) => l.gameId).join('-')}`,
    kind,
    legs,
    americanOdds: american,
    modelProb: joint,
    ev,
    units: Math.min(0.5, kellyUnits(joint, american)),
  };
}

/** A correlated same-game parlay off the favored side + that team's skill value. */
export function sgpForGame(a: GameAnalysis): ParlaySuggestion | undefined {
  const favHome = a.moneyline.side === 'home_ml';
  const favTeam = favHome ? a.game.home : a.game.away;
  const legs: ParlayLeg[] = [];

  const side = a.spread.edge >= a.moneyline.edge ? a.spread : a.moneyline;
  const sideLabel = side === a.spread ? 'Spread' : 'Moneyline';
  if (side.edge > 0 && side.units > 0) legs.push(legFromPick(a, side, sideLabel));

  const favProp = a.props.find(
    (pr) => pr.detail.team === favTeam && pr.detail.side === 'Over' && pr.pick.edge > 0,
  );
  if (favProp) legs.push(legFromProp(a, favProp.pick, favProp.detail));

  const favTd = a.anytimeTds.find((td) => td.team === favTeam && td.ev > 0);
  if (favTd) legs.push(legFromTd(a, favTd));

  if (legs.length < 2) return undefined;

  const decimalRaw = legs.reduce((d, l) => d * (1 + americanToProfit(l.price)), 1);
  const jointRaw = legs.reduce((p, l) => p * l.prob, 1);
  const decimal = decimalRaw * SGP_HAIRCUT;
  const joint = Math.min(0.95, jointRaw * SGP_UPLIFT);
  const ev = joint * decimal - 1;
  if (ev <= SGP_EV_BUFFER) return undefined;
  const american = decimalToAmerican(decimal);
  return {
    id: `sgp-${a.game.id}`,
    kind: 'SGP',
    legs,
    americanOdds: american,
    modelProb: joint,
    ev,
    units: Math.min(0.3, kellyUnits(joint, american)),
    estimate: true,
  };
}

/**
 * Build the week's +EV cross-game straight parlays from the strongest
 * independent legs. Same-game parlays are surfaced per game (see sgpForGame).
 */
export function buildParlays(analyses: GameAnalysis[]): ParlaySuggestion[] {
  const out: ParlaySuggestion[] = [];

  const perGame = analyses
    .map(bestLeg)
    .filter((l): l is ParlayLeg => Boolean(l))
    .sort((x, y) => y.edge - x.edge);
  if (perGame.length >= 2) {
    const two = makeStraight('Parlay', perGame.slice(0, 2));
    if (two) out.push(two);
  }
  if (perGame.length >= 3) {
    const three = makeStraight('Parlay', perGame.slice(0, 3));
    if (three) out.push(three);
  }

  return out.filter((p) => p.ev > 0).sort((x, y) => y.ev - x.ev);
}

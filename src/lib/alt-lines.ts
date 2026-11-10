import type { GameSim } from './simulation';
import type { AltLadder, AltRung, Game, ModelPick } from './types';
import { americanToProb, americanToProfit, kellyUnits, noVigProb, sharpUnits } from './odds';
import { gradeDisconnect, TOTAL_SD, type Disconnect } from './disconnect';

/**
 * Alternate-line value engine. We price the BOOK's actual alternate ladder
 * against our own Monte-Carlo distribution (the same empirical margin/total
 * samples that drive the main-line picks), so an alt pick is only ever real
 * book value — never a fabricated "fair" number.
 *
 * Deliberately narrow, because alternate ladders lean on the TAIL of the
 * distribution (least-trustworthy) and carry fat vig:
 *   - Spreads: only rungs that CROSS an NFL key number (3 or 7) — the one alt
 *     play backed by model-independent push-frequency theory.
 *   - Totals: only when the main-line total already disagrees by >= 1 sigma, so
 *     we're locking a better number on a view we hold, not inventing one.
 * Every candidate must also beat the main-line EV by a real margin and stays
 * hard-capped small so a tail miss can't do real damage.
 */

export interface AltPick {
  gameId: string;
  type: 'Alt Spread' | 'Alt Total';
  selection: string;
  side: 'home_spread' | 'away_spread' | 'over' | 'under';
  line: number;
  price: number;
  marketProb: number; // de-vigged where the paired rung exists, else raw implied
  modelProb: number;
  edge: number;
  ev: number; // expected profit per 1u
  mainEv: number; // EV of the main-line pick in the same market
  units: number;
  trueUnits: number;
  reason: string;
  disconnect?: Disconnect;
}

const KEY_NUMBERS = [3, 7];
const EV_BEAT = 0.02; // alt must beat the main-line EV by >= 2 points
const TOTAL_SIGMA_GATE = 1.0; // only chase alt totals on a >=1 sigma disagreement
const UNIT_CAP = 0.25; // provisional one-eighth-Kelly cap for tail markets
const TRUE_CAP = 0.5;

/** Push-aware cover probability for a spread rung, from the sim's margin samples. */
function spreadCoverProb(sim: GameSim, line: number, side: 'home' | 'away'): number {
  let win = 0;
  let push = 0;
  for (let i = 0; i < sim.n; i++) {
    const m = sim.margins[i];
    const r = side === 'home' ? m + line : line - m;
    if (r > 0) win++;
    else if (r === 0) push++;
  }
  const decided = sim.n - push;
  return decided > 0 ? win / decided : 0.5;
}

/** Push-aware over/under probability for a total rung, from the sim's total samples. */
function totalCoverProb(sim: GameSim, line: number, side: 'over' | 'under'): number {
  let win = 0;
  let push = 0;
  for (let i = 0; i < sim.n; i++) {
    const t = sim.totals[i];
    const r = side === 'over' ? t - line : line - t;
    if (r > 0) win++;
    else if (r === 0) push++;
  }
  const decided = sim.n - push;
  return decided > 0 ? win / decided : 0.5;
}

function evOf(prob: number, price: number): number {
  return prob * americanToProfit(price) - (1 - prob);
}

/** True if a key number (3/7) lies strictly between the main line and the alt line. */
function crossesKey(mainLine: number, altLine: number): boolean {
  const lo = Math.min(Math.abs(mainLine), Math.abs(altLine));
  const hi = Math.max(Math.abs(mainLine), Math.abs(altLine));
  return KEY_NUMBERS.some((k) => k > lo && k < hi);
}

function devig(rung: AltRung, pair: AltRung[] | undefined): number {
  const opp = pair?.find((r) => Math.abs(Math.abs(r.line) - Math.abs(rung.line)) < 0.01);
  return opp ? noVigProb(rung.price, opp.price) : americanToProb(rung.price);
}

/** Best alt-spread rung on the model's side that crosses a key and beats the main EV. */
function bestAltSpread(game: Game, sim: GameSim, main: ModelPick): AltPick | undefined {
  const ladder = game.altLines;
  const takeHome = main.side === 'home_spread';
  const rungs = takeHome ? ladder?.spreadHome : ladder?.spreadAway;
  if (!rungs?.length) return undefined;
  const pair = takeHome ? ladder?.spreadAway : ladder?.spreadHome;
  const mainEv = evOf(main.modelProb, main.price);

  let best: AltPick | undefined;
  for (const rung of rungs) {
    if (!crossesKey(main.line, rung.line)) continue;
    const prob = spreadCoverProb(sim, rung.line, takeHome ? 'home' : 'away');
    const marketProb = devig(rung, pair);
    const edge = prob - marketProb;
    const ev = evOf(prob, rung.price);
    if (edge <= 0 || ev <= 0 || ev < mainEv + EV_BEAT) continue;
    if (best && ev <= best.ev) continue;
    const crossed = KEY_NUMBERS.find((k) => crossesKey(main.line, rung.line) && k <= Math.max(Math.abs(main.line), Math.abs(rung.line)));
    best = {
      gameId: game.id,
      type: 'Alt Spread',
      selection: `${main.selection.split(' ').slice(0, -1).join(' ')} ${rung.line > 0 ? '+' : ''}${rung.line.toFixed(1)}`,
      side: takeHome ? 'home_spread' : 'away_spread',
      line: rung.line,
      price: rung.price,
      marketProb,
      modelProb: prob,
      edge,
      ev,
      mainEv,
      units: Math.min(UNIT_CAP, kellyUnits(prob, rung.price, 0.125)),
      trueUnits: Math.min(TRUE_CAP, sharpUnits(prob, rung.price, 0.125, TRUE_CAP)),
      reason: `crosses key ${crossed ?? KEY_NUMBERS.join('/')} · +${Math.round(edge * 100)}% vs mkt`,
      disconnect: gradeDisconnect(edge),
    };
  }
  return best;
}

/** Best alt-total rung on the model's side when the main total disagrees >= 1 sigma. */
function bestAltTotal(game: Game, sim: GameSim, main: ModelPick): AltPick | undefined {
  const ladder = game.altLines;
  const sigma = Math.abs(sim.totalMean - main.line) / TOTAL_SD;
  if (sigma < TOTAL_SIGMA_GATE) return undefined;
  const takeOver = sim.totalMean > main.line;
  const rungs = takeOver ? ladder?.over : ladder?.under;
  if (!rungs?.length) return undefined;
  const pair = takeOver ? ladder?.under : ladder?.over;
  const mainEv = evOf(main.modelProb, main.price);

  let best: AltPick | undefined;
  for (const rung of rungs) {
    const prob = totalCoverProb(sim, rung.line, takeOver ? 'over' : 'under');
    const marketProb = devig(rung, pair);
    const edge = prob - marketProb;
    const ev = evOf(prob, rung.price);
    if (edge <= 0 || ev <= 0 || ev < mainEv + EV_BEAT) continue;
    if (best && ev <= best.ev) continue;
    best = {
      gameId: game.id,
      type: 'Alt Total',
      selection: `${takeOver ? 'Over' : 'Under'} ${rung.line.toFixed(1)}`,
      side: takeOver ? 'over' : 'under',
      line: rung.line,
      price: rung.price,
      marketProb,
      modelProb: prob,
      edge,
      ev,
      mainEv,
      units: Math.min(UNIT_CAP, kellyUnits(prob, rung.price, 0.125)),
      trueUnits: Math.min(TRUE_CAP, sharpUnits(prob, rung.price, 0.125, TRUE_CAP)),
      reason: `${sigma.toFixed(1)}σ off market · +${Math.round(edge * 100)}% vs mkt`,
      disconnect: gradeDisconnect(edge),
    };
  }
  return best;
}

/**
 * Evaluate a game's alternate ladder. Returns at most one alt-spread and one
 * alt-total pick (the best qualifying rung on the model's side), or [] when no
 * ladder is posted or nothing clears the gates.
 */
export function buildAltPicks(
  game: Game,
  sim: GameSim,
  mainSpread: ModelPick,
  mainTotal: ModelPick,
): AltPick[] {
  if (!game.altLines) return [];
  const picks: AltPick[] = [];
  const s = bestAltSpread(game, sim, mainSpread);
  if (s) picks.push(s);
  const t = bestAltTotal(game, sim, mainTotal);
  if (t) picks.push(t);
  return picks;
}

/** Whether a ladder actually carries any rungs (for feed/merge guards). */
export function hasLadder(l: AltLadder | undefined): boolean {
  return !!l && !!(l.spreadHome?.length || l.spreadAway?.length || l.over?.length || l.under?.length);
}

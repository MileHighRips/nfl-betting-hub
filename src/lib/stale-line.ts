import type { BookLine } from './types';

/**
 * Stale-line detector. The edge isn't beating the closing number — it's betting
 * a number the market hasn't corrected yet. We compare the OPENING line to the
 * current line: if it has barely moved while the model sees an edge, the price
 * is stale and worth grabbing now; if it has already moved onto our side, the
 * value is being taken (we still likely have CLV); if it moved against us, the
 * window is closing. Requires ESPN's opening line (pre-kickoff games only).
 */

export type LineState = 'stale' | 'steam' | 'toward' | 'away' | 'flat';

export interface LineMovement {
  open: number;
  now: number;
  moved: number; // now - open (signed, points)
  state: LineState;
  label: string;
}

const STALE_MAX_MOVE = 1.0; // points
const STEAM_MOVE = 1.5; // a move this big reflects sharp/consensus money (free proxy)

/**
 * Classify movement RELATIVE TO OUR SIDE. `favSign` is the sign of `moved` that
 * is favorable to our pick (we're beating the close): e.g. for the Over the
 * total rising is +1; for a home favorite the spread dropping is -1. A move in
 * our favor = we already beat the close (+CLV); against us = window closing.
 */
function classify(
  moved: number,
  edge: number,
  favSign: 1 | -1,
): { state: LineState; label: string } {
  const a = Math.abs(moved);
  if (a < 0.25) {
    return edge >= 0.03
      ? { state: 'stale', label: 'Stale line' }
      : { state: 'flat', label: 'Unmoved' };
  }
  const favorable = Math.sign(moved) === favSign;
  if (a >= STEAM_MOVE) {
    return favorable
      ? { state: 'steam', label: `Steam your way +${a.toFixed(1)}` }
      : { state: 'away', label: `Steam against −${a.toFixed(1)}` };
  }
  if (favorable) {
    return { state: 'toward', label: `Beating close +${a.toFixed(1)}` };
  }
  // Moved against us but barely, and we still have edge — treat as still-fresh.
  if (a <= STALE_MAX_MOVE && edge >= 0.03) {
    return { state: 'stale', label: 'Barely moved' };
  }
  return { state: 'away', label: `Moved against −${a.toFixed(1)}` };
}

/** Spread line movement for a pick's game (home-spread basis). */
export function spreadMovement(
  book: BookLine | undefined,
  edge: number,
  side: 'home_spread' | 'away_spread',
): LineMovement | undefined {
  if (book?.openSpread == null) return undefined;
  const moved = Number((book.spread - book.openSpread).toFixed(1));
  // Home backers beat the close when the number drops (−); away backers when it rises (+).
  const favSign: 1 | -1 = side === 'home_spread' ? -1 : 1;
  const { state, label } = classify(moved, edge, favSign);
  return { open: book.openSpread, now: book.spread, moved, state, label };
}

/** Total line movement for a pick's game. */
export function totalMovement(
  book: BookLine | undefined,
  edge: number,
  side: 'over' | 'under',
): LineMovement | undefined {
  if (book?.openTotal == null) return undefined;
  const moved = Number((book.total - book.openTotal).toFixed(1));
  // Over beats the close when the total rises (+); Under when it drops (−).
  const favSign: 1 | -1 = side === 'over' ? 1 : -1;
  const { state, label } = classify(moved, edge, favSign);
  return { open: book.openTotal, now: book.total, moved, state, label };
}

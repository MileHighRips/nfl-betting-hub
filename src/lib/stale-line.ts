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

function classify(moved: number, edge: number): { state: LineState; label: string } {
  const a = Math.abs(moved);
  if (a < 0.25) {
    return edge >= 0.03
      ? { state: 'stale', label: 'Stale line' }
      : { state: 'flat', label: 'Unmoved' };
  }
  if (a >= STEAM_MOVE) {
    return { state: 'steam', label: `Steam ${moved > 0 ? '+' : ''}${moved.toFixed(1)}` };
  }
  if (a <= STALE_MAX_MOVE && edge >= 0.03) {
    return { state: 'stale', label: 'Barely moved' };
  }
  return moved > 0
    ? { state: 'toward', label: `+${moved.toFixed(1)} since open` }
    : { state: 'away', label: `${moved.toFixed(1)} since open` };
}

/** Spread line movement for a pick's game (home-spread basis). */
export function spreadMovement(book: BookLine | undefined, edge: number): LineMovement | undefined {
  if (book?.openSpread == null) return undefined;
  const moved = Number((book.spread - book.openSpread).toFixed(1));
  const { state, label } = classify(moved, edge);
  return { open: book.openSpread, now: book.spread, moved, state, label };
}

/** Total line movement for a pick's game. */
export function totalMovement(book: BookLine | undefined, edge: number): LineMovement | undefined {
  if (book?.openTotal == null) return undefined;
  const moved = Number((book.total - book.openTotal).toFixed(1));
  const { state, label } = classify(moved, edge);
  return { open: book.openTotal, now: book.total, moved, state, label };
}

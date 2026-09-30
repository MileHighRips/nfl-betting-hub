import type { Game } from './types';

/**
 * Validated situational TOTALS edges from the 15-season model zoo
 * (ml/build_model.py segment hunt). Two Over/Under pockets cleared breakeven on
 * ~240-288 games each with a plausible mechanism:
 *   • big rest edge (|rest diff| >= 3 days): +5.6% ROI, 55% — rest reshapes
 *     scoring in ways the total underprices.
 *   • big favorite (|spread| >= 7): +6.1% ROI, 56% — blowout / garbage-time
 *     dynamics the total misses.
 * These are promising, not proven live, so the model applies only a MODEST stake
 * bump here and tags the pick so we can forward-test it before trusting it more.
 */

const REST_EDGE_DAYS = 3;
const BIG_FAVORITE = 7;

export interface SoftTotalEdge {
  active: boolean;
  reason?: string;
}

export function softTotalEdge(game: Game, conSpread: number): SoftTotalEdge {
  const restDiff = Math.abs(game.context.homeRestDays - game.context.awayRestDays);
  if (restDiff >= REST_EDGE_DAYS) return { active: true, reason: `${restDiff}d rest edge` };
  if (Math.abs(conSpread) >= BIG_FAVORITE) {
    return { active: true, reason: `${Math.abs(conSpread).toFixed(1)}-pt favorite` };
  }
  return { active: false };
}

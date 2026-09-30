/**
 * Data-driven calibration, fit from the walk-forward backtest (see backtest.ts,
 * weeks 1-3, closing lines, true model replay). Two robust signals, each seen
 * across independent markets:
 *
 *   • SIDE edges in the coin-flip band (modelProb < 0.55) realized ~25% on both
 *     the spread AND moneyline (n=16 each) — pure noise. Every bucket >= 0.55
 *     was profitable. So we simply do not stake a side we're not >55% on.
 *   • TOTALS stayed profitable at every conviction level, so no floor there.
 *
 * Re-run /api/backtest after model changes and move these with the evidence —
 * never by feel. Locked picks render from their frozen snapshot and are never
 * affected by anything here.
 */
export const CAL = {
  /** Spread & moneyline conviction floor — below this the edge is noise. */
  minSideProb: 0.55,
  /** Totals bet at any favored level (calibration held across all buckets). */
  minTotalProb: 0.5,
} as const;

/** True if a market's model probability clears its data-fit conviction floor. */
export function passesConviction(
  market: 'Spread' | 'Moneyline' | 'Total',
  modelProb: number,
): boolean {
  if (market === 'Total') return modelProb >= CAL.minTotalProb;
  return modelProb >= CAL.minSideProb;
}

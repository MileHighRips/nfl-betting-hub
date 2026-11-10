/**
 * There is not yet enough archived live-pick data to fit a reliable probability
 * threshold. This floor only excludes a side that is not actually favored;
 * Bet Now applies a market-anchored model-value test before showing a bet.
 * Locked picks render from their frozen snapshot and are never affected here.
 */
export const CAL = {
  /** The selected spread or moneyline side must have at least even probability. */
  minSideProb: 0.5,
  /** The selected total side must have at least even probability. */
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

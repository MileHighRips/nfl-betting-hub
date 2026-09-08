// American odds math and probability helpers.

/** Convert American odds to implied probability (includes vig). */
export function americanToProb(odds: number): number {
  if (odds === 0) return 0;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

/** Convert a probability to fair American odds. */
export function probToAmerican(p: number): number {
  if (p <= 0) return Infinity;
  if (p >= 1) return -Infinity;
  return p >= 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100);
}

/** Decimal payout multiplier for American odds (profit per 1 unit staked). */
export function americanToProfit(odds: number): number {
  return odds > 0 ? odds / 100 : 100 / -odds;
}

/** Remove vig from a two-way market, returning the fair probability of side A. */
export function noVigProb(oddsA: number, oddsB: number): number {
  const a = americanToProb(oddsA);
  const b = americanToProb(oddsB);
  const total = a + b;
  return total > 0 ? a / total : a;
}

/** Format American odds with a sign. */
export function formatOdds(odds: number): string {
  if (!isFinite(odds)) return '—';
  const r = Math.round(odds);
  return r > 0 ? `+${r}` : `${r}`;
}

/**
 * Fractional-Kelly stake in units given model edge.
 * Uses quarter-Kelly, capped, scaled to a 1-3 unit display band.
 */
export function kellyUnits(modelProb: number, odds: number, fraction = 0.25): number {
  const b = americanToProfit(odds);
  const q = 1 - modelProb;
  const kelly = (b * modelProb - q) / b;
  if (kelly <= 0) return 0;
  const staked = kelly * fraction;
  // Map fractional-Kelly bankroll fraction to a friendly unit band (1u ≈ 1% roll).
  // Hard cap at 1 unit — never risk more than a single unit on any bet.
  const units = staked * 100;
  return Math.max(0, Math.min(1, Number(units.toFixed(2))));
}

/** Convert a probability edge into a 0-100 display confidence score. */
export function confidenceScore(modelProb: number, edge: number): number {
  // Blend absolute model conviction with the size of the market disagreement.
  const base = modelProb * 100;
  const edgeBoost = Math.max(0, edge) * 120;
  return Math.max(0, Math.min(99, Math.round(base * 0.7 + (50 + edgeBoost) * 0.3)));
}

/** Standard normal CDF for turning projected margins into win probabilities. */
export function normalCdf(x: number): number {
  // Abramowitz & Stegun approximation.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

/**
 * Convert a projected point margin (home perspective) into a home win probability.
 * NFL margin standard deviation is ~13.2 points.
 */
export function marginToWinProb(margin: number, sigma = 13.2): number {
  return normalCdf(margin / sigma);
}

/**
 * Probability a favorite covers a spread given projected margin.
 * `spread` is the home spread (negative if home favored).
 */
export function coverProb(projectedMargin: number, homeSpread: number, sigma = 13.2): number {
  // Home covers if actual margin > -homeSpread.
  return normalCdf((projectedMargin + homeSpread) / sigma);
}

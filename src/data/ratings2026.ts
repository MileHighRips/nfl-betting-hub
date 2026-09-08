import type { TeamAbbr } from '@/lib/types';

/**
 * 2026 team efficiency ratings — the backbone of the drive-level simulation.
 *
 *   offense: points/game scored vs a league-average offense (+ = better)
 *   defense: points/game allowed vs average (+ = LEAKY, − = stingy)
 *   pace:    tempo multiplier on possessions (1.00 = average; fast teams > 1)
 *
 * Net power ≈ offense − defense (kept consistent with the spread ratings). The
 * split is what unlocks realistic, first-principles totals: two great offenses
 * with leaky defenses produce shootouts; two elite defenses grind low. Values
 * are re-centered to a zero mean at load so the league total calibrates.
 */

export interface EfficiencyRating {
  offense: number;
  defense: number;
  pace: number;
}

export const RATINGS_2026: Record<TeamAbbr, EfficiencyRating> = {
  ARI: { offense: 0.5, defense: 1.5, pace: 1.0 },
  ATL: { offense: 1.0, defense: 1.0, pace: 1.0 },
  BAL: { offense: 5.0, defense: -1.0, pace: 1.02 },
  BUF: { offense: 5.5, defense: -1.0, pace: 1.05 },
  CAR: { offense: -2.0, defense: 1.0, pace: 1.0 },
  CHI: { offense: 0.5, defense: -0.5, pace: 1.01 },
  CIN: { offense: 5.5, defense: 3.5, pace: 1.05 },
  CLE: { offense: -5.0, defense: -1.5, pace: 0.95 },
  DAL: { offense: 3.0, defense: 2.0, pace: 1.02 },
  DEN: { offense: 0.5, defense: -3.5, pace: 0.97 },
  DET: { offense: 6.0, defense: 1.0, pace: 1.06 },
  GB: { offense: 3.0, defense: -1.5, pace: 1.0 },
  HOU: { offense: 0.5, defense: -2.5, pace: 0.98 },
  IND: { offense: 1.5, defense: 0.5, pace: 1.0 },
  JAX: { offense: 1.5, defense: 0.0, pace: 1.0 },
  KC: { offense: 3.0, defense: -2.0, pace: 0.98 },
  LV: { offense: -2.0, defense: 0.0, pace: 0.98 },
  LAC: { offense: 1.0, defense: -2.0, pace: 0.95 },
  LAR: { offense: 5.5, defense: -1.5, pace: 1.02 },
  MIA: { offense: 1.5, defense: 2.5, pace: 1.08 },
  MIN: { offense: 1.0, defense: 0.0, pace: 1.0 },
  NE: { offense: 1.0, defense: -1.5, pace: 0.97 },
  NO: { offense: -3.0, defense: 1.0, pace: 0.98 },
  NYG: { offense: -1.5, defense: 0.5, pace: 0.98 },
  NYJ: { offense: -1.5, defense: 0.0, pace: 0.98 },
  PHI: { offense: 3.5, defense: -2.0, pace: 1.03 },
  PIT: { offense: -2.0, defense: -3.0, pace: 0.94 },
  SF: { offense: 2.5, defense: -1.5, pace: 1.0 },
  SEA: { offense: 2.5, defense: -2.0, pace: 1.0 },
  TB: { offense: 2.5, defense: 0.5, pace: 1.0 },
  TEN: { offense: -3.0, defense: 0.0, pace: 0.98 },
  WAS: { offense: 3.5, defense: 1.5, pace: 1.03 },
};

/** Backup-QB value drop (points) applied when a team's starter is out. */
export const QB_DROPOFF: Partial<Record<TeamAbbr, number>> = {
  BUF: 9,
  BAL: 9,
  KC: 8.5,
  LAR: 7.5,
  PHI: 6.5,
  CIN: 7,
  DET: 6,
  GB: 6,
  HOU: 5.5,
  LAC: 6,
  WAS: 6.5,
  MIA: 5.5,
  DAL: 5.5,
};
export const DEFAULT_QB_DROPOFF = 5;

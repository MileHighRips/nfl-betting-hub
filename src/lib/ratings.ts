import { RATINGS_2026, type EfficiencyRating } from '@/data/ratings2026';
import type { TeamAbbr } from './types';

/**
 * Team efficiency profiles for the drive-level simulation. Raw offense/defense
 * ratings are re-centered to a zero league mean so totals calibrate, then
 * combined with in-season form (an Elo-style net delta from real results).
 *
 *   homeExpectedPoints = LEAGUE_AVG_PPG + off[home] + def[away] + hfaShare
 *   awayExpectedPoints = LEAGUE_AVG_PPG + off[away] + def[home] - hfaShare
 *
 * where def[x] is points ALLOWED vs average (+ = leaky), so a leaky opponent
 * defense raises your expected points.
 */

export const LEAGUE_AVG_PPG = 22.7;
export const LEAGUE_AVG_TOTAL = LEAGUE_AVG_PPG * 2;

// Re-center offense and defense to zero mean at module load.
const RAW = Object.values(RATINGS_2026);
const OFF_MEAN = RAW.reduce((s, r) => s + r.offense, 0) / RAW.length;
const DEF_MEAN = RAW.reduce((s, r) => s + r.defense, 0) / RAW.length;

const CENTERED: Record<TeamAbbr, EfficiencyRating> = Object.fromEntries(
  (Object.entries(RATINGS_2026) as [TeamAbbr, EfficiencyRating][]).map(([abbr, r]) => [
    abbr,
    { offense: r.offense - OFF_MEAN, defense: r.defense - DEF_MEAN, pace: r.pace },
  ]),
) as Record<TeamAbbr, EfficiencyRating>;

/** Team-specific home-field edge (points): altitude, crowd, dome, travel hubs. */
const HFA: Partial<Record<TeamAbbr, number>> = {
  SEA: 2.4,
  DEN: 2.6,
  KC: 2.3,
  BUF: 2.2,
  GB: 2.2,
  BAL: 2.1,
  PHI: 2.1,
  NO: 2.1,
  MIN: 2.0,
  PIT: 2.0,
  LAR: 1.5,
  LAC: 1.3,
  JAX: 1.4,
  LV: 1.4,
};
const DEFAULT_HFA = 1.8;

export function homeFieldEdge(team: TeamAbbr): number {
  return HFA[team] ?? DEFAULT_HFA;
}

export interface TeamProfile {
  offense: number; // points/game vs average scored
  defense: number; // points/game vs average allowed (+ = leaky)
  pace: number; // possession tempo multiplier
  net: number; // offense - defense (power rating)
}

/** Efficiency profile with in-season form (net delta) folded in. */
export function teamProfile(abbr: TeamAbbr, formNet = 0): TeamProfile {
  const c = CENTERED[abbr];
  // Split improving/declining form between the offense and defense.
  const offense = c.offense + formNet * 0.5;
  const defense = c.defense - formNet * 0.5;
  return { offense, defense, pace: c.pace, net: offense - defense };
}

/** Opponent defensive stinginess (points; + = tougher) for the prop model. */
export function staticDefense(abbr: TeamAbbr): number {
  return -CENTERED[abbr].defense;
}

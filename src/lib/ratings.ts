import { TEAMS } from './teams';
import type { Team, TeamAbbr } from './types';

/**
 * Points-based offense/defense ratings derived from each team's net power
 * rating and prior-year pass-defense rank. Centered at 0 (points above/below a
 * league-average unit). By construction offense + defense = net rating, so the
 * split preserves the spread while unlocking team-total and prop modeling.
 *
 *   homeExpectedPoints = LEAGUE_AVG_PPG + off[home] - def[away] + hfaShare
 *   awayExpectedPoints = LEAGUE_AVG_PPG + off[away] - def[home] - hfaShare
 */

export const LEAGUE_AVG_PPG = 22.6;
export const LEAGUE_AVG_TOTAL = LEAGUE_AVG_PPG * 2;

/** Team-specific home-field edge (points). Altitude, crowd, dome, travel hubs. */
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

/** Convert a prior-year pass-defense rank (1 best) to a defensive point value. */
function defFromRank(rank: number): number {
  // Rank 1 → ~ +3.4 (stingy), rank 32 → ~ -3.4 (leaky). Centered at 16.5.
  return ((16.5 - rank) / 15.5) * 3.4;
}

export interface UnitRatings {
  offense: number; // points above average scored
  defense: number; // points below average allowed (higher = stingier)
}

/**
 * Split a team's (form-adjusted) net rating into offense/defense. Defense is
 * anchored by pass-defense rank (with Ken's regression already priced into the
 * team rating); offense is the remainder so off + def === net.
 */
export function unitRatings(team: Team, effectiveNet: number): UnitRatings {
  const defense = defFromRank(team.passDefRankPrev);
  const offense = effectiveNet - defense;
  return { offense, defense };
}

export function teamUnitRatings(abbr: TeamAbbr, effectiveNet: number): UnitRatings {
  return unitRatings(TEAMS[abbr], effectiveNet);
}

/** Opponent defensive strength proxy (points; + = stingier) from pass-D rank. */
export function staticDefense(abbr: TeamAbbr): number {
  return defFromRank(TEAMS[abbr].passDefRankPrev);
}

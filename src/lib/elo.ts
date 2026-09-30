import { TEAMS } from '@/lib/teams';
import type { TeamAbbr } from '@/lib/types';

/**
 * Margin-aware Elo ratings (538-style) as an INDEPENDENT second opinion on team
 * strength, ensembled with the drive-simulation margin (see simulation.ts). Elo
 * is the right tool for low-data sports rating: it updates online after every
 * result, self-corrects, and — seeded from the preseason power ratings — acts as
 * a Bayesian prior that Week-3 noise can only nudge, not overturn. It carries no
 * offense/defense split (that's the efficiency-form model's job); Elo purely
 * tracks "who is better" for the margin/side markets.
 */

export const ELO_PER_POINT = 25; // ~25 Elo ≈ 1 point of spread
export const ELO_HFA = 48; // home-field edge in Elo (~1.9 pts) for the update step
const K = 20; // update speed
const START = 1500;

export type EloRatings = Record<TeamAbbr, number>;

/** Seed Elo from preseason power ratings (informative prior → Bayesian shrinkage). */
export function baseElo(): EloRatings {
  const e = {} as EloRatings;
  for (const t of Object.values(TEAMS)) e[t.abbr] = START + t.rating * ELO_PER_POINT;
  return e;
}

function expectedHome(eloHome: number, eloAway: number): number {
  return 1 / (1 + 10 ** (-(eloHome + ELO_HFA - eloAway) / 400));
}

/**
 * FiveThirtyEight margin-of-victory multiplier: blowouts move ratings more, but
 * with diminishing returns, and the autocorrelation term damps favorites running
 * up the score. `eloDiffWinner` is the winner's pregame Elo edge (with HFA).
 */
function movMultiplier(marginAbs: number, eloDiffWinner: number): number {
  return Math.log(marginAbs + 1) * (2.2 / (eloDiffWinner * 0.001 + 2.2));
}

/** Update Elo in place for one completed game. */
export function updateElo(
  elo: EloRatings,
  home: TeamAbbr,
  away: TeamAbbr,
  homeScore: number,
  awayScore: number,
): void {
  if (homeScore === awayScore) return; // ties ~never; skip
  const eloHome = elo[home];
  const eloAway = elo[away];
  const homeWon = homeScore > awayScore;
  const exp = expectedHome(eloHome, eloAway);
  const marginAbs = Math.abs(homeScore - awayScore);
  const eloDiffWinner = homeWon ? eloHome + ELO_HFA - eloAway : eloAway - (eloHome + ELO_HFA);
  const mov = movMultiplier(marginAbs, eloDiffWinner);
  const delta = K * mov * ((homeWon ? 1 : 0) - exp);
  elo[home] = eloHome + delta;
  elo[away] = eloAway - delta;
}

/** Elo-implied home margin (points), including a generic home-field edge. */
export function eloMargin(elo: EloRatings, home: TeamAbbr, away: TeamAbbr, hfaPoints: number): number {
  return (elo[home] - elo[away]) / ELO_PER_POINT + hfaPoints;
}

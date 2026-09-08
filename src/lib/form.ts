import { TEAMS } from '@/lib/teams';
import { fetchEspnResults } from '@/lib/espn';
import { SEASON } from '@/lib/schedule';
import type { TeamAbbr } from '@/lib/types';

/**
 * In-season form model. Starts from each team's preseason power rating and
 * nudges it after every completed game toward what the results imply — an
 * Elo-style margin update. This is how the model "gets smarter each week":
 * as real outcomes come in, the ratings (and therefore every pick) adapt.
 */

const HFA = 1.7;
const K = 0.06; // learning rate
const MAX_SHIFT_PER_GAME = 3.0; // clamp a single game's influence (points)
const MARGIN_CAP = 24; // treat blowouts beyond this as equal (garbage time)

export type Ratings = Record<TeamAbbr, number>;

export function baseRatings(): Ratings {
  const r = {} as Ratings;
  for (const t of Object.values(TEAMS)) r[t.abbr] = t.rating;
  return r;
}

/**
 * Effective ratings after applying results from weeks 1..(uptoWeek-1).
 * Cached by Next fetch revalidation on the underlying ESPN calls.
 */
export async function getFormRatings(uptoWeek: number, season = SEASON): Promise<Ratings> {
  const ratings = baseRatings();
  if (uptoWeek <= 1) return ratings;

  const weeks = Array.from({ length: uptoWeek - 1 }, (_, i) => i + 1);
  const results = await Promise.all(weeks.map((w) => fetchEspnResults(w, season).catch(() => [])));

  for (const week of results) {
    for (const g of week) {
      const expected = ratings[g.home] + HFA - ratings[g.away];
      const actualRaw = g.homeScore - g.awayScore;
      const actual = Math.max(-MARGIN_CAP, Math.min(MARGIN_CAP, actualRaw));
      const resid = actual - expected;
      const shift = Math.max(-MAX_SHIFT_PER_GAME, Math.min(MAX_SHIFT_PER_GAME, K * resid));
      ratings[g.home] += shift;
      ratings[g.away] -= shift;
    }
  }
  return ratings;
}

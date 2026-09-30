import { fetchEspnWeek } from './espn';
import { getFormRatings } from './form';
import { simulateGame } from './simulation';
import { getCurrentWeek, TOTAL_WEEKS } from './schedule';
import type { TeamAbbr } from './types';

/**
 * Survivor / eliminator model. Builds a per-team win probability for every
 * remaining week from the same drive-level simulation the rest of the app uses,
 * so the pool planner can optimize across the whole season — not just this week.
 */

export interface EliminatorOption {
  team: TeamAbbr;
  opponent: TeamAbbr;
  home: boolean;
  winProb: number;
  kickoff: string;
}

export interface EliminatorWeek {
  week: number;
  options: EliminatorOption[];
}

export async function getEliminatorData(fromWeek = getCurrentWeek()): Promise<EliminatorWeek[]> {
  const ratings = await getFormRatings(fromWeek);
  const weeks: number[] = [];
  for (let w = fromWeek; w <= TOTAL_WEEKS; w++) weeks.push(w);

  const perWeek = await Promise.all(
    weeks.map(async (w) => {
      const games = await fetchEspnWeek(w).catch(() => []);
      const options: EliminatorOption[] = [];
      for (const g of games) {
        const sim = simulateGame(g, ratings);
        const hp = Math.max(0.01, Math.min(0.99, sim.homeWinProb));
        options.push({ team: g.home, opponent: g.away, home: true, winProb: hp, kickoff: g.kickoff });
        options.push({ team: g.away, opponent: g.home, home: false, winProb: 1 - hp, kickoff: g.kickoff });
      }
      options.sort((a, b) => b.winProb - a.winProb);
      return { week: w, options };
    }),
  );

  return perWeek.filter((w) => w.options.length > 0);
}

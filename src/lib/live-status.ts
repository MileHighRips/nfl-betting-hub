import { fetchEspnWeek } from './espn';
import { getCurrentWeek } from './schedule';
import type { TeamAbbr } from './types';

export interface LiveStatus {
  state: 'pre' | 'in' | 'post';
  away: TeamAbbr;
  home: TeamAbbr;
  awayScore: number;
  homeScore: number;
  detail?: string;
}

/** Current game statuses/scores keyed by game id, for live bet tracking. */
export async function getGameStatuses(week = getCurrentWeek()): Promise<Record<string, LiveStatus>> {
  const games = await fetchEspnWeek(week).catch(() => []);
  const out: Record<string, LiveStatus> = {};
  for (const g of games) {
    out[g.id] = {
      state: g.status ?? 'pre',
      away: g.away,
      home: g.home,
      awayScore: g.awayScore ?? 0,
      homeScore: g.homeScore ?? 0,
      detail: g.statusDetail,
    };
  }
  return out;
}

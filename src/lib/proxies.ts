import { TEAMS } from './teams';
import { SEASON } from './schedule';
import { memo } from './cache';
import type { TeamAbbr } from './types';

/**
 * Free live-data proxies scraped from ESPN's public API (no key required):
 *   • Injuries  — starter-QB availability + a set of ruled-out players so the
 *                 prop model never recommends someone who won't play.
 *   • Rest days — real days of rest per team from the schedule (bye weeks,
 *                 short-week Thursday games).
 * These layer on top of the results-based in-season learning in form.ts.
 */

// Full team name → abbreviation (ESPN injuries payload only carries the name).
const NAME_TO_ABBR: Record<string, TeamAbbr> = Object.fromEntries(
  Object.values(TEAMS).map((t) => [`${t.city} ${t.name}`, t.abbr]),
) as Record<string, TeamAbbr>;
NAME_TO_ABBR['Washington Commanders'] = 'WAS';

const UNAVAILABLE = new Set(['Out', 'Injured Reserve', 'Suspension', 'Doubtful']);

export interface TeamInjuries {
  qbOut: boolean;
  unavailable: string[]; // display names ruled out
}

interface EspnInjuryTeam {
  displayName: string;
  injuries?: {
    status?: string;
    athlete?: { displayName?: string; position?: { abbreviation?: string } };
  }[];
}

// The ESPN injuries payload is ~11MB — far over Next's 2MB fetch-cache limit, so
// caching the raw response fails. Instead cache the tiny parsed result (a few
// out players per team) so the big download + parse runs at most once per TTL.
const fetchInjuries = async (): Promise<Partial<Record<TeamAbbr, TeamInjuries>>> => {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries', {
      cache: 'no-store',
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { injuries?: EspnInjuryTeam[] };
    const out: Partial<Record<TeamAbbr, TeamInjuries>> = {};
    for (const team of data.injuries ?? []) {
      const abbr = NAME_TO_ABBR[team.displayName];
      if (!abbr) continue;
      const unavailable: string[] = [];
      let qbOut = false;
      for (const inj of team.injuries ?? []) {
        if (!inj.status || !UNAVAILABLE.has(inj.status)) continue;
        const name = inj.athlete?.displayName;
        if (!name) continue;
        unavailable.push(name);
        // Live, roster-agnostic: any ruled-out QB flags qbOut; odds-source then
        // refines it against the live DK starter (passing-prop player).
        if (inj.athlete?.position?.abbreviation === 'QB') qbOut = true;
      }
      out[abbr] = { qbOut, unavailable };
    }
    return out;
  } catch {
    return {};
  }
};

export const getInjuries = () => memo('injuries', 300_000, fetchInjuries);

interface EspnDatedEvent {
  date: string;
  competitions: { competitors: { team: { abbreviation: string } }[] }[];
}

async function fetchWeekDates(week: number): Promise<{ abbr: string; date: string }[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${SEASON}`;
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) return [];
  const data = (await res.json()) as { events?: EspnDatedEvent[] };
  const rows: { abbr: string; date: string }[] = [];
  for (const ev of data.events ?? []) {
    for (const cmp of ev.competitions ?? []) {
      for (const c of cmp.competitors ?? []) {
        const abbr = c.team.abbreviation === 'WSH' ? 'WAS' : c.team.abbreviation;
        rows.push({ abbr, date: ev.date });
      }
    }
  }
  return rows;
}

/** Days of rest per team going into `week`, derived from prior game dates. */
export async function getRestDays(week: number): Promise<Partial<Record<string, number>>> {
  if (week <= 1) return {};
  const prior = await Promise.all(
    [week - 1, week - 2].filter((w) => w >= 1).map((w) => fetchWeekDates(w)),
  );
  const lastDate: Record<string, string> = {};
  for (const rows of prior) {
    for (const r of rows) {
      if (!lastDate[r.abbr] || new Date(r.date) > new Date(lastDate[r.abbr]))
        lastDate[r.abbr] = r.date;
    }
  }
  const current = await fetchWeekDates(week);
  const rest: Partial<Record<string, number>> = {};
  for (const r of current) {
    const prev = lastDate[r.abbr];
    if (prev) {
      const days = Math.round((new Date(r.date).getTime() - new Date(prev).getTime()) / 86400000);
      if (days > 0 && days < 21) rest[r.abbr] = days;
    }
  }
  return rest;
}

import { TEAMS } from '@/lib/teams';
import { bestProp } from '@/lib/props';
import { SEASON } from '@/lib/schedule';
import type { BookLine, Game, TeamAbbr } from '@/lib/types';

/**
 * ESPN free scoreboard API — real schedule, real DraftKings odds, and live
 * scores. No API key required. This is the primary data source; FanDuel is
 * overlaid separately when an Odds API key is configured.
 */

const DOME_TEAMS: TeamAbbr[] = ['DET', 'MIN', 'NO', 'ATL', 'LV', 'IND', 'ARI', 'HOU', 'DAL'];

// ESPN abbreviations that differ from ours.
const ESPN_ABBR: Record<string, TeamAbbr> = { WSH: 'WAS' };

function toAbbr(espn: string): TeamAbbr | null {
  const a = (ESPN_ABBR[espn] ?? espn) as TeamAbbr;
  return TEAMS[a] ? a : null;
}

interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score?: string;
  team: { abbreviation: string };
}
interface EspnOddsSide {
  close?: { odds?: string; line?: string };
  open?: { odds?: string; line?: string };
}
interface EspnOdds {
  provider?: { name?: string };
  spread?: number;
  overUnder?: number;
  moneyline?: { home?: EspnOddsSide; away?: EspnOddsSide };
  pointSpread?: { home?: EspnOddsSide; away?: EspnOddsSide };
  total?: { over?: EspnOddsSide; under?: EspnOddsSide };
}
interface EspnCompetition {
  competitors: EspnCompetitor[];
  odds?: EspnOdds[];
  status?: { type?: { state?: string; completed?: boolean; shortDetail?: string } };
}
interface EspnEvent {
  id: string;
  date: string;
  competitions: EspnCompetition[];
}
interface EspnScoreboard {
  events?: EspnEvent[];
  week?: { number?: number };
}

function num(v: string | undefined, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(String(v).replace(/[ou+]/gi, ''));
  return Number.isFinite(n) ? n : fallback;
}

/** Build the DraftKings BookLine from ESPN's odds block. */
function dkFromEspn(odds: EspnOdds | undefined, homeSpread: number): BookLine {
  const ps = odds?.pointSpread;
  const tot = odds?.total;
  const ml = odds?.moneyline;
  const spread = ps?.home?.close?.line != null ? num(ps.home.close.line, homeSpread) : homeSpread;
  const total =
    tot?.over?.close?.line != null
      ? num(tot.over.close.line, odds?.overUnder ?? 44.5)
      : (odds?.overUnder ?? 44.5);
  return {
    book: 'DraftKings',
    spread,
    spreadPriceHome: num(ps?.home?.close?.odds, -110),
    spreadPriceAway: num(ps?.away?.close?.odds, -110),
    total,
    overPrice: num(tot?.over?.close?.odds, -110),
    underPrice: num(tot?.under?.close?.odds, -110),
    moneylineHome: num(ml?.home?.close?.odds, -110),
    moneylineAway: num(ml?.away?.close?.odds, 100),
  };
}

/** Build the game, then attach the model's single best prop (Over or Under). */
function buildGame(ev: EspnEvent, week: number): Game | null {
  const comp = ev.competitions?.[0];
  if (!comp) return null;
  const homeC = comp.competitors.find((c) => c.homeAway === 'home');
  const awayC = comp.competitors.find((c) => c.homeAway === 'away');
  if (!homeC || !awayC) return null;
  const home = toAbbr(homeC.team.abbreviation);
  const away = toAbbr(awayC.team.abbreviation);
  if (!home || !away) return null;

  const odds = comp.odds?.[0];
  // ESPN "spread" is the favored line as a negative; align to home perspective.
  let homeSpread = odds?.spread ?? 0;
  if (odds?.pointSpread?.home?.close?.line != null) {
    homeSpread = num(odds.pointSpread.home.close.line, homeSpread);
  }
  const dk = dkFromEspn(odds, homeSpread);
  const state = (comp.status?.type?.state as 'pre' | 'in' | 'post') ?? 'pre';

  const game: Game = {
    id: `${SEASON}-w${week}-${away}-${home}`.toLowerCase(),
    week,
    season: SEASON,
    kickoff: ev.date,
    home,
    away,
    books: [dk, { ...dk, book: 'FanDuel' }],
    prop: {
      player: '',
      team: home,
      market: 'Receiving Yards',
      line: 0,
      side: 'Over',
      price: -114,
      book: 'DraftKings',
      projection: 0,
      confidence: 0,
      rationale: '',
    },
    context: {
      homeRestDays: 7,
      awayRestDays: 7,
      divisionGame:
        TEAMS[home].conference === TEAMS[away].conference &&
        TEAMS[home].division === TEAMS[away].division,
      weather: DOME_TEAMS.includes(home) ? 'dome' : 'clear',
    },
    status: state,
    statusDetail: comp.status?.type?.shortDetail,
    homeScore: Number(homeC.score ?? 0),
    awayScore: Number(awayC.score ?? 0),
  };
  game.prop = bestProp(game);
  return game;
}

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export async function fetchEspnWeek(week: number, season = SEASON): Promise<Game[]> {
  const url = `${ESPN_BASE}?week=${week}&seasontype=2&dates=${season}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = (await res.json()) as EspnScoreboard;
  return (data.events ?? [])
    .map((e) => buildGame(e, week))
    .filter((g): g is Game => !!g)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}

export interface CompletedResult {
  home: TeamAbbr;
  away: TeamAbbr;
  homeScore: number;
  awayScore: number;
}

/** Completed results for a week, used by the in-season form model. */
export async function fetchEspnResults(week: number, season = SEASON): Promise<CompletedResult[]> {
  const url = `${ESPN_BASE}?week=${week}&seasontype=2&dates=${season}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = (await res.json()) as EspnScoreboard;
  const out: CompletedResult[] = [];
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp?.status?.type?.completed) continue;
    const homeC = comp.competitors.find((c) => c.homeAway === 'home');
    const awayC = comp.competitors.find((c) => c.homeAway === 'away');
    const home = homeC && toAbbr(homeC.team.abbreviation);
    const away = awayC && toAbbr(awayC.team.abbreviation);
    if (!home || !away) continue;
    out.push({
      home,
      away,
      homeScore: Number(homeC!.score ?? 0),
      awayScore: Number(awayC!.score ?? 0),
    });
  }
  return out;
}

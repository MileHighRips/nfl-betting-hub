import { TEAMS } from '@/lib/teams';
import { bestProp } from '@/lib/props';
import { SEASON } from '@/lib/schedule';
import type { BookLine, Game, TeamAbbr } from '@/lib/types';

/**
 * ESPN free scoreboard API — real schedule, real DraftKings odds, and live
 * scores. No API key required. This is the primary data source.
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
  neutralSite?: boolean;
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
  const openSpread = ps?.home?.open?.line != null ? num(ps.home.open.line, spread) : undefined;
  const openTotal = tot?.over?.open?.line != null ? num(tot.over.open.line, total) : undefined;
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
    openSpread,
    openTotal,
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
    books: [dk],
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
      neutralSite: comp.neutralSite === true,
      weather: comp.neutralSite ? 'clear' : DOME_TEAMS.includes(home) ? 'dome' : 'clear',
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
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = (await res.json()) as EspnScoreboard;
  return (data.events ?? [])
    .map((e) => buildGame(e, week))
    .filter((g): g is Game => !!g)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}

/** Team-level box-score efficiency for a single completed game. */
export interface TeamGameStat {
  yards?: number; // total yards
  plays?: number; // offensive plays
  yardsPerPlay?: number;
  turnovers?: number;
  redZoneTd?: number; // red-zone TDs
  redZoneTrips?: number; // red-zone attempts
  thirdMade?: number;
  thirdAtt?: number;
}

export interface CompletedResult {
  eventId: string;
  home: TeamAbbr;
  away: TeamAbbr;
  homeScore: number;
  awayScore: number;
  playerStats: PlayerGameStat[];
  /** Team efficiency box score (offense side), keyed by team. */
  teamStats?: Partial<Record<TeamAbbr, TeamGameStat>>;
}

export interface PlayerGameStat {
  player: string;
  team: TeamAbbr;
  passYards?: number;
  rushYards?: number;
  receivingYards?: number;
  receptions?: number;
  rushTD?: number;
  recTD?: number;
}

interface SummaryStatGroup {
  name?: string;
  labels?: string[];
  keys?: string[];
  athletes?: { athlete?: { displayName?: string }; stats?: string[] }[];
}

interface SummaryTeamPlayers {
  team?: {abbreviation?: string};
  statistics?: SummaryStatGroup[];
}

interface SummaryTeamStat {
  team?: { abbreviation?: string };
  statistics?: { name?: string; displayValue?: string }[];
}

/** Parse an ESPN "made-attempts" pair like "5-16" or "1-2". */
function madeAtt(value: string | undefined): { made?: number; att?: number } {
  if (!value) return {};
  const m = value.match(/(-?\d+)\s*-\s*(-?\d+)/);
  if (!m) return {};
  return { made: Number(m[1]), att: Number(m[2]) };
}

function statNumber(value: string | undefined): number | undefined {
  if (value == null || value === '-' || value === '') return undefined;
  const cleaned = value.replace(/[^0-9.-]/g, ''); // keep digits, decimal, minus
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return undefined;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : undefined;
}

async function fetchSummary(
  eventId: string,
): Promise<{ players: PlayerGameStat[]; teamStats: Partial<Record<TeamAbbr, TeamGameStat>> }> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`,
      { next: { revalidate: 120 } },
    );
    if (!res.ok) return { players: [], teamStats: {} };
    const data = (await res.json()) as {
      boxscore?: { players?: SummaryTeamPlayers[]; teams?: SummaryTeamStat[] };
    };
    const byPlayer = new Map<string, PlayerGameStat>();

    for (const teamBlock of data.boxscore?.players ?? []) {
      const team = toAbbr(teamBlock.team?.abbreviation ?? '');
      if (!team) continue;
      for (const group of teamBlock.statistics ?? []) {
        const category = (group.name ?? '').toLowerCase();
        const labels = (group.labels ?? group.keys ?? []).map((label) => label.toUpperCase());
        const yardsIndex = labels.indexOf('YDS');
        const receptionsIndex = labels.indexOf('REC');
        const tdIndex = labels.indexOf('TD');
        for (const athlete of group.athletes ?? []) {
          const player = athlete.athlete?.displayName;
          if (!player || !athlete.stats) continue;
          const key = `${team}|${player.toLowerCase()}`;
          const current = byPlayer.get(key) ?? { player, team };
          const yards = statNumber(yardsIndex >= 0 ? athlete.stats[yardsIndex] : undefined);
          const tds = statNumber(tdIndex >= 0 ? athlete.stats[tdIndex] : undefined);
          if (category.includes('pass') && yards != null) current.passYards = yards;
          if (category.includes('rush')) {
            if (yards != null) current.rushYards = yards;
            if (tds != null) current.rushTD = tds;
          }
          if (category.includes('receiv')) {
            if (yards != null) current.receivingYards = yards;
            if (tds != null) current.recTD = tds;
            const receptions = statNumber(
              receptionsIndex >= 0 ? athlete.stats[receptionsIndex] : undefined,
            );
            if (receptions != null) current.receptions = receptions;
          }
          byPlayer.set(key, current);
        }
      }
    }

    const teamStats: Partial<Record<TeamAbbr, TeamGameStat>> = {};
    for (const block of data.boxscore?.teams ?? []) {
      const team = toAbbr(block.team?.abbreviation ?? '');
      if (!team) continue;
      const s = new Map((block.statistics ?? []).map((x) => [x.name ?? '', x.displayValue]));
      const rz = madeAtt(s.get('redZoneAttempts'));
      const third = madeAtt(s.get('thirdDownEff'));
      teamStats[team] = {
        yards: statNumber(s.get('totalYards')),
        plays: statNumber(s.get('totalOffensivePlays')),
        yardsPerPlay: statNumber(s.get('yardsPerPlay')),
        turnovers: statNumber(s.get('turnovers')),
        redZoneTd: rz.made,
        redZoneTrips: rz.att,
        thirdMade: third.made,
        thirdAtt: third.att,
      };
    }

    return { players: [...byPlayer.values()], teamStats };
  } catch {
    return { players: [], teamStats: {} };
  }
}

/** Completed results for a week, used by the in-season form model. */
export async function fetchEspnResults(week: number, season = SEASON): Promise<CompletedResult[]> {
  const url = `${ESPN_BASE}?week=${week}&seasontype=2&dates=${season}`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = (await res.json()) as EspnScoreboard;
  const completed: { event: EspnEvent; comp: EspnCompetition }[] = [];
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp?.status?.type?.completed) continue;
    const homeC = comp.competitors.find((c) => c.homeAway === 'home');
    const awayC = comp.competitors.find((c) => c.homeAway === 'away');
    const home = homeC && toAbbr(homeC.team.abbreviation);
    const away = awayC && toAbbr(awayC.team.abbreviation);
    if (!home || !away) continue;
    completed.push({ event: ev, comp });
  }
  return Promise.all(
    completed.map(async ({ event, comp }) => {
      const homeC = comp.competitors.find((c) => c.homeAway === 'home')!;
      const awayC = comp.competitors.find((c) => c.homeAway === 'away')!;
      const summary = await fetchSummary(event.id);
      return {
        eventId: event.id,
        home: toAbbr(homeC.team.abbreviation)!,
        away: toAbbr(awayC.team.abbreviation)!,
        homeScore: Number(homeC.score ?? 0),
        awayScore: Number(awayC.score ?? 0),
        playerStats: summary.players,
        teamStats: summary.teamStats,
      };
    }),
  );
}

import { WEEK1_GAMES } from '@/data/games';
import { TEAMS } from '@/lib/teams';
import { getCurrentWeek } from '@/lib/schedule';
import { fetchEspnWeek } from '@/lib/espn';
import { bestProp, propKey } from '@/lib/props';
import { getInjuries, getRestDays, type TeamInjuries } from '@/lib/proxies';
import { getWeatherForGames, classifyWeather } from '@/lib/weather';
import { getWire } from '@/lib/news';
import { buildPlayerSignals } from '@/lib/player-signals';
import { hoursToKickoff } from '@/lib/kickoff';
import { memo } from '@/lib/cache';
import { type PropMarket } from '@/data/props';
import { MANUAL_PROP_LINES } from '@/data/liveProps';
import { fetchDraftKingsProps, fetchDraftKingsAnytimeTDs, type DkPropsResult, type DkAtd } from '@/lib/draftkings';
import type { Game, LivePropMap, TeamAbbr } from '@/lib/types';

/**
 * Source of truth for game lines. Primary feed is ESPN (free, no key): real
 * schedule, real DraftKings odds, live scores, injuries and weather. When
 * ODDS_API_KEY + ODDS_API_PROPS are set, exact DraftKings player-prop lines are
 * pulled in. Falls back to the seed slate only if ESPN is unreachable.
 */

const NAME_TO_ABBR: Record<string, TeamAbbr> = Object.fromEntries(
  Object.values(TEAMS).map((t) => [`${t.city} ${t.name}`, t.abbr]),
) as Record<string, TeamAbbr>;

export interface GamesResult {
  source: 'live' | 'seed';
  provider: 'ESPN' | 'ESPN + DK Props' | 'Seed';
  week: number;
  games: Game[];
  error?: string;
}

/** Expected-points penalty from key non-QB injuries (WR1/RB1 etc. ruled out). */
function skillInjuryPenalty(
  unavailable: string[] | undefined,
  liveCands: { player: string; market: PropMarket; line: number }[] | undefined,
): number {
  if (!unavailable?.length || !liveCands?.length) return 0;
  const out = new Set(unavailable.map((p) => p.toLowerCase()));
  let penalty = 0;
  for (const c of liveCands) {
    if (c.market === 'Pass Yards' || c.market === 'Sacks') continue;
    if (!out.has(c.player.toLowerCase())) continue;
    // Position weight × volume weight (live prop line as the usage proxy), so
    // losing a bell-cow or WR1 hurts far more than a committee/depth piece.
    const posW = c.market === 'Receiving Yards' ? 1.1 : c.market === 'Rush Yards' ? 1.0 : 0.6;
    const benchmark = c.market === 'Receiving Yards' ? 60 : c.market === 'Rush Yards' ? 65 : 50;
    const volW = Math.max(0.5, Math.min(1.7, c.line / benchmark));
    penalty += posW * volW;
  }
  return Math.min(3.2, penalty);
}

function applyProxies(
  g: Game,
  injuries: Partial<Record<TeamAbbr, TeamInjuries>>,
  rest: Partial<Record<string, number>>,
  liveProps: LivePropMap,
  dkByTeam: DkPropsResult['byTeam'],
  atdByTeam: Partial<Record<TeamAbbr, DkAtd[]>>,
): Game {
  const homeInj = injuries[g.home];
  const awayInj = injuries[g.away];
  const outPlayers = [...(homeInj?.unavailable ?? []), ...(awayInj?.unavailable ?? [])];
  // Live starter QB = the player DK posts a passing-yards prop for. QB is “out”
  // only when that live starter is ruled out (never a stale seed name).
  const liveQbOut = (team: TeamAbbr, inj: TeamInjuries | undefined): boolean => {
    const starter = dkByTeam[team]?.find((c) => c.market === 'Pass Yards')?.player?.toLowerCase();
    if (starter) return (inj?.unavailable ?? []).some((p) => p.toLowerCase() === starter);
    return inj?.qbOut ?? false; // no live passing market → fall back to position-based flag
  };
  const context = {
    ...g.context,
    homeQbOut: liveQbOut(g.home, homeInj) || g.context.homeQbOut,
    awayQbOut: liveQbOut(g.away, awayInj) || g.context.awayQbOut,
    homeInjuryPenalty: skillInjuryPenalty(homeInj?.unavailable, dkByTeam[g.home]),
    awayInjuryPenalty: skillInjuryPenalty(awayInj?.unavailable, dkByTeam[g.away]),
    homeRestDays: rest[g.home] ?? g.context.homeRestDays,
    awayRestDays: rest[g.away] ?? g.context.awayRestDays,
  };
  const next: Game = { ...g, context, outPlayers };
  // Live DK lines over manual pins over baselines, then recompute the prop.
  next.livePropLines = { ...liveProps, ...(g.livePropLines ?? {}) };
  const cands = [...(dkByTeam[g.home] ?? []), ...(dkByTeam[g.away] ?? [])];
  if (cands.length) next.livePropCandidates = cands;
  const atds = [...(atdByTeam[g.home] ?? []), ...(atdByTeam[g.away] ?? [])];
  if (atds.length) next.anytimeTdCandidates = atds;
  next.prop = bestProp(next, next.livePropLines);
  return next;
}

export async function getGames(week?: number): Promise<GamesResult> {
  const targetWeek = week ?? getCurrentWeek();
  return memo(`games-${targetWeek}`, 45_000, () => computeGames(targetWeek));
}

// Attach structured beat-writer/role signals to pre-kickoff games. Best-effort,
// bounded to the soonest games, and time-capped so news NEVER blocks a render —
// if the wire is slow the cache fills in the background and signals appear next load.
async function attachPlayerSignals(games: Game[]): Promise<Game[]> {
  const soon = games
    .filter((g) => g.status !== 'post' && hoursToKickoff(g.kickoff) > 0 && hoursToKickoff(g.kickoff) < 120)
    .sort((a, b) => hoursToKickoff(a.kickoff) - hoursToKickoff(b.kickoff))
    .slice(0, 12); // cap the per-team news fetches to the imminent slate
  if (!soon.length) return games;
  const teams = [...new Set(soon.flatMap((g) => [g.home, g.away]))];
  let wire: Awaited<ReturnType<typeof getWire>>;
  try {
    // Hard 6s cap: abandoned fetches keep warming the memo for the next render.
    wire = await Promise.race([
      getWire(teams),
      new Promise<Awaited<ReturnType<typeof getWire>>>((resolve) =>
        setTimeout(() => resolve([]), 6000),
      ),
    ]);
  } catch {
    return games;
  }
  if (!wire.length) return games;
  const soonSet = new Set(soon);
  return games.map((g) => {
    if (!soonSet.has(g)) return g;
    const players = [
      ...(g.anytimeTdCandidates ?? []).map((c) => c.player),
      ...(g.livePropCandidates ?? []).map((c) => c.player),
    ];
    const signals = buildPlayerSignals(wire, players);
    if (!Object.keys(signals).length) return g;
    const outFromNews = Object.values(signals)
      .filter((s) => s.status === 'out')
      .map((s) => s.player);
    return {
      ...g,
      playerSignals: signals,
      outPlayers: [...new Set([...(g.outPlayers ?? []), ...outFromNews])],
    };
  });
}

async function computeGames(targetWeek: number): Promise<GamesResult> {
  const key = process.env.ODDS_API_KEY;

  try {
    const [espnGames, injuries, rest, dkProps, atdByTeam] = await Promise.all([
      fetchEspnWeek(targetWeek),
      getInjuries(),
      getRestDays(targetWeek),
      fetchDraftKingsProps(),
      fetchDraftKingsAnytimeTDs(),
    ]);
    const liveProps: LivePropMap = { ...MANUAL_PROP_LINES, ...dkProps.lines };
    const hasDkProps = Object.keys(dkProps.lines).length > 0;
    let games = espnGames.map((g) => applyProxies(g, injuries, rest, liveProps, dkProps.byTeam, atdByTeam));

    // Live weather forecasts (Open-Meteo) for outdoor games.
    const weather = await getWeatherForGames(games);
    games = games.map((g) => {
      const f = weather[g.id];
      if (!f) return g;
      return {
        ...g,
        context: {
          ...g.context,
          weather: classifyWeather(f),
          windMph: f.windMph,
          precip: f.precip,
          tempF: f.tempF,
        },
      };
    });

    // Structured beat-writer/role signals (next-man-up, goal-line role, ruled
    // out) for games kicking off soon. Best-effort: never blocks the slate.
    games = await attachPlayerSignals(games);

    // Optional: exact lines from The Odds API (paid key) override the DK feed.
    if (games.length && key && process.env.ODDS_API_PROPS !== 'false') {
      games = await overlayLiveProps(games, key);
      return { source: 'live', provider: 'ESPN + DK Props', week: targetWeek, games };
    }
    if (games.length) {
      return {
        source: 'live',
        provider: hasDkProps ? 'ESPN + DK Props' : 'ESPN',
        week: targetWeek,
        games,
      };
    }
    // ESPN returned nothing for this week (not scheduled yet).
    return { source: 'live', provider: 'ESPN', week: targetWeek, games: [] };
  } catch (err) {
    // Hard fallback so the app always renders.
    return {
      source: 'seed',
      provider: 'Seed',
      week: targetWeek,
      games: targetWeek === 1 ? WEEK1_GAMES : [],
      error: err instanceof Error ? err.message : 'feed unavailable',
    };
  }
}

// ---- Live player props (The Odds API event-odds endpoint) ------------------

const PROP_MARKET_MAP: Record<string, PropMarket> = {
  player_pass_yds: 'Pass Yards',
  player_rush_yds: 'Rush Yards',
  player_reception_yds: 'Receiving Yards',
  player_receptions: 'Receptions',
};

interface OddsApiPropOutcome {
  name: string; // 'Over' | 'Under'
  description?: string; // player name
  point?: number;
  price: number;
}
interface OddsApiEventOdds {
  id: string;
  home_team: string;
  away_team: string;
  bookmakers: { key: string; markets: { key: string; outcomes: OddsApiPropOutcome[] }[] }[];
}

function buildPropMap(ev: OddsApiEventOdds): LivePropMap {
  const map: LivePropMap = {};
  const bm = ev.bookmakers.find((b) => b.key === 'draftkings');
  if (!bm) return map;
  const book = 'DraftKings' as const;
  for (const m of bm.markets) {
    const market = PROP_MARKET_MAP[m.key];
    if (!market) continue;
    const byPlayer: Record<string, { over?: OddsApiPropOutcome; under?: OddsApiPropOutcome }> = {};
    for (const o of m.outcomes) {
      if (!o.description) continue;
      const rec = (byPlayer[o.description] ??= {});
      if (o.name === 'Over') rec.over = o;
      else if (o.name === 'Under') rec.under = o;
    }
    for (const [player, rec] of Object.entries(byPlayer)) {
      const line = rec.over?.point ?? rec.under?.point;
      if (line == null) continue;
      map[propKey(player, market)] = {
        line,
        overPrice: rec.over?.price ?? -114,
        underPrice: rec.under?.price ?? -114,
        book,
      };
    }
  }
  return map;
}

async function overlayLiveProps(games: Game[], key: string): Promise<Game[]> {
  try {
    const evUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${key}`;
    const evRes = await fetch(evUrl, { next: { revalidate: 60 } });
    if (!evRes.ok) return games;
    const events = (await evRes.json()) as { id: string; home_team: string; away_team: string }[];
    const markets = Object.keys(PROP_MARKET_MAP).join(',');

    return await Promise.all(
      games.map(async (g) => {
        const ev = events.find(
          (e) => NAME_TO_ABBR[e.home_team] === g.home && NAME_TO_ABBR[e.away_team] === g.away,
        );
        if (!ev) return g;
        const url =
          `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${ev.id}/odds` +
          `?apiKey=${key}&regions=us&markets=${markets}&bookmakers=draftkings&oddsFormat=american`;
        const res = await fetch(url, { next: { revalidate: 60 } });
        if (!res.ok) return g;
        const data = (await res.json()) as OddsApiEventOdds;
        const map = { ...MANUAL_PROP_LINES, ...buildPropMap(data) };
        return Object.keys(map).length ? { ...g, livePropLines: map, prop: bestProp(g, map) } : g;
      }),
    );
  } catch {
    return games;
  }
}

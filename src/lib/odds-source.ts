import { WEEK1_GAMES } from '@/data/games';
import { TEAMS } from '@/lib/teams';
import { getCurrentWeek } from '@/lib/schedule';
import { fetchEspnWeek } from '@/lib/espn';
import { bestProp, propKey } from '@/lib/props';
import { getInjuries, getRestDays, type TeamInjuries } from '@/lib/proxies';
import { getWeatherForGames, classifyWeather } from '@/lib/weather';
import { TEAM_PROPS, type PropMarket } from '@/data/props';
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
function skillInjuryPenalty(team: TeamAbbr, unavailable: string[] | undefined): number {
  if (!unavailable?.length) return 0;
  const out = new Set(unavailable.map((p) => p.toLowerCase()));
  let penalty = 0;
  for (const c of TEAM_PROPS[team] ?? []) {
    if (c.market === 'Pass Yards' || c.market === 'Sacks') continue;
    if (!out.has(c.player.toLowerCase())) continue;
    penalty += c.market === 'Receiving Yards' ? 1.1 : c.market === 'Rush Yards' ? 1.0 : 0.6;
  }
  return Math.min(2.5, penalty);
}

function applyProxies(
  g: Game,
  injuries: Partial<Record<TeamAbbr, TeamInjuries>>,
  rest: Partial<Record<string, number>>,
): Game {
  const homeInj = injuries[g.home];
  const awayInj = injuries[g.away];
  const outPlayers = [...(homeInj?.unavailable ?? []), ...(awayInj?.unavailable ?? [])];
  const context = {
    ...g.context,
    homeQbOut: homeInj?.qbOut || g.context.homeQbOut,
    awayQbOut: awayInj?.qbOut || g.context.awayQbOut,
    homeInjuryPenalty: skillInjuryPenalty(g.home, homeInj?.unavailable),
    awayInjuryPenalty: skillInjuryPenalty(g.away, awayInj?.unavailable),
    homeRestDays: rest[g.home] ?? g.context.homeRestDays,
    awayRestDays: rest[g.away] ?? g.context.awayRestDays,
  };
  const next: Game = { ...g, context, outPlayers };
  // Recompute the displayed prop so a ruled-out player is never shown.
  next.prop = bestProp(next, next.livePropLines);
  return next;
}

export async function getGames(week?: number): Promise<GamesResult> {
  const targetWeek = week ?? getCurrentWeek();
  const key = process.env.ODDS_API_KEY;

  try {
    const [espnGames, injuries, rest] = await Promise.all([
      fetchEspnWeek(targetWeek),
      getInjuries(),
      getRestDays(targetWeek),
    ]);
    let games = espnGames.map((g) => applyProxies(g, injuries, rest));

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

    // Live DraftKings player-prop lines (opt-in — consumes extra API quota).
    if (games.length && key && process.env.ODDS_API_PROPS === 'true') {
      games = await overlayLiveProps(games, key);
      return { source: 'live', provider: 'ESPN + DK Props', week: targetWeek, games };
    }
    if (games.length) {
      return { source: 'live', provider: 'ESPN', week: targetWeek, games };
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
    const evRes = await fetch(evUrl, { next: { revalidate: 300 } });
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
        const res = await fetch(url, { next: { revalidate: 300 } });
        if (!res.ok) return g;
        const data = (await res.json()) as OddsApiEventOdds;
        const map = buildPropMap(data);
        return Object.keys(map).length ? { ...g, livePropLines: map, prop: bestProp(g, map) } : g;
      }),
    );
  } catch {
    return games;
  }
}

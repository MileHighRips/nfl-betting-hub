import { WEEK1_GAMES } from '@/data/games';
import { TEAMS } from '@/lib/teams';
import { getCurrentWeek } from '@/lib/schedule';
import { fetchEspnWeek } from '@/lib/espn';
import { bestProp, propKey, type LivePropMap } from '@/lib/props';
import type { PropMarket } from '@/data/props';
import type { BookLine, Game, TeamAbbr } from '@/lib/types';

/**
 * Source of truth for game lines. Primary feed is ESPN (free, no key): real
 * schedule, real DraftKings odds, and live scores. When ODDS_API_KEY is set we
 * additionally overlay FanDuel (and refresh DraftKings) from The Odds API so
 * you can line-shop across both books. Falls back to the seed slate only if
 * ESPN is unreachable.
 */

const NAME_TO_ABBR: Record<string, TeamAbbr> = Object.fromEntries(
  Object.values(TEAMS).map((t) => [`${t.city} ${t.name}`, t.abbr]),
) as Record<string, TeamAbbr>;

interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}
interface OddsApiMarket {
  key: string;
  outcomes: OddsApiOutcome[];
}
interface OddsApiBookmaker {
  key: string;
  markets: OddsApiMarket[];
}
interface OddsApiEvent {
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

function extractBook(bm: OddsApiBookmaker, homeName: string, awayName: string): BookLine | null {
  const label = bm.key === 'draftkings' ? 'DraftKings' : bm.key === 'fanduel' ? 'FanDuel' : null;
  if (!label) return null;
  const h2h = bm.markets.find((m) => m.key === 'h2h');
  const spreads = bm.markets.find((m) => m.key === 'spreads');
  const totals = bm.markets.find((m) => m.key === 'totals');
  if (!h2h || !spreads || !totals) return null;
  const spHome = spreads.outcomes.find((o) => o.name === homeName);
  const spAway = spreads.outcomes.find((o) => o.name === awayName);
  const over = totals.outcomes.find((o) => o.name === 'Over');
  const under = totals.outcomes.find((o) => o.name === 'Under');
  return {
    book: label,
    spread: spHome?.point ?? 0,
    spreadPriceHome: spHome?.price ?? -110,
    spreadPriceAway: spAway?.price ?? -110,
    total: over?.point ?? 44.5,
    overPrice: over?.price ?? -110,
    underPrice: under?.price ?? -110,
    moneylineHome: h2h.outcomes.find((o) => o.name === homeName)?.price ?? -110,
    moneylineAway: h2h.outcomes.find((o) => o.name === awayName)?.price ?? 100,
  };
}

/** Overlay real FanDuel (and refresh DK) prices from The Odds API onto ESPN games. */
async function overlayFanDuel(games: Game[], key: string): Promise<Game[]> {
  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/` +
      `?apiKey=${key}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=draftkings,fanduel`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return games;
    const events = (await res.json()) as OddsApiEvent[];
    return games.map((g) => {
      const ev = events.find(
        (e) => NAME_TO_ABBR[e.home_team] === g.home && NAME_TO_ABBR[e.away_team] === g.away,
      );
      if (!ev) return g;
      const books = ev.bookmakers
        .map((bm) => extractBook(bm, ev.home_team, ev.away_team))
        .filter((b): b is BookLine => !!b);
      if (!books.length) return g;
      // Keep ESPN DK if the API didn't return DK; ensure both books present.
      const dk = books.find((b) => b.book === 'DraftKings') ?? g.books[0];
      const fd = books.find((b) => b.book === 'FanDuel') ?? { ...dk, book: 'FanDuel' as const };
      return { ...g, books: [dk, fd] };
    });
  } catch {
    return games;
  }
}

export interface GamesResult {
  source: 'live' | 'seed';
  provider: 'ESPN' | 'ESPN + The Odds API' | 'Seed';
  week: number;
  games: Game[];
  error?: string;
}

export async function getGames(week?: number): Promise<GamesResult> {
  const targetWeek = week ?? getCurrentWeek();
  const key = process.env.ODDS_API_KEY;

  try {
    let games = await fetchEspnWeek(targetWeek);
    if (games.length && key) {
      games = await overlayFanDuel(games, key);
      // Live prop lines are an "additional market" that consumes extra quota,
      // so they are opt-in via ODDS_API_PROPS=true.
      if (process.env.ODDS_API_PROPS === 'true') {
        games = await overlayLiveProps(games, key);
      }
      return { source: 'live', provider: 'ESPN + The Odds API', week: targetWeek, games };
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
  const bm =
    ev.bookmakers.find((b) => b.key === 'draftkings') ??
    ev.bookmakers.find((b) => b.key === 'fanduel');
  if (!bm) return map;
  const book = bm.key === 'fanduel' ? 'FanDuel' : 'DraftKings';
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
          `?apiKey=${key}&regions=us&markets=${markets}&bookmakers=draftkings,fanduel&oddsFormat=american`;
        const res = await fetch(url, { next: { revalidate: 300 } });
        if (!res.ok) return g;
        const data = (await res.json()) as OddsApiEventOdds;
        const map = buildPropMap(data);
        return Object.keys(map).length ? { ...g, prop: bestProp(g, map) } : g;
      }),
    );
  } catch {
    return games;
  }
}

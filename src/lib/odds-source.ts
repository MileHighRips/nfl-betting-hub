import { WEEK1_GAMES } from '@/data/games';
import { TEAMS } from '@/lib/teams';
import type { BookLine, Game, TeamAbbr } from '@/lib/types';

/**
 * Single source of truth for game lines. Returns live odds from the free
 * aggregator when ODDS_API_KEY is set, otherwise the seed slate. Used by both
 * the /api/odds route and server components directly.
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
    moneylineAway: h2h.outcomes.find((o) => o.name === awayName)?.price ?? -110,
  };
}

export interface GamesResult {
  source: 'live' | 'seed';
  games: Game[];
  error?: string;
}

export async function getGames(): Promise<GamesResult> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { source: 'seed', games: WEEK1_GAMES };
  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/` +
      `?apiKey=${key}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=draftkings,fanduel`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Odds API ${res.status}`);
    const events = (await res.json()) as OddsApiEvent[];
    const games = WEEK1_GAMES.map((g) => {
      const ev = events.find(
        (e) => NAME_TO_ABBR[e.home_team] === g.home && NAME_TO_ABBR[e.away_team] === g.away,
      );
      if (!ev) return g;
      const books = ev.bookmakers
        .map((bm) => extractBook(bm, ev.home_team, ev.away_team))
        .filter((b): b is BookLine => !!b);
      return books.length ? { ...g, books } : g;
    });
    return { source: 'live', games };
  } catch (err) {
    return {
      source: 'seed',
      games: WEEK1_GAMES,
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}

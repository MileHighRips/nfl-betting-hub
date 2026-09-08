import { WEEK1_GAMES } from '@/data/games';
import { STAR_PROPS } from '@/data/starPlayers';
import { TEAMS } from '@/lib/teams';
import { SEASON, getCurrentWeek, weekOf } from '@/lib/schedule';
import type { BookLine, Game, PlayerProp, TeamAbbr } from '@/lib/types';

/**
 * Single source of truth for game lines. Returns live odds from the free
 * aggregator when ODDS_API_KEY is set, otherwise the seed slate. Auto-advances:
 * pass a week (defaults to the current week by date) and live events are
 * bucketed into their NFL week. Used by the /api/odds route and server pages.
 */

const DOME_TEAMS: TeamAbbr[] = ['DET', 'MIN', 'NO', 'ATL', 'LV', 'IND', 'ARI', 'HOU', 'DAL'];

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
  id?: string;
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
    moneylineAway: h2h.outcomes.find((o) => o.name === awayName)?.price ?? -110,
  };
}

/** Synthesize the single best prop for a live game from the favored team's star. */
function synthProp(home: TeamAbbr, away: TeamAbbr, homeSpread: number): PlayerProp {
  const favIsHome = homeSpread <= 0;
  const favTeam = favIsHome ? home : away;
  const star = STAR_PROPS[favTeam];
  const t = TEAMS[favTeam];
  // Favorites tend to control script — modest projection lift over the baseline.
  const projection = Number((star.baseline * 1.06).toFixed(1));
  return {
    player: star.player,
    team: favTeam,
    market: star.market,
    line: star.baseline,
    side: 'Over',
    price: -114,
    book: 'DraftKings',
    projection,
    confidence: 61,
    rationale: `${t.name} are favored here; ${star.player} is the primary volume target and the model projects positive game script (proj ${projection}).`,
  };
}

function buildLiveGame(ev: OddsApiEvent, week: number): Game | null {
  const home = NAME_TO_ABBR[ev.home_team];
  const away = NAME_TO_ABBR[ev.away_team];
  if (!home || !away) return null;
  const books = ev.bookmakers
    .map((bm) => extractBook(bm, ev.home_team, ev.away_team))
    .filter((b): b is BookLine => !!b);
  if (!books.length) return null;
  const dk = books.find((b) => b.book === 'DraftKings') ?? books[0];
  const ht = TEAMS[home];
  const at = TEAMS[away];
  return {
    id: `${SEASON}-w${week}-${away}-${home}`.toLowerCase(),
    week,
    season: SEASON,
    kickoff: ev.commence_time,
    home,
    away,
    books,
    prop: synthProp(home, away, dk.spread),
    context: {
      homeRestDays: 7,
      awayRestDays: 7,
      divisionGame: ht.conference === at.conference && ht.division === at.division,
      weather: DOME_TEAMS.includes(home) ? 'dome' : 'clear',
    },
  };
}

export interface GamesResult {
  source: 'live' | 'seed';
  week: number;
  games: Game[];
  error?: string;
}

export async function getGames(week?: number): Promise<GamesResult> {
  const targetWeek = week ?? getCurrentWeek();
  const key = process.env.ODDS_API_KEY;

  // No key: seed layer only covers Week 1.
  if (!key) {
    return { source: 'seed', week: targetWeek, games: targetWeek === 1 ? WEEK1_GAMES : [] };
  }

  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/` +
      `?apiKey=${key}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=draftkings,fanduel`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Odds API ${res.status}`);
    const events = (await res.json()) as OddsApiEvent[];

    // Bucket live events into their NFL week and keep the requested week.
    const games = events
      .filter((e) => weekOf(new Date(e.commence_time)) === targetWeek)
      .map((e) => buildLiveGame(e, targetWeek))
      .filter((g): g is Game => !!g)
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

    // If the book hasn't posted this week yet, fall back to seed for Week 1.
    if (!games.length && targetWeek === 1) {
      return { source: 'seed', week: targetWeek, games: WEEK1_GAMES };
    }
    return { source: 'live', week: targetWeek, games };
  } catch (err) {
    return {
      source: 'seed',
      week: targetWeek,
      games: targetWeek === 1 ? WEEK1_GAMES : [],
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}

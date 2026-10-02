import { TEAMS } from './teams';
import { memo } from './cache';
import type { TeamAbbr } from './types';

/**
 * NFL news wire from ESPN's free news feed — the fastest free signal for
 * breaking status/roster news. It's ESPN's aggregation (recaps, injury reports,
 * inactives), not literal beat-writer Twitter, but it surfaces the same news
 * quickly. Items are tagged with the teams they mention so the Bet Now page can
 * prioritize news for the games you're about to bet.
 */

export interface NewsItem {
  headline: string;
  description?: string;
  published?: string;
  link?: string;
  source?: string;
  breaking?: boolean; // hard status keyword (ruled out / inactive / IR)
  teams: TeamAbbr[];
}

// Hard roster-status language the model's structured injury feed may not have yet.
const HARD_STATUS =
  /(ruled out|inactive|will not play|won't play|placed on ir|to ir|out for the season|season-ending|suspended|doubtful|carted off)/i;

const NICKNAME: [TeamAbbr, string, string][] = Object.values(TEAMS).map((t) => [
  t.abbr,
  `${t.city} ${t.name}`.toLowerCase(),
  t.name.toLowerCase(),
]);

function teamsFromText(text: string): TeamAbbr[] {
  const t = text.toLowerCase();
  const out = new Set<TeamAbbr>();
  for (const [abbr, full, nick] of NICKNAME) {
    if (t.includes(full) || t.includes(nick)) out.add(abbr);
  }
  return [...out];
}

interface EspnArticle {
  headline?: string;
  description?: string;
  published?: string;
  links?: { web?: { href?: string } };
  categories?: { description?: string }[];
}

async function fetchNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=40',
      { next: { revalidate: 120 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { articles?: EspnArticle[] };
    return (data.articles ?? [])
      .map((a) => {
        const catText = (a.categories ?? []).map((c) => c.description ?? '').join(' ');
        return {
          headline: a.headline ?? '',
          description: a.description,
          published: a.published,
          link: a.links?.web?.href,
          teams: teamsFromText(`${a.headline ?? ''} ${catText}`),
        };
      })
      .filter((n) => n.headline);
  } catch {
    return [];
  }
}

/** Cached NFL news wire (2-min TTL). */
export function getNflNews(): Promise<NewsItem[]> {
  return memo('nfl-news', 120_000, fetchNews);
}

/** News for the given teams first; falls back to league-wide if none match. */
export function relevantNews(all: NewsItem[], teams: Set<TeamAbbr>, limit = 10): NewsItem[] {
  const rel = all.filter((n) => n.teams.some((t) => teams.has(t)));
  return (rel.length ? rel : all).slice(0, limit);
}

// ---- Per-team beat-writer wire via Google News RSS (local + national) ----

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseGoogleNews(xml: string, team: TeamAbbr): NewsItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const b = m[1];
      const rawTitle = decode(b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
      const link = decode(b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
      const pub = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '').trim();
      const source = decode(b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? '');
      // Google titles read "Headline - Source"; strip the trailing source.
      const headline =
        source && rawTitle.endsWith(`- ${source}`)
          ? rawTitle.slice(0, -(source.length + 2)).trim()
          : rawTitle;
      return {
        headline,
        source: source || undefined,
        link: link || undefined,
        published: pub ? new Date(pub).toISOString() : undefined,
        teams: [team],
        breaking: HARD_STATUS.test(rawTitle),
      };
    })
    .filter((n) => n.headline && n.headline !== 'Google News');
}

async function fetchTeamNews(team: TeamAbbr): Promise<NewsItem[]> {
  const t = TEAMS[team];
  const base = `"${t.city} ${t.name}"`;
  // Two targeted beat-writer queries: (1) availability/injury, (2) role/usage/
  // depth-chart — the second is the real alpha for props & TD scorers.
  const queries = [
    `${base} (injury OR inactive OR questionable OR "ruled out" OR doubtful OR "did not practice" OR ` +
      `"limited practice" OR "practice report" OR "game-time decision" OR IR) when:5d`,
    `${base} ("depth chart" OR "snap count" OR "goal line" OR "red zone" OR starter OR promoted OR ` +
      `elevated OR "lead back" OR "every-down" OR workload OR carries OR targets OR "will start" OR ` +
      `benched OR committee OR "next man up" OR "RB1" OR "WR1") when:5d`,
    // Hyper-local: practice participation + what the head coach said at the podium.
    `${base} ("injury report" OR "did not participate" OR "limited participant" OR "full participant" OR ` +
      `"head coach" OR "coach said" OR presser OR "press conference" OR podium OR "designated to return" OR ` +
      `activated OR "ruled doubtful" OR "expected to play" OR "expected to miss") when:5d`,
  ];
  const lists = await Promise.all(
    queries.map(async (q) => {
      try {
        const res = await fetch(
          `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } },
        );
        if (!res.ok) return [] as NewsItem[];
        return parseGoogleNews(await res.text(), team).slice(0, 8);
      } catch {
        return [] as NewsItem[];
      }
    }),
  );
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const n of lists.flat()) {
    const k = n.headline.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out.slice(0, 20);
}

/** Beat-writer + local news for the given teams, injury/inactive-focused, deduped. */
export async function getTeamNews(teams: TeamAbbr[]): Promise<NewsItem[]> {
  const uniq = [...new Set(teams)];
  const lists = await Promise.all(
    uniq.map((t) => memo(`gnews-${t}`, 300_000, () => fetchTeamNews(t))),
  );
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const n of lists.flat().sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''))) {
    const k = n.headline.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

// ---- League-wide beat feeds (national writers), team-tagged ----

const LEAGUE_FEEDS: [string, string][] = [
  ['ProFootballTalk', 'https://profootballtalk.nbcsports.com/feed/'],
  ['CBS Sports', 'https://www.cbssports.com/rss/headlines/nfl/'],
  ['Yahoo Sports', 'https://sports.yahoo.com/nfl/rss.xml'],
  ['ESPN', 'https://www.espn.com/espn/rss/nfl/news'],
  ['SB Nation', 'https://www.sbnation.com/rss/nfl/index.xml'],
  ['Yardbarker', 'https://www.yardbarker.com/rss/sport/nfl'],
  ['Rotowire', 'https://www.rotowire.com/rss/news.php?sport=NFL'],
];

function parseRss(xml: string, sourceName: string): NewsItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const b = m[1];
      const title = decode(b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
      const link = decode(b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
      const pub = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '').trim();
      return {
        headline: title,
        source: sourceName,
        link: link || undefined,
        published: pub ? new Date(pub).toISOString() : undefined,
        teams: teamsFromText(title),
        breaking: HARD_STATUS.test(title),
      };
    })
    .filter((n) => n.headline && n.headline !== sourceName);
}

async function fetchLeagueFeeds(): Promise<NewsItem[]> {
  const lists = await Promise.all(
    LEAGUE_FEEDS.map(([name, url]) =>
      memo(`rss-${name}`, 300_000, async () => {
        try {
          const r = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 300 },
          });
          if (!r.ok) return [] as NewsItem[];
          return parseRss(await r.text(), name).slice(0, 25);
        } catch {
          return [] as NewsItem[];
        }
      }),
    ),
  );
  return lists.flat();
}

/**
 * The full wire for a set of teams: per-team local beat writers (Google News)
 * PLUS national beat feeds (PFT, CBS) tagged to those teams, merged and deduped.
 */
export async function getWire(teams: TeamAbbr[]): Promise<NewsItem[]> {
  const teamSet = new Set(teams);
  const [team, league] = await Promise.all([getTeamNews(teams), fetchLeagueFeeds()]);
  const leagueRel = league.filter((n) => n.teams.some((t) => teamSet.has(t)));
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const n of [...team, ...leagueRel].sort((a, b) =>
    (b.published ?? '').localeCompare(a.published ?? ''),
  )) {
    const k = n.headline.toLowerCase().slice(0, 60);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

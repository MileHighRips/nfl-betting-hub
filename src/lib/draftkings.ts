import { propKey } from './props';
import { TEAMS } from './teams';
import { promises as fs } from 'fs';
import path from 'path';
import type { LivePropMap, LivePropAltMap, TeamAbbr } from './types';
import type { PropMarket } from '@/data/props';

/**
 * Live DraftKings player-prop lines via DK's public (unofficial, keyless)
 * sportscontent API. One request per market covers the whole slate. Returns the
 * line lookup AND the real per-team player pool DK is posting, so the model
 * never recommends a player off a stale roster. No-store, so a refresh always
 * pulls the latest numbers. Region path defaults to Illinois (dkusil).
 *
 * DK's WAF intermittently 403s a server IP (rate-limit). To survive those
 * blocks, every successful pull is cached to disk and replayed (if recent)
 * when a fetch comes back empty — so props don't blank out during a hiccup.
 */

const CACHE_DIR = path.join(process.cwd(), 'data', 'store');
const CACHE_MAX_AGE = 6 * 3_600_000; // serve cached props up to 6h old during a block

async function readCache<T>(file: string): Promise<T | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(CACHE_DIR, file), 'utf-8')) as { at: number; data: T };
    return Date.now() - raw.at < CACHE_MAX_AGE ? raw.data : null;
  } catch {
    return null;
  }
}

async function writeCache(file: string, data: unknown): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, file), JSON.stringify({ at: Date.now(), data }), 'utf-8');
  } catch {
    /* cache is best-effort */
  }
}

const DK_BASE = 'https://sportsbook-nash.draftkings.com/api/sportscontent';
const DK_REGION = process.env.DK_REGION || 'dkusil'; // Illinois
const NFL_LEAGUE = '88808';

const NICK_TO_ABBR: Record<string, TeamAbbr> = Object.fromEntries(
  Object.values(TEAMS).map((t) => [t.name.toLowerCase(), t.abbr]),
);

function teamFromLabel(label: string | undefined): TeamAbbr | undefined {
  if (!label) return undefined;
  const tokens = label.trim().split(/\s+/);
  return NICK_TO_ABBR[tokens[tokens.length - 1]?.toLowerCase()];
}

// DraftKings category/subcategory → our prop market (main Over/Under lines).
const DK_MARKETS: { cat: string; sub: string; market: PropMarket }[] = [
  { cat: '1000', sub: '9524', market: 'Pass Yards' },
  { cat: '1001', sub: '9514', market: 'Rush Yards' },
  { cat: '1342', sub: '14114', market: 'Receiving Yards' },
  { cat: '1342', sub: '14115', market: 'Receptions' },
  { cat: '1000', sub: '9525', market: 'Pass TDs' },
  { cat: '1000', sub: '9517', market: 'Pass Attempts' },
  { cat: '1000', sub: '9522', market: 'Completions' },
  { cat: '1001', sub: '9518', market: 'Rush Attempts' },
  { cat: '1000', sub: '15937', market: 'Interceptions' },
  { cat: '1342', sub: '9523', market: 'Rush + Rec Yards' },
];

// Alternate ("N+") ladders. Selections carry the threshold in the label (e.g.
// "150+"), points is null — a hit means the stat reaches N or more.
const DK_ALT_MARKETS: { cat: string; sub: string; market: PropMarket }[] = [
  { cat: '1000', sub: '16569', market: 'Pass Yards' },
  { cat: '1000', sub: '16568', market: 'Pass TDs' },
  { cat: '1342', sub: '16570', market: 'Receiving Yards' },
  { cat: '1001', sub: '16571', market: 'Rush Yards' },
  { cat: '1342', sub: '16572', market: 'Rush + Rec Yards' },
];

interface DkParticipant {
  name?: string;
  type?: string;
  venueRole?: string;
}
interface DkSelection {
  marketId: string;
  label?: string;
  points?: number;
  displayOdds?: { american?: string };
  participants?: DkParticipant[];
}
interface DkResponse {
  events?: { id: string; participants?: { name?: string; venueRole?: string }[] }[];
  markets?: { id: string; eventId?: string; name?: string }[];
  selections?: DkSelection[];
}

/** DK renders negative odds with a Unicode minus (−); normalize to a number. */
function parseAmerican(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/\u2212/g, '-').replace(/[+,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

async function fetchSub(cat: string, sub: string): Promise<DkResponse | null> {
  try {
    const url = `${DK_BASE}/${DK_REGION}/v1/leagues/${NFL_LEAGUE}/categories/${cat}/subcategories/${sub}`;
    const res = await fetch(url, {
      next: { revalidate: 60 },
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as DkResponse;
  } catch {
    return null;
  }
}

export interface DkCandidate {
  player: string;
  market: PropMarket;
  team: TeamAbbr;
  line: number;
}

export interface DkPropsResult {
  lines: LivePropMap;
  byTeam: Partial<Record<TeamAbbr, DkCandidate[]>>;
  alts: LivePropAltMap;
}

/** Parse a DK alternate rung label like "150+" or "2+" into its numeric threshold. */
function parseAltThreshold(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const n = Number(label.replace(/[+\s,]/g, '').replace(/\u2212/g, '-'));
  return Number.isFinite(n) ? n : undefined;
}

/** Build the alternate ("N+") prop ladders, keyed by `${playerLower}|${market}`. */
async function fetchDkAltLadders(): Promise<LivePropAltMap> {
  const alts: LivePropAltMap = {};
  const results = await Promise.all(
    DK_ALT_MARKETS.map((m) => fetchSub(m.cat, m.sub).then((d) => ({ m, d }))),
  );
  for (const { m, d } of results) {
    if (!d?.selections) continue;
    for (const sel of d.selections) {
      const part = sel.participants?.find((p) => p.type === 'Player') ?? sel.participants?.[0];
      const player = part?.name;
      const line = parseAltThreshold(sel.label);
      const price = parseAmerican(sel.displayOdds?.american);
      if (!player || line == null || price == null) continue;
      const key = propKey(player, m.market);
      (alts[key] ??= []).push({ line, price });
    }
  }
  // Keep each ladder sorted low → high and drop duplicate rungs.
  for (const key of Object.keys(alts)) {
    const seen = new Set<number>();
    alts[key] = alts[key]
      .filter((r) => (seen.has(r.line) ? false : (seen.add(r.line), true)))
      .sort((a, b) => a.line - b.line);
  }
  return alts;
}

export async function fetchDraftKingsProps(): Promise<DkPropsResult> {
  const lines: LivePropMap = {};
  const byTeam: Partial<Record<TeamAbbr, DkCandidate[]>> = {};
  const seen = new Set<string>();

  const [results, alts] = await Promise.all([
    Promise.all(DK_MARKETS.map((m) => fetchSub(m.cat, m.sub).then((d) => ({ m, d })))),
    fetchDkAltLadders(),
  ]);

  for (const { m, d } of results) {
    if (!d?.selections) continue;

    // eventId -> { home, away } abbreviations, and marketId -> eventId.
    const eventTeams = new Map<string, { home?: TeamAbbr; away?: TeamAbbr }>();
    for (const ev of d.events ?? []) {
      const rec: { home?: TeamAbbr; away?: TeamAbbr } = {};
      for (const p of ev.participants ?? []) {
        const abbr = teamFromLabel(p.name);
        if (!abbr) continue;
        if (p.venueRole === 'Home') rec.home = abbr;
        else if (p.venueRole === 'Away') rec.away = abbr;
      }
      eventTeams.set(ev.id, rec);
    }
    const marketEvent = new Map<string, string>();
    for (const mk of d.markets ?? []) if (mk.eventId) marketEvent.set(mk.id, mk.eventId);

    const grouped = new Map<
      string,
      { over?: DkSelection; under?: DkSelection; player?: string; team?: TeamAbbr }
    >();
    for (const sel of d.selections) {
      const part = sel.participants?.find((p) => p.type === 'Player') ?? sel.participants?.[0];
      const player = part?.name;
      if (!player || sel.points == null) continue;
      const teams = eventTeams.get(marketEvent.get(sel.marketId) ?? '');
      const team = part?.venueRole?.startsWith('Home') ? teams?.home : teams?.away;
      const rec = grouped.get(sel.marketId) ?? {};
      rec.player = player;
      rec.team = team ?? rec.team;
      if (/under/i.test(sel.label ?? '')) rec.under = sel;
      else if (/over/i.test(sel.label ?? '')) rec.over = sel;
      grouped.set(sel.marketId, rec);
    }

    for (const rec of grouped.values()) {
      const line = rec.over?.points ?? rec.under?.points;
      if (!rec.player || line == null) continue;
      lines[propKey(rec.player, m.market)] = {
        line,
        overPrice: parseAmerican(rec.over?.displayOdds?.american) ?? -114,
        underPrice: parseAmerican(rec.under?.displayOdds?.american) ?? -114,
        book: 'DraftKings',
      };
      if (rec.team) {
        const key = `${rec.team}|${rec.player.toLowerCase()}|${m.market}`;
        if (!seen.has(key)) {
          seen.add(key);
          (byTeam[rec.team] ??= []).push({
            player: rec.player,
            market: m.market,
            team: rec.team,
            line,
          });
        }
      }
    }
  }

  // Good pull → refresh the cache. Blocked/empty pull → replay the last good one
  // (if recent) so props survive a transient DK 403 instead of vanishing.
  if (Object.keys(lines).length > 0) {
    const result = { lines, byTeam, alts };
    await writeCache('dk-props-cache.json', result);
    return result;
  }
  const cached = await readCache<DkPropsResult>('dk-props-cache.json');
  return cached ?? { lines, byTeam, alts };
}

export interface DkAtd {
  player: string;
  team: TeamAbbr;
  price: number;
}

/** Live DraftKings "Anytime TD Scorer" odds, grouped by team. */
export async function fetchDraftKingsAnytimeTDs(): Promise<Partial<Record<TeamAbbr, DkAtd[]>>> {
  const byTeam: Partial<Record<TeamAbbr, DkAtd[]>> = {};
  const d = await fetchSub('1003', '12438');
  if (!d?.selections) return (await readCache<Partial<Record<TeamAbbr, DkAtd[]>>>('dk-atd-cache.json')) ?? byTeam;

  const eventTeams = new Map<string, { home?: TeamAbbr; away?: TeamAbbr }>();
  for (const ev of d.events ?? []) {
    const rec: { home?: TeamAbbr; away?: TeamAbbr } = {};
    for (const p of ev.participants ?? []) {
      const abbr = teamFromLabel(p.name);
      if (!abbr) continue;
      if (p.venueRole === 'Home') rec.home = abbr;
      else if (p.venueRole === 'Away') rec.away = abbr;
    }
    eventTeams.set(ev.id, rec);
  }
  const marketEvent = new Map<string, string>();
  const marketName = new Map<string, string>();
  for (const m of d.markets ?? []) {
    if (m.eventId) marketEvent.set(m.id, m.eventId);
    if (m.name) marketName.set(m.id, m.name);
  }

  const seen = new Set<string>();
  for (const sel of d.selections) {
    if (!/anytime/i.test(marketName.get(sel.marketId) ?? '')) continue;
    const part = sel.participants?.find((p) => p.type === 'Player') ?? sel.participants?.[0];
    const player = part?.name;
    const price = parseAmerican(sel.displayOdds?.american);
    if (!player || price == null) continue;
    const teams = eventTeams.get(marketEvent.get(sel.marketId) ?? '');
    const team = part?.venueRole?.startsWith('Home') ? teams?.home : teams?.away;
    if (!team) continue;
    const key = `${team}|${player.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (byTeam[team] ??= []).push({ player, team, price });
  }
  // Good pull refreshes the cache; a later block replays it (see fetchDraftKingsProps).
  if (Object.keys(byTeam).length > 0) await writeCache('dk-atd-cache.json', byTeam);
  return byTeam;
}

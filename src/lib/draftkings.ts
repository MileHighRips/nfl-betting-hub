import { propKey } from './props';
import { TEAMS } from './teams';
import type { LivePropMap, TeamAbbr } from './types';
import type { PropMarket } from '@/data/props';

/**
 * Live DraftKings player-prop lines via DK's public (unofficial, keyless)
 * sportscontent API. One request per market covers the whole slate. Returns the
 * line lookup AND the real per-team player pool DK is posting, so the model
 * never recommends a player off a stale roster. No-store, so a refresh always
 * pulls the latest numbers. Region path defaults to Virginia (dkusva).
 */

const DK_BASE = 'https://sportsbook-nash.draftkings.com/api/sportscontent';
const DK_REGION = process.env.DK_REGION || 'dkusva';
const NFL_LEAGUE = '88808';

const NICK_TO_ABBR: Record<string, TeamAbbr> = Object.fromEntries(
  Object.values(TEAMS).map((t) => [t.name.toLowerCase(), t.abbr]),
);

function teamFromLabel(label: string | undefined): TeamAbbr | undefined {
  if (!label) return undefined;
  const tokens = label.trim().split(/\s+/);
  return NICK_TO_ABBR[tokens[tokens.length - 1]?.toLowerCase()];
}

// DraftKings category/subcategory → our prop market.
const DK_MARKETS: { cat: string; sub: string; market: PropMarket }[] = [
  { cat: '1000', sub: '9524', market: 'Pass Yards' },
  { cat: '1001', sub: '9514', market: 'Rush Yards' },
  { cat: '1342', sub: '14114', market: 'Receiving Yards' },
  { cat: '1342', sub: '14115', market: 'Receptions' },
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
}

export async function fetchDraftKingsProps(): Promise<DkPropsResult> {
  const lines: LivePropMap = {};
  const byTeam: Partial<Record<TeamAbbr, DkCandidate[]>> = {};
  const seen = new Set<string>();

  const results = await Promise.all(
    DK_MARKETS.map((m) => fetchSub(m.cat, m.sub).then((d) => ({ m, d }))),
  );

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

  return { lines, byTeam };
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
  if (!d?.selections) return byTeam;

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
  return byTeam;
}

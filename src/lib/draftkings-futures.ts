import { TEAMS } from './teams';
import type { TeamAbbr } from './types';

/**
 * Live DraftKings futures via the same public sportscontent API used for props.
 * Covers Super Bowl, Division winner, MVP, and regular-season win totals. No key
 * required; no-store so a refresh always reflects the latest posted prices.
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

function parseAmerican(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/\u2212/g, '-').replace(/[+,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

interface DkSelection {
  marketId: string;
  label?: string;
  points?: number;
  displayOdds?: { american?: string };
  participants?: { name?: string; type?: string }[];
}
interface DkResponse {
  markets?: { id: string; name?: string }[];
  selections?: DkSelection[];
}

async function fetchSub(cat: string, sub: string): Promise<DkResponse | null> {
  try {
    const url = `${DK_BASE}/${DK_REGION}/v1/leagues/${NFL_LEAGUE}/categories/${cat}/subcategories/${sub}`;
    const res = await fetch(url, {
      next: { revalidate: 120 },
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as DkResponse;
  } catch {
    return null;
  }
}

export interface LiveFuturesData {
  team: Record<string, number>; // `${market}|${abbr}` -> american price
  player: Record<string, number>; // `${market}|${playerLower}` -> american price
  winTotal: Record<string, { line: number; over: number; under: number }>;
}

export async function fetchDraftKingsFutures(): Promise<LiveFuturesData> {
  const out: LiveFuturesData = { team: {}, player: {}, winTotal: {} };

  const [sb, div, mvp, wins] = await Promise.all([
    fetchSub('529', '10500'), // Super Bowl winner
    fetchSub('529', '7293'), // Division winner
    fetchSub('787', '13339'), // Regular Season MVP
    fetchSub('1286', '13354'), // Regular Season Wins (O/U)
  ]);

  for (const sel of sb?.selections ?? []) {
    const abbr = teamFromLabel(sel.participants?.[0]?.name ?? sel.label);
    const price = parseAmerican(sel.displayOdds?.american);
    if (abbr && price != null) out.team[`Super Bowl|${abbr}`] = price;
  }

  for (const sel of div?.selections ?? []) {
    const abbr = teamFromLabel(sel.participants?.[0]?.name ?? sel.label);
    const price = parseAmerican(sel.displayOdds?.american);
    if (abbr && price != null) out.team[`Division|${abbr}`] = price;
  }

  for (const sel of mvp?.selections ?? []) {
    const player = sel.participants?.find((p) => p.type === 'Player')?.name ?? sel.label;
    const price = parseAmerican(sel.displayOdds?.american);
    if (player && price != null) out.player[`MVP|${player.toLowerCase()}`] = price;
  }

  if (wins?.selections?.length) {
    const byMarket = new Map<string, { over?: DkSelection; under?: DkSelection; abbr?: TeamAbbr }>();
    for (const sel of wins.selections) {
      const abbr = teamFromLabel(sel.participants?.[0]?.name);
      const rec = byMarket.get(sel.marketId) ?? {};
      if (abbr) rec.abbr = abbr;
      if (/under/i.test(sel.label ?? '')) rec.under = sel;
      else if (/over/i.test(sel.label ?? '')) rec.over = sel;
      byMarket.set(sel.marketId, rec);
    }
    for (const rec of byMarket.values()) {
      const line = rec.over?.points ?? rec.under?.points;
      if (!rec.abbr || line == null) continue;
      out.winTotal[rec.abbr] = {
        line,
        over: parseAmerican(rec.over?.displayOdds?.american) ?? -110,
        under: parseAmerican(rec.under?.displayOdds?.american) ?? -110,
      };
    }
  }

  return out;
}

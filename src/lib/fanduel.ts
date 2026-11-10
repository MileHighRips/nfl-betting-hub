import { TEAMS } from './teams';
import { memo } from './cache';
import { propKey } from './props';
import type { BookLine, LivePropAltMap, TeamAbbr } from './types';

/**
 * Live FanDuel game lines and a limited subset of alternate player props via
 * FanDuel's public (unofficial, keyless) sportsbook content API. The player
 * feed currently exposes only alternate passing/receiving yard ladders.
 */

const FD_AK = 'FhMFpcPWXMeyZxOx'; // public API key embedded in fanduel.com
const FD_REGION = process.env.FD_REGION || 'il'; // Illinois

const NAME_TO_ABBR: Record<string, TeamAbbr> = Object.fromEntries(
  Object.values(TEAMS).map((t) => [`${t.city} ${t.name}`.toLowerCase(), t.abbr]),
);

function fdAbbr(name: string | undefined): TeamAbbr | undefined {
  if (!name) return undefined;
  return NAME_TO_ABBR[name.trim().toLowerCase()];
}

interface FdRunner {
  runnerName?: string;
  runnerStatus?: string;
  handicap?: number;
  winRunnerOdds?: { americanDisplayOdds?: { americanOdds?: number } };
}
interface FdMarket {
  eventId?: number | string;
  marketType?: string;
  marketName?: string;
  marketStatus?: string;
  runners?: FdRunner[];
}
interface FdEvent {
  eventId?: number | string;
  name?: string;
}

function oddsOf(r: FdRunner | undefined): number | undefined {
  const o = r?.winRunnerOdds?.americanDisplayOdds?.americanOdds;
  return typeof o === 'number' ? o : undefined;
}

export interface FanDuelData {
  lines: Record<string, BookLine>;
  propAlts: LivePropAltMap;
}

function parseFanDuelPlayerAlts(
  events: FdEvent[],
  markets: FdMarket[],
): LivePropAltMap {
  const eventIds = new Set(
    events.flatMap((event) => (event.eventId == null ? [] : [String(event.eventId)])),
  );
  const propAlts: LivePropAltMap = {};

  for (const market of markets) {
    const propMarket =
      market.marketType === 'PLAYER_X_ALT_RECEIVING_YARDS_HIGH'
        ? 'Receiving Yards'
        : market.marketType === 'PLAYER_X_ALT_PASSING_YARDS_HIGH'
          ? 'Pass Yards'
          : undefined;
    const identity = market.marketName?.match(
      /^(.+?)\s+-\s+Alt\s+(Receiving|Passing)\s+Yds$/i,
    );
    if (
      !propMarket ||
      !identity ||
      (propMarket === 'Receiving Yards' ? 'receiving' : 'passing') !==
        identity[2].toLowerCase() ||
      market.marketStatus !== 'OPEN' ||
      market.eventId == null ||
      !eventIds.has(String(market.eventId))
    )
      continue;

    const player = identity[1].trim();
    for (const runner of market.runners ?? []) {
      if (runner.runnerStatus !== 'ACTIVE') continue;
      const selection = runner.runnerName?.match(
        /^(.+?)\s+(\d+(?:\.\d+)?)\+\s*(?:yards?)?$/i,
      );
      if (!selection || selection[1].trim().toLowerCase() !== player.toLowerCase())
        continue;
      const line = Number(selection[2]);
      const price = oddsOf(runner);
      if (!Number.isFinite(line) || price == null || price === 0) continue;

      const key = propKey(player, propMarket);
      const rungs = (propAlts[key] ??= []);
      if (rungs.some((rung) => rung.line === line && rung.book === 'FanDuel'))
        continue;
      rungs.push({ line, price, book: 'FanDuel' });
    }
  }
  return propAlts;
}

async function fetchFanDuelData(): Promise<FanDuelData> {
  const empty: FanDuelData = { lines: {}, propAlts: {} };
  const url =
    `https://sbapi.${FD_REGION}.sportsbook.fanduel.com/api/content-managed-page` +
    `?page=CUSTOM&customPageId=nfl&pbHorizontal=false&_ak=${FD_AK}&timezone=America%2FNew_York`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
        Referer: `https://${FD_REGION}.sportsbook.fanduel.com/`,
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.warn(`[FanDuel] Public NFL feed returned ${res.status}`);
      return empty;
    }
    const data = (await res.json()) as { attachments?: { events?: Record<string, FdEvent>; markets?: Record<string, FdMarket> } };
    const events = Object.values(data.attachments?.events ?? {});
    const markets = Object.values(data.attachments?.markets ?? {});

    const byEvent = new Map<string, FdMarket[]>();
    for (const m of markets) {
      const k = String(m.eventId);
      (byEvent.get(k) ?? byEvent.set(k, []).get(k)!).push(m);
    }

    const out: Record<string, BookLine> = {};
    for (const ev of events) {
      const name = ev.name ?? '';
      if (!name.includes('@')) continue; // skip futures/specials containers
      const [awayName, homeName] = name.split('@').map((s) => s.trim());
      const away = fdAbbr(awayName);
      const home = fdAbbr(homeName);
      if (!away || !home) continue;

      const ms = byEvent.get(String(ev.eventId)) ?? [];
      const spreadM = ms.find((m) => m.marketType === 'MATCH_HANDICAP_(2-WAY)');
      const totalM = ms.find((m) => m.marketType === 'TOTAL_POINTS_(OVER/UNDER)');
      const mlM = ms.find((m) => m.marketType === 'MONEY_LINE');

      const homeSpread = spreadM?.runners?.find((r) => fdAbbr(r.runnerName) === home);
      const awaySpread = spreadM?.runners?.find((r) => fdAbbr(r.runnerName) === away);
      const over = totalM?.runners?.find((r) => /over/i.test(r.runnerName ?? ''));
      const under = totalM?.runners?.find((r) => /under/i.test(r.runnerName ?? ''));
      const homeMl = mlM?.runners?.find((r) => fdAbbr(r.runnerName) === home);
      const awayMl = mlM?.runners?.find((r) => fdAbbr(r.runnerName) === away);

      const spread = homeSpread?.handicap;
      const total = over?.handicap;
      if (spread == null || total == null) continue; // need the core lines to shop

      out[`${away}-${home}`] = {
        book: 'FanDuel',
        spread,
        spreadPriceHome: oddsOf(homeSpread) ?? -110,
        spreadPriceAway: oddsOf(awaySpread) ?? -110,
        total,
        overPrice: oddsOf(over) ?? -110,
        underPrice: oddsOf(under) ?? -110,
        moneylineHome: oddsOf(homeMl) ?? -110,
        moneylineAway: oddsOf(awayMl) ?? 100,
      };
    }
    return { lines: out, propAlts: parseFanDuelPlayerAlts(events, markets) };
  } catch (error) {
    console.warn('[FanDuel] Failed to fetch public NFL feed', error);
    return empty;
  }
}

/** Cached FanDuel game lines and available prop ladders (60s TTL). */
export function getFanDuelData(): Promise<FanDuelData> {
  return memo('fanduel-data', 60_000, fetchFanDuelData);
}

/** FanDuel game lines keyed `${away}-${home}` (lowercase abbreviations). */
export async function getFanDuelLines(): Promise<Record<string, BookLine>> {
  return (await getFanDuelData()).lines;
}

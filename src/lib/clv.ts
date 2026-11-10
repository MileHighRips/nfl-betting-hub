import { promises as fs } from 'fs';
import path from 'path';
import { americanToProb, noVigProb } from './odds';
import type { AltRung, BookLine, Game, PlacedBet } from './types';
import { serializeStoreUpdate, writeJsonAtomically } from './store-io';

const STORE_DIR = path.join(process.cwd(), 'data', 'store');
const STORE_FILE = path.join(STORE_DIR, 'closing-lines.json');
const BETS_FILE = path.join(STORE_DIR, 'bets.json');

export interface CloseLine {
  capturedAt: string;
  spread: number;
  spreadPriceHome: number;
  spreadPriceAway: number;
  total: number;
  overPrice: number;
  underPrice: number;
  moneylineHome: number;
  moneylineAway: number;
  books?: Partial<Record<BookLine['book'], CloseMarketLine>>;
  props?: Record<string, ClosePropLine>;
  altProps?: Record<string, CloseAltLine>;
  propsCapturedAt?: string;
  anytimeTds?: Record<string, CloseAnytimeTdLine>;
  altLines?: Record<string, CloseAltLine>;
  marketHistory?: MarketMovement[];
}

interface CloseMarketLine {
  capturedAt: string;
  spread: number;
  spreadPriceHome: number;
  spreadPriceAway: number;
  total: number;
  overPrice: number;
  underPrice: number;
  moneylineHome: number;
  moneylineAway: number;
}

export interface ClosePropLine {
  line: number;
  overPrice: number;
  underPrice: number;
  book?: BookLine['book'];
  capturedAt?: string;
}

export interface CloseAnytimeTdLine {
  price: number;
  capturedAt?: string;
}

export interface CloseAltLine {
  price: number;
  opposingPrice?: number;
  book?: BookLine['book'];
  capturedAt: string;
}

export interface MarketMovement {
  capturedAt: string;
  key: string;
  market:
    | 'spread'
    | 'total'
    | 'moneyline'
    | 'player-prop'
    | 'anytime-td'
    | 'alt-spread'
    | 'alt-total'
    | 'alt-player-prop';
  selection: string;
  book?: BookLine['book'];
  line?: number;
  openingLine?: number;
  price: number;
  opposingPrice?: number;
}

export type CloseLines = Record<string, CloseLine>;

async function read(): Promise<CloseLines> {
  try {
    return JSON.parse(await fs.readFile(STORE_FILE, 'utf-8')) as CloseLines;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }
}

async function write(store: CloseLines): Promise<void> {
  await writeJsonAtomically(STORE_FILE, store);
}

export function getClosingLines(): Promise<CloseLines> {
  return read();
}

/** Weeks with placed bets that have not kicked off yet, even after the active week rolls. */
export async function getWeeksWithUpcomingBets(now = Date.now()): Promise<number[]> {
  let bets: PlacedBet[];
  try {
    bets = JSON.parse(await fs.readFile(BETS_FILE, 'utf-8')) as PlacedBet[];
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }

  return [
    ...new Set(
      bets.flatMap((bet) => {
        if (!bet.gameId || !bet.kickoff || Date.parse(bet.kickoff) <= now) return [];
        const week = bet.gameId.match(/-w(\d+)-/i)?.[1];
        return week ? [Number(week)] : [];
      }),
    ),
  ];
}

function materiallyDifferent(
  a: Omit<CloseMarketLine, 'capturedAt'>,
  b: Omit<CloseMarketLine, 'capturedAt'>,
): boolean {
  return (
    a.spread !== b.spread ||
    a.total !== b.total ||
    a.spreadPriceHome !== b.spreadPriceHome ||
    a.spreadPriceAway !== b.spreadPriceAway ||
    a.overPrice !== b.overPrice ||
    a.underPrice !== b.underPrice ||
    a.moneylineHome !== b.moneylineHome ||
    a.moneylineAway !== b.moneylineAway
  );
}

function marketSnapshot(book: BookLine): Omit<CloseMarketLine, 'capturedAt'> {
  return {
    spread: book.spread,
    spreadPriceHome: book.spreadPriceHome,
    spreadPriceAway: book.spreadPriceAway,
    total: book.total,
    overPrice: book.overPrice,
    underPrice: book.underPrice,
    moneylineHome: book.moneylineHome,
    moneylineAway: book.moneylineAway,
  };
}

function currentMarketMovements(game: Game, capturedAt: string): MarketMovement[] {
  const quotes: MarketMovement[] = [];
  const add = (
    market: MarketMovement['market'],
    selection: string,
    price: number,
    options: Omit<MarketMovement, 'capturedAt' | 'key' | 'market' | 'selection' | 'price'> = {},
  ) => {
    const key = `${options.book ?? 'unattributed'}|${market}|${selection}`;
    quotes.push({ capturedAt, key, market, selection, price, ...options });
  };

  for (const book of game.books) {
    add('spread', 'home', book.spreadPriceHome, {
      book: book.book,
      line: book.spread,
      openingLine: book.openSpread,
      opposingPrice: book.spreadPriceAway,
    });
    add('spread', 'away', book.spreadPriceAway, {
      book: book.book,
      line: -book.spread,
      openingLine: book.openSpread == null ? undefined : -book.openSpread,
      opposingPrice: book.spreadPriceHome,
    });
    add('total', 'over', book.overPrice, {
      book: book.book,
      line: book.total,
      openingLine: book.openTotal,
      opposingPrice: book.underPrice,
    });
    add('total', 'under', book.underPrice, {
      book: book.book,
      line: book.total,
      openingLine: book.openTotal,
      opposingPrice: book.overPrice,
    });
    add('moneyline', 'home', book.moneylineHome, {
      book: book.book,
      opposingPrice: book.moneylineAway,
    });
    add('moneyline', 'away', book.moneylineAway, {
      book: book.book,
      opposingPrice: book.moneylineHome,
    });
  }

  for (const [selection, line] of Object.entries(game.livePropLines ?? {})) {
    add('player-prop', `${selection}|over`, line.overPrice, {
      book: line.book,
      line: line.line,
      opposingPrice: line.underPrice,
    });
    add('player-prop', `${selection}|under`, line.underPrice, {
      book: line.book,
      line: line.line,
      opposingPrice: line.overPrice,
    });
  }

  for (const candidate of game.anytimeTdCandidates ?? []) {
    add('anytime-td', candidate.player.trim().toLowerCase(), candidate.price, {
      book: 'DraftKings',
    });
  }

  const addAltQuotes = (
    market: 'alt-spread' | 'alt-total',
    side: string,
    rungs: AltRung[] | undefined,
    opposing: AltRung[] | undefined,
    spreads = false,
  ) => {
    for (const rung of rungs ?? []) {
      const opposingRung = opposing?.find((candidate) =>
        spreads
          ? Math.abs(Math.abs(candidate.line) - Math.abs(rung.line)) < 0.01
          : Math.abs(candidate.line - rung.line) < 0.01,
      );
      add(market, `${side}|${rung.line.toFixed(1)}`, rung.price, {
        line: rung.line,
        ...(opposingRung ? { opposingPrice: opposingRung.price } : {}),
      });
    }
  };
  addAltQuotes('alt-spread', 'home', game.altLines?.spreadHome, game.altLines?.spreadAway, true);
  addAltQuotes('alt-spread', 'away', game.altLines?.spreadAway, game.altLines?.spreadHome, true);
  addAltQuotes('alt-total', 'over', game.altLines?.over, game.altLines?.under);
  addAltQuotes('alt-total', 'under', game.altLines?.under, game.altLines?.over);

  for (const [selection, rungs] of Object.entries(game.livePropAlts ?? {})) {
    for (const rung of rungs) {
      add('alt-player-prop', `${selection}|${rung.line.toFixed(1)}`, rung.price, {
        book: rung.book,
        line: rung.line,
      });
    }
  }

  return quotes;
}

function sameMovementQuote(a: MarketMovement, b: MarketMovement): boolean {
  return (
    a.market === b.market &&
    a.selection === b.selection &&
    a.book === b.book &&
    a.line === b.line &&
    a.openingLine === b.openingLine &&
    a.price === b.price &&
    a.opposingPrice === b.opposingPrice
  );
}

/**
 * Snapshot the current market for each game while it's still pre-kickoff. The
 * last pre-kickoff snapshot IS the closing line: once a game kicks we stop
 * overwriting, freezing it. This never touches locked pick snapshots.
 */
async function captureClosingLinesNow(games: Game[]): Promise<void> {
  const store = await read();
  let changed = false;
  for (const g of games) {
    if (
      g.status === 'in' ||
      g.status === 'post' ||
      !Number.isFinite(Date.parse(g.kickoff)) ||
      Date.parse(g.kickoff) <= Date.now()
    )
      continue; // frozen at kickoff
    const primaryBook = g.books[0];
    if (!primaryBook) continue;
    const existing = store[g.id];
    const capturedAt = new Date().toISOString();
    const snap = marketSnapshot(primaryBook);
    const books = { ...existing?.books };
    let booksChanged = false;
    for (const book of g.books) {
      const bookSnap = marketSnapshot(book);
      const previous = books[book.book];
      if (previous && !materiallyDifferent(previous, bookSnap)) continue;
      books[book.book] = { ...bookSnap, capturedAt };
      booksChanged = true;
    }
    const altLines: Record<string, CloseAltLine> = {};
    const addAltQuotes = (
      group: 'Alt Spread' | 'Alt Total',
      side: string,
      rungs: AltRung[] | undefined,
      opposing: AltRung[] | undefined,
      spreads = false,
    ) => {
      for (const rung of rungs ?? []) {
        const pairedRung = opposing?.find((candidate) =>
          spreads
            ? Math.abs(Math.abs(candidate.line) - Math.abs(rung.line)) < 0.01
            : Math.abs(candidate.line - rung.line) < 0.01,
        );
        altLines[`${group}|${side}|${rung.line.toFixed(1)}`] = {
          price: rung.price,
          ...(pairedRung ? { opposingPrice: pairedRung.price } : {}),
          capturedAt,
        };
      }
    };
    addAltQuotes('Alt Spread', 'home_spread', g.altLines?.spreadHome, g.altLines?.spreadAway, true);
    addAltQuotes('Alt Spread', 'away_spread', g.altLines?.spreadAway, g.altLines?.spreadHome, true);
    addAltQuotes('Alt Total', 'over', g.altLines?.over, g.altLines?.under);
    addAltQuotes('Alt Total', 'under', g.altLines?.under, g.altLines?.over);
    const props: Record<string, ClosePropLine> = {};
    const altProps: Record<string, CloseAltLine> = {};
    const anytimeTds: Record<string, CloseAnytimeTdLine> = {};
    const propCapturedAt = new Date().toISOString();
    for (const candidate of g.livePropCandidates ?? []) {
      const key = `${candidate.player.trim().toLowerCase()}|${candidate.market}`;
      const live = g.livePropLines?.[key];
      if (!live) continue;
      props[key] = {
        line: live.line,
        overPrice: live.overPrice,
        underPrice: live.underPrice,
        book: live.book,
        capturedAt: propCapturedAt,
      };
    }
    for (const candidate of g.anytimeTdCandidates ?? []) {
      anytimeTds[candidate.player.trim().toLowerCase()] = {
        price: candidate.price,
        capturedAt: propCapturedAt,
      };
    }
    for (const [propKey, rungs] of Object.entries(g.livePropAlts ?? {})) {
      for (const rung of rungs) {
        const book = rung.book ?? 'DraftKings';
        altProps[`${propKey}|${rung.line.toFixed(1)}|${book}`] = {
          price: rung.price,
          book,
          capturedAt: propCapturedAt,
        };
      }
    }
    const mergedProps = { ...existing?.props };
    const mergedAltProps = { ...existing?.altProps };
    const mergedAnytimeTds = { ...existing?.anytimeTds };
    const mergedAltLines = { ...existing?.altLines };
    const marketHistory = [...(existing?.marketHistory ?? [])];
    const latestMovementByKey = new Map<string, MarketMovement>();
    for (const movement of marketHistory) latestMovementByKey.set(movement.key, movement);
    let marketHistoryChanged = false;
    for (const movement of currentMarketMovements(g, capturedAt)) {
      const previous = latestMovementByKey.get(movement.key);
      if (previous && sameMovementQuote(previous, movement)) continue;
      marketHistory.push(movement);
      latestMovementByKey.set(movement.key, movement);
      marketHistoryChanged = true;
    }
    let propsChanged = false;
    let altPropsChanged = false;
    let anytimeTdsChanged = false;
    let altLinesChanged = false;
    for (const [key, prop] of Object.entries(props)) {
      const previous = mergedProps[key];
      if (
        previous?.line === prop.line &&
        previous.overPrice === prop.overPrice &&
        previous.underPrice === prop.underPrice &&
        previous.book === prop.book
      )
        continue;
      mergedProps[key] = prop;
      propsChanged = true;
    }
    for (const [key, candidate] of Object.entries(anytimeTds)) {
      if (mergedAnytimeTds[key]?.price === candidate.price) continue;
      mergedAnytimeTds[key] = candidate;
      anytimeTdsChanged = true;
    }
    for (const [key, quote] of Object.entries(altProps)) {
      if (mergedAltProps[key]?.price === quote.price) continue;
      mergedAltProps[key] = quote;
      altPropsChanged = true;
    }
    for (const [key, quote] of Object.entries(altLines)) {
      const previous = mergedAltLines[key];
      if (previous?.price === quote.price && previous.opposingPrice === quote.opposingPrice)
        continue;
      mergedAltLines[key] = quote;
      altLinesChanged = true;
    }
    if (
      existing &&
      !materiallyDifferent(existing, snap) &&
      !booksChanged &&
      !propsChanged &&
      !altPropsChanged &&
      !anytimeTdsChanged &&
      !altLinesChanged &&
      !marketHistoryChanged
    )
      continue;
    store[g.id] = {
      ...existing,
      ...snap,
      books,
      ...(Object.keys(mergedProps).length
        ? { props: mergedProps, ...(propsChanged ? { propsCapturedAt: propCapturedAt } : {}) }
        : {}),
      ...(Object.keys(mergedAltProps).length ? { altProps: mergedAltProps } : {}),
      ...(Object.keys(mergedAnytimeTds).length ? { anytimeTds: mergedAnytimeTds } : {}),
      ...(Object.keys(mergedAltLines).length ? { altLines: mergedAltLines } : {}),
      ...(marketHistory.length ? { marketHistory } : {}),
      capturedAt,
    };
    changed = true;
  }
  if (changed) await write(store);
}

/** Serialize concurrent captures so updates from different slates are not lost. */
export function captureClosingLines(games: Game[]): Promise<void> {
  return serializeStoreUpdate(STORE_FILE, () => captureClosingLinesNow(games));
}

/**
 * Add a saved pre-kickoff DraftKings prop snapshot to existing game closes.
 * This recovers historical prop CLV only when the snapshot falls between the
 * bet placement and kickoff; it never treats post-kickoff prices as a close.
 */
export function backfillClosingPropsFromCache(bets: PlacedBet[]): Promise<void> {
  return serializeStoreUpdate(STORE_FILE, () => backfillClosingPropsFromCacheNow(bets));
}

async function backfillClosingPropsFromCacheNow(bets: PlacedBet[]): Promise<void> {
  const cacheFile = path.join(STORE_DIR, 'dk-props-cache.json');
  let cache: {
    at: number;
    data?: { lines?: Record<string, ClosePropLine> };
  };
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, 'utf-8')) as typeof cache;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  if (!Number.isFinite(cache.at) || !cache.data?.lines) return;

  const store = await read();
  const capturedAt = new Date(cache.at).toISOString();
  let changed = false;
  for (const bet of bets) {
    if (
      !bet.gameId ||
      !bet.player ||
      !bet.propMarket ||
      !bet.kickoff ||
      !bet.placedAt ||
      !Number.isFinite(Date.parse(bet.kickoff)) ||
      !Number.isFinite(Date.parse(bet.placedAt)) ||
      cache.at <= Date.parse(bet.placedAt) ||
      cache.at >= Date.parse(bet.kickoff)
    )
      continue;
    const key = `${bet.player.trim().toLowerCase()}|${bet.propMarket}`;
    const prop = cache.data.lines[key];
    const close = store[bet.gameId];
    if (!prop || !close || close.props?.[key]) continue;
    close.props = { ...close.props, [key]: { ...prop, capturedAt } };
    changed = true;
  }

  const atdCacheFile = path.join(STORE_DIR, 'dk-atd-cache.json');
  try {
    const atdCache = JSON.parse(await fs.readFile(atdCacheFile, 'utf-8')) as {
      at: number;
      data?: Record<string, { player: string; team: string; price: number }[]>;
    };
    if (Number.isFinite(atdCache.at) && atdCache.data) {
      for (const bet of bets) {
        if (
          !bet.gameId ||
          !bet.player ||
          !bet.kickoff ||
          !bet.placedAt ||
          !Number.isFinite(Date.parse(bet.kickoff)) ||
          !Number.isFinite(Date.parse(bet.placedAt)) ||
          atdCache.at <= Date.parse(bet.placedAt) ||
          atdCache.at >= Date.parse(bet.kickoff)
        )
          continue;
        const matchup = bet.gameId.match(/-w\d+-([a-z]{2,3})-([a-z]{2,3})$/i);
        if (!matchup) continue;
        const teams = new Set(matchup.slice(1).map((team) => team.toUpperCase()));
        const candidate = Object.entries(atdCache.data)
          .filter(([team]) => teams.has(team.toUpperCase()))
          .flatMap(([, players]) => players ?? [])
          .find(
            (player) => player.player.trim().toLowerCase() === bet.player!.trim().toLowerCase(),
          );
        const close = store[bet.gameId];
        const key = bet.player.trim().toLowerCase();
        if (!candidate || !close || close.anytimeTds?.[key]) continue;
        close.anytimeTds = {
          ...close.anytimeTds,
          [key]: { price: candidate.price, capturedAt: new Date(atdCache.at).toISOString() },
        };
        changed = true;
      }
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  if (changed) await write(store);
}

/**
 * Closing-line value for a pick: how far the vig-free market moved toward our
 * side after placement. Positive = we beat the close.
 */
export function clvForPick(
  close: CloseLine | undefined,
  group: string,
  side: string | undefined,
  pickMarketProb: number,
): number | undefined {
  if (!close || !side) return undefined;
  let closeNoVig: number | undefined;
  if (group === 'Spread') {
    closeNoVig =
      side === 'home_spread'
        ? noVigProb(close.spreadPriceHome, close.spreadPriceAway)
        : noVigProb(close.spreadPriceAway, close.spreadPriceHome);
  } else if (group === 'Total') {
    closeNoVig =
      side === 'over'
        ? noVigProb(close.overPrice, close.underPrice)
        : noVigProb(close.underPrice, close.overPrice);
  } else if (group === 'Moneyline' || group === 'Upset') {
    closeNoVig =
      side === 'home_ml'
        ? noVigProb(close.moneylineHome, close.moneylineAway)
        : noVigProb(close.moneylineAway, close.moneylineHome);
  }
  if (closeNoVig == null) return undefined;
  return closeNoVig - pickMarketProb;
}

/** Calculate vig-free probability CLV plus favorable line movement, when known. */
export function clvForBet(
  close: CloseLine | undefined,
  bet: PlacedBet,
): { clv?: number; clvLine?: number; clvBasis?: 'market' | 'legacy' | 'odds' } {
  if (!close) return {};

  const group =
    bet.pickType ??
    bet.market.match(
      /·\s*(Alt Spread|Alt Total|Spread|Total|Moneyline|Upset|Prop|Anytime TD)$/,
    )?.[1];
  const legacyMarketProb = bet.placementSurface == null ? bet.marketProb : undefined;
  const placementProb =
    bet.placementMarketProb ??
    legacyMarketProb ??
    (Number.isFinite(bet.price) && bet.price !== 0 ? americanToProb(bet.price) : undefined);
  let clvBasis: 'market' | 'legacy' | 'odds' =
    bet.placementMarketProb != null ? 'market' : legacyMarketProb != null ? 'legacy' : 'odds';
  const selectedBook =
    bet.book === 'DraftKings' || bet.book === 'FanDuel' ? close.books?.[bet.book] : undefined;
  const marketClose = selectedBook ? { ...close, ...selectedBook } : close;
  const kickoffAt = bet.kickoff ? Date.parse(bet.kickoff) : NaN;
  const isPreKickoff = (capturedAt: string | undefined) => {
    const capturedAtMs = capturedAt ? Date.parse(capturedAt) : NaN;
    return (
      !Number.isFinite(kickoffAt) || (Number.isFinite(capturedAtMs) && capturedAtMs < kickoffAt)
    );
  };
  let clv: number | undefined;
  let clvLine: number | undefined;

  if (group === 'Spread') {
    if (!isPreKickoff(marketClose.capturedAt)) return {};
    if (bet.side && placementProb != null)
      clv = clvForPick(marketClose, group, bet.side, placementProb);
    if (bet.side && bet.line != null) {
      clvLine =
        bet.side === 'home_spread'
          ? bet.line - marketClose.spread
          : bet.side === 'away_spread'
            ? marketClose.spread + bet.line
            : undefined;
    }
  } else if (group === 'Total') {
    if (!isPreKickoff(marketClose.capturedAt)) return {};
    if (bet.side && placementProb != null)
      clv = clvForPick(marketClose, group, bet.side, placementProb);
    if (bet.side && bet.line != null) {
      clvLine =
        bet.side === 'over'
          ? marketClose.total - bet.line
          : bet.side === 'under'
            ? bet.line - marketClose.total
            : undefined;
    }
  } else if (group === 'Moneyline' || group === 'Upset') {
    if (!isPreKickoff(marketClose.capturedAt)) return {};
    if (bet.side && placementProb != null)
      clv = clvForPick(marketClose, group, bet.side, placementProb);
  } else if ((group === 'Alt Spread' || group === 'Alt Total') && bet.side && bet.line != null) {
    const key = `${group}|${bet.side}|${bet.line.toFixed(1)}`;
    const altClose = close.altLines?.[key];
    if (!altClose || !isPreKickoff(altClose.capturedAt)) return {};
    if (altClose.opposingPrice != null && placementProb != null) {
      clv = noVigProb(altClose.price, altClose.opposingPrice) - placementProb;
    } else if (Number.isFinite(bet.price) && bet.price !== 0) {
      clv = americanToProb(altClose.price) - americanToProb(bet.price);
    }
  } else if (group === 'Prop' && bet.player && bet.propMarket) {
    const key = `${bet.player.trim().toLowerCase()}|${bet.propMarket}`;
    if (bet.alternateLine && bet.line != null) {
      const lineKey = `${key}|${bet.line.toFixed(1)}`;
      const book = bet.book === 'FanDuel' ? 'FanDuel' : 'DraftKings';
      const altClose =
        close.altProps?.[`${lineKey}|${book}`] ??
        (book === 'DraftKings' ? close.altProps?.[lineKey] : undefined);
      if (!altClose || !isPreKickoff(altClose.capturedAt)) return {};
      if (Number.isFinite(bet.price) && bet.price !== 0) {
        clv = americanToProb(altClose.price) - americanToProb(bet.price);
        clvBasis = 'odds';
      }
      return clv != null && Number.isFinite(clv) ? { clv, clvBasis } : {};
    }
    const propClose = close.props?.[key];
    if (!propClose) return {};
    if (!isPreKickoff(propClose.capturedAt ?? close.propsCapturedAt ?? close.capturedAt)) return {};
    if (bet.side && placementProb != null) {
      const closeNoVig =
        bet.side === 'over'
          ? noVigProb(propClose.overPrice, propClose.underPrice)
          : bet.side === 'under'
            ? noVigProb(propClose.underPrice, propClose.overPrice)
            : undefined;
      if (closeNoVig != null) clv = closeNoVig - placementProb;
    }
    if (bet.side && bet.line != null) {
      clvLine =
        bet.side === 'over'
          ? propClose.line - bet.line
          : bet.side === 'under'
            ? bet.line - propClose.line
            : undefined;
    }
  } else if (group === 'Anytime TD' && bet.player) {
    const anytimeClose = close.anytimeTds?.[bet.player.trim().toLowerCase()];
    if (!isPreKickoff(anytimeClose?.capturedAt ?? close.capturedAt)) return {};
    const closePrice = anytimeClose?.price;
    if (closePrice != null && bet.price !== 0)
      clv = americanToProb(closePrice) - americanToProb(bet.price);
  }

  return {
    ...(clv != null && Number.isFinite(clv) ? { clv } : {}),
    ...(clvLine != null && Number.isFinite(clvLine) ? { clvLine } : {}),
    ...(clv != null && Number.isFinite(clv)
      ? {
          clvBasis:
            (group === 'Alt Spread' || group === 'Alt Total') &&
            close.altLines?.[`${group}|${bet.side}|${bet.line?.toFixed(1)}`]?.opposingPrice == null
              ? 'odds'
              : clvBasis,
        }
      : {}),
  };
}

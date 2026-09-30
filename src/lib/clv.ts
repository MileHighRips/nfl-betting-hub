import { promises as fs } from 'fs';
import path from 'path';
import { noVigProb } from './odds';
import type { Game } from './types';

const STORE_DIR = path.join(process.cwd(), 'data', 'store');
const STORE_FILE = path.join(STORE_DIR, 'closing-lines.json');

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
}

export type CloseLines = Record<string, CloseLine>;

async function read(): Promise<CloseLines> {
  try {
    return JSON.parse(await fs.readFile(STORE_FILE, 'utf-8')) as CloseLines;
  } catch {
    return {};
  }
}

async function write(store: CloseLines): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function getClosingLines(): Promise<CloseLines> {
  return read();
}

function materiallyDifferent(a: CloseLine, b: Omit<CloseLine, 'capturedAt'>): boolean {
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

/**
 * Snapshot the current market for each game while it's still pre-kickoff. The
 * last pre-kickoff snapshot IS the closing line: once a game kicks we stop
 * overwriting, freezing it. This never touches locked pick snapshots.
 */
export async function captureClosingLines(games: Game[]): Promise<void> {
  const store = await read();
  let changed = false;
  for (const g of games) {
    if (g.status === 'in' || g.status === 'post') continue; // frozen at kickoff
    const b = g.books[0];
    if (!b) continue;
    const snap: Omit<CloseLine, 'capturedAt'> = {
      spread: b.spread,
      spreadPriceHome: b.spreadPriceHome,
      spreadPriceAway: b.spreadPriceAway,
      total: b.total,
      overPrice: b.overPrice,
      underPrice: b.underPrice,
      moneylineHome: b.moneylineHome,
      moneylineAway: b.moneylineAway,
    };
    const existing = store[g.id];
    if (existing && !materiallyDifferent(existing, snap)) continue;
    store[g.id] = { capturedAt: new Date().toISOString(), ...snap };
    changed = true;
  }
  if (changed) await write(store);
}

/**
 * Closing-line value for a pick: how far the vig-free market moved toward our
 * side after we locked our price. Positive = we beat the close. Price/odds-based
 * (captures juice + moneyline/total moves); spread line moves show through the
 * de-vigged price. Returns undefined for markets without a stored close.
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

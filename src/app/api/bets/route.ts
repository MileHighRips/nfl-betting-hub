import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { PlacedBet } from '@/lib/types';

/**
 * File-backed bankroll store. Persists placed bets to data/store/bets.json so
 * your picks and P/L survive restarts when running locally. The client also
 * mirrors this to localStorage for instant reads/offline use.
 */

const STORE_DIR = path.join(process.cwd(), 'data', 'store');
const STORE_FILE = path.join(STORE_DIR, 'bets.json');

async function readStore(): Promise<PlacedBet[]> {
  try {
    const raw = await fs.readFile(STORE_FILE, 'utf-8');
    return JSON.parse(raw) as PlacedBet[];
  } catch {
    return [];
  }
}

async function writeStore(bets: PlacedBet[]): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(bets, null, 2), 'utf-8');
}

export async function GET() {
  const bets = await readStore();
  return NextResponse.json({ bets });
}

export async function POST(req: Request) {
  const bet = (await req.json()) as PlacedBet;
  const bets = await readStore();
  bets.unshift(bet);
  await writeStore(bets);
  return NextResponse.json({ ok: true, bets });
}

export async function PATCH(req: Request) {
  const { id, status } = (await req.json()) as { id: string; status: PlacedBet['status'] };
  const bets = await readStore();
  const idx = bets.findIndex((b) => b.id === id);
  if (idx >= 0) bets[idx].status = status;
  await writeStore(bets);
  return NextResponse.json({ ok: true, bets });
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id: string };
  let bets = await readStore();
  bets = bets.filter((b) => b.id !== id);
  await writeStore(bets);
  return NextResponse.json({ ok: true, bets });
}

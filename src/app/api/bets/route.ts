import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { serializeStoreUpdate, writeJsonAtomically } from '@/lib/store-io';
import type { PlacedBet } from '@/lib/types';
import { gradePendingBets } from '@/lib/grade';
import {
  backfillClosingPropsFromCache,
  captureClosingLines,
  clvForBet,
  getClosingLines,
} from '@/lib/clv';
import { getGames } from '@/lib/odds-source';
import { fetchEspnWeek } from '@/lib/espn';

/**
 * File-backed bankroll store. Persists placed bets to data/store/bets.json so
 * your picks and P/L survive restarts when running locally. The client also
 * mirrors this to localStorage for instant reads/offline use.
 */

const STORE_FILE = path.join(process.cwd(), 'data', 'store', 'bets.json');

async function readStore(): Promise<PlacedBet[]> {
  try {
    const raw = await fs.readFile(STORE_FILE, 'utf-8');
    return JSON.parse(raw) as PlacedBet[];
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeStore(bets: PlacedBet[]): Promise<void> {
  await writeJsonAtomically(STORE_FILE, bets);
}

async function updateStore(update: (bets: PlacedBet[]) => PlacedBet[]): Promise<PlacedBet[]> {
  return serializeStoreUpdate(STORE_FILE, async () => {
    const current = await readStore();
    const updated = update(current);
    if (JSON.stringify(updated) !== JSON.stringify(current)) await writeStore(updated);
    return updated;
  });
}

export async function GET() {
  const bets = await readStore();
  let graded = await gradePendingBets(bets);
  const now = Date.now();
  const weeksMissingKickoff = new Set<number>();
  for (const bet of graded) {
    if (!bet.gameId || bet.kickoff) continue;
    const week = bet.gameId.match(/-w(\d+)-/i)?.[1];
    if (week) weeksMissingKickoff.add(Number(week));
  }
  if (weeksMissingKickoff.size) {
    const schedules = await Promise.all(
      [...weeksMissingKickoff].map(async (week) => {
        try {
          return await fetchEspnWeek(week);
        } catch (error) {
          console.error(`Failed to backfill kickoff times for Week ${week}`, error);
          return [];
        }
      }),
    );
    const kickoffs = new Map(schedules.flat().map((game) => [game.id, game.kickoff]));
    graded = graded.map((bet) => {
      const kickoff = bet.gameId ? kickoffs.get(bet.gameId) : undefined;
      if (bet.kickoff || !kickoff) return bet;
      return { ...bet, kickoff };
    });
  }
  const openWeeks = new Set<number>();
  for (const bet of graded) {
    if (!bet.gameId || !bet.kickoff) continue;
    const kickoff = Date.parse(bet.kickoff);
    if (!Number.isFinite(kickoff) || kickoff <= now) continue;
    const week = bet.gameId.match(/-w(\d+)-/i)?.[1];
    if (week) openWeeks.add(Number(week));
  }
  await Promise.all(
    [...openWeeks].map(async (week) => {
      const result = await getGames(week);
      if (result.source === 'live') await captureClosingLines(result.games);
    }),
  );
  await backfillClosingPropsFromCache(graded);
  const closingLines = await getClosingLines();
  const withClv = graded.map((bet) => {
    const kickoff = bet.kickoff ? Date.parse(bet.kickoff) : NaN;
    const group =
      bet.pickType ??
      bet.market.match(
        /·\s*(Alt Spread|Alt Total|Spread|Total|Moneyline|Upset|Prop|Anytime TD)$/,
      )?.[1];
    const eligible = Boolean(
      bet.gameId &&
      ((group === 'Anytime TD' && bet.player) ||
        (bet.side &&
          (((group === 'Spread' ||
            group === 'Total' ||
            group === 'Alt Spread' ||
            group === 'Alt Total') &&
            bet.line != null) ||
            (group === 'Prop' && bet.player && bet.propMarket && bet.line != null) ||
            group === 'Moneyline' ||
            group === 'Upset'))),
    );
    const closingClv =
      eligible && Number.isFinite(kickoff) && now >= kickoff
        ? clvForBet(closingLines[bet.gameId!], bet)
        : {};
    const clv = closingClv.clv ?? bet.clv;
    const clvLine = closingClv.clvLine ?? bet.clvLine;
    const clvStatus: PlacedBet['clvStatus'] =
      clv != null || clvLine != null
        ? 'available'
        : eligible && Number.isFinite(kickoff) && now < kickoff
          ? 'pending'
          : 'unavailable';
    const clvUnavailableReason: PlacedBet['clvUnavailableReason'] =
      clvStatus !== 'unavailable'
        ? undefined
        : closingLines[bet.gameId ?? '']
          ? 'no-matching-market'
          : 'no-pre-kickoff-snapshot';
    return {
      ...bet,
      clv,
      clvLine,
      clvBasis: closingClv.clvBasis ?? bet.clvBasis,
      clvStatus,
      clvUnavailableReason,
    };
  });
  const updates = new Map(withClv.map((bet) => [bet.id, bet]));
  const saved = await updateStore((current) =>
    current.map((bet) => {
      const computed = updates.get(bet.id);
      if (!computed) return bet;
      return {
        ...bet,
        gameId: bet.gameId ?? computed.gameId,
        pickType: bet.pickType ?? computed.pickType,
        side: bet.side ?? computed.side,
        line: bet.line ?? computed.line,
        player: bet.player ?? computed.player,
        propMarket: bet.propMarket ?? computed.propMarket,
        kickoff: bet.kickoff ?? computed.kickoff,
        status: bet.manualStatus ? bet.status : computed.status,
        clv: computed.clv,
        clvLine: computed.clvLine,
        clvBasis: computed.clvBasis,
        clvStatus: computed.clvStatus,
        clvUnavailableReason: computed.clvUnavailableReason,
      };
    }),
  );
  return NextResponse.json({ bets: saved });
}

export async function POST(req: Request) {
  const bet = (await req.json()) as PlacedBet;
  const bets = await updateStore((current) => [
    bet,
    ...current.filter((existing) => existing.id !== bet.id),
  ]);
  return NextResponse.json({ ok: true, bets });
}

export async function PATCH(req: Request) {
  const { id, status, stakeUnits, unitSize } = (await req.json()) as {
    id: string;
    status?: PlacedBet['status'];
    stakeUnits?: number;
    unitSize?: number;
  };
  const bets = await updateStore((current) =>
    current.map((bet) => {
      if (bet.id !== id) return bet;
      return {
        ...bet,
        ...(status !== undefined ? { status, manualStatus: true } : {}),
        ...(stakeUnits !== undefined ? { stakeUnits } : {}),
        ...(unitSize !== undefined ? { unitSize } : {}),
      };
    }),
  );
  return NextResponse.json({ ok: true, bets });
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id: string };
  const bets = await updateStore((current) => current.filter((bet) => bet.id !== id));
  return NextResponse.json({ ok: true, bets });
}

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { lockGame, unlockGame } from '@/lib/pick-locks';

const GAME_ID = /^\d{4}-w\d{1,2}-[a-z]{2,3}-[a-z]{2,3}$/;

/** Manually lock or unlock a single game's picks. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const gameId = body?.gameId;
  const action = body?.action;

  if (typeof gameId !== 'string' || !GAME_ID.test(gameId) || (action !== 'lock' && action !== 'unlock')) {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const ok = action === 'lock' ? await lockGame(gameId) : await unlockGame(gameId);

  for (const p of ['/slate', '/picks', '/true-units', '/', '/value']) revalidatePath(p);

  return NextResponse.json({ ok });
}

import { NextResponse } from 'next/server';
import { runBacktest } from '@/lib/backtest';

export const dynamic = 'force-dynamic';

/** Walk-forward model scoreboard. Read-only; grades past weeks, never touches locks. */
export async function GET() {
  try {
    const report = await runBacktest();
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

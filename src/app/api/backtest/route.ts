import { NextResponse } from 'next/server';
import { runLivePickBacktest } from '@/lib/live-backtest';

export const dynamic = 'force-dynamic';

/** Live model scoreboard based on archived Bet Now picks and saved closing lines. */
export async function GET() {
  try {
    const report = await runLivePickBacktest();
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { captureScheduledResearch } from '@/lib/closing-line-scheduler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  if (!isAuthorized(request, secret))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const result = await captureScheduledResearch();
    return NextResponse.json(result, { status: result.status === 'captured' ? 200 : 503 });
  } catch (error) {
    console.error('[bet-now-archive] Scheduled capture failed:', error);
    return NextResponse.json({ error: 'Scheduled capture failed.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getGameStatuses } from '@/lib/live-status';

export const dynamic = 'force-dynamic';

export async function GET() {
  const statuses = await getGameStatuses();
  return NextResponse.json({ statuses });
}

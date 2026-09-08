import { NextResponse } from 'next/server';
import { getGames } from '@/lib/odds-source';

/**
 * Live odds via a free aggregator (The Odds API — free tier ~500 req/mo).
 * Set ODDS_API_KEY in .env.local to enable; without it the seed slate is served.
 * Sign up (free): https://the-odds-api.com/
 */
export const revalidate = 300;

export async function GET(req: Request) {
  const weekParam = new URL(req.url).searchParams.get('week');
  const week = weekParam ? Number(weekParam) : undefined;
  const result = await getGames(Number.isFinite(week) ? week : undefined);
  return NextResponse.json(result);
}

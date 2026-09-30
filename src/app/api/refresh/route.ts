import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { clearMemo } from '@/lib/cache';

/** Purge the cached ESPN/weather/injury fetches so unlocked picks re-pull fresh data. */
export async function POST() {
  clearMemo();
  // Revalidate every route under the root layout so all pages re-render fresh.
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
}

import { NextResponse } from 'next/server';
import {
  saveHandicapReview,
} from '@/lib/handicap-review';
import type { HandicapReview, HandicapReviewSnapshot } from '@/lib/handicap-review-schema';

export const dynamic = 'force-dynamic';

const MAX_NOTE_LENGTH = 2_000;
const MAX_SOURCES = 5;

function validSnapshot(value: unknown): value is HandicapReviewSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<HandicapReviewSnapshot>;
  return (
    typeof snapshot.key === 'string' &&
    snapshot.key.length > 0 &&
    snapshot.key.length <= 500 &&
    typeof snapshot.gameId === 'string' &&
    snapshot.gameId.length > 0 &&
    typeof snapshot.selection === 'string' &&
    typeof snapshot.pickType === 'string' &&
    typeof snapshot.price === 'number' &&
    Number.isFinite(snapshot.price) &&
    typeof snapshot.edge === 'number' &&
    Number.isFinite(snapshot.edge) &&
    (snapshot.line == null || Number.isFinite(snapshot.line)) &&
    (snapshot.modelProb == null || Number.isFinite(snapshot.modelProb)) &&
    (snapshot.marketProb == null || Number.isFinite(snapshot.marketProb)) &&
    (snapshot.confidence == null || Number.isFinite(snapshot.confidence)) &&
    (snapshot.evPercent == null || Number.isFinite(snapshot.evPercent)) &&
    (snapshot.valuePercent == null || Number.isFinite(snapshot.valuePercent)) &&
    (snapshot.betDollars == null || Number.isFinite(snapshot.betDollars)) &&
    (snapshot.netEv == null || Number.isFinite(snapshot.netEv))
  );
}

function validNote(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= 10 &&
    value.length <= MAX_NOTE_LENGTH
  );
}

function validSources(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SOURCES) return false;
  return value.every((source) => {
    if (typeof source !== 'string' || source.length > 2_000) return false;
    try {
      const url = new URL(source);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Review payload is required.' }, { status: 400 });
  }

  const input = body as Partial<HandicapReview>;
  if (
    !validSnapshot(input.snapshot) ||
    (input.decision !== 'approve' && input.decision !== 'pass') ||
    !validNote(input.matchupNote) ||
    !validNote(input.situationNote) ||
    !validNote(input.lineNote) ||
    !validSources(input.sources)
  ) {
    return NextResponse.json(
      {
        error:
          'Include a valid pick snapshot, three specific notes (at least 10 characters each), a decision, and 1–5 HTTP(S) source links.',
      },
      { status: 400 },
    );
  }

  const review: HandicapReview = {
    snapshot: input.snapshot,
    decision: input.decision,
    matchupNote: input.matchupNote.trim(),
    situationNote: input.situationNote.trim(),
    lineNote: input.lineNote.trim(),
    sources: input.sources.map((source) => source.trim()),
    reviewedAt: new Date().toISOString(),
  };

  try {
    await saveHandicapReview(review);
    return NextResponse.json({ review });
  } catch (error) {
    console.error('Failed to save handicap review', error);
    return NextResponse.json({ error: 'Unable to save the handicap review.' }, { status: 500 });
  }
}

export interface HandicapReviewSnapshot {
  key: string;
  gameId: string;
  selection: string;
  pickType: string;
  book?: string;
  line?: number;
  price: number;
  modelProb?: number;
  marketProb?: number;
  confidence?: number;
  edge: number;
  evPercent?: number;
  valuePercent?: number;
  betDollars?: number;
  netEv?: number;
}

export interface HandicapReview {
  snapshot: HandicapReviewSnapshot;
  decision: 'approve' | 'pass';
  matchupNote: string;
  situationNote: string;
  lineNote: string;
  sources: string[];
  reviewedAt: string;
}

export interface HandicapReviewDraft {
  matchupNote: string;
  situationNote: string;
  lineNote: string;
  sources: string[];
}

export type HandicapReviewStore = Record<string, HandicapReview>;

export function reviewMatchesSnapshot(
  review: HandicapReview | undefined,
  snapshot: HandicapReviewSnapshot,
): boolean {
  if (!review) return false;
  const saved = review.snapshot;
  return (
    saved.key === snapshot.key &&
    saved.gameId === snapshot.gameId &&
    saved.selection === snapshot.selection &&
    saved.pickType === snapshot.pickType &&
    saved.book === snapshot.book &&
    saved.line === snapshot.line &&
    saved.price === snapshot.price &&
    saved.modelProb === snapshot.modelProb &&
    saved.marketProb === snapshot.marketProb &&
    saved.confidence === snapshot.confidence &&
    saved.edge === snapshot.edge &&
    saved.evPercent === snapshot.evPercent &&
    saved.valuePercent === snapshot.valuePercent &&
    saved.betDollars === snapshot.betDollars &&
    saved.netEv === snapshot.netEv
  );
}

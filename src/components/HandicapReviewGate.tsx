'use client';

import { useState, type ComponentProps, type FormEvent } from 'react';
import { Check, ClipboardCheck, LoaderCircle } from 'lucide-react';
import PlaceBetButton from './PlaceBetButton';
import {
  reviewMatchesSnapshot,
  type HandicapReview,
  type HandicapReviewDraft,
  type HandicapReviewSnapshot,
} from '@/lib/handicap-review-schema';

interface Props {
  snapshot: HandicapReviewSnapshot;
  initialReview?: HandicapReview;
  researchDraft?: HandicapReviewDraft;
  evidence: { label: string; detail: string }[];
  sources: { headline: string; href: string; source?: string }[];
  placeBetProps: ComponentProps<typeof PlaceBetButton>;
}

export default function HandicapReviewGate({
  snapshot,
  initialReview,
  researchDraft,
  evidence,
  sources,
  placeBetProps,
}: Props) {
  const currentSavedReview = reviewMatchesSnapshot(initialReview, snapshot)
    ? initialReview
    : undefined;
  const [review, setReview] = useState(currentSavedReview);
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'pass'>(
    currentSavedReview?.decision ?? 'approve',
  );
  const [matchupNote, setMatchupNote] = useState(
    currentSavedReview?.matchupNote ?? researchDraft?.matchupNote ?? '',
  );
  const [situationNote, setSituationNote] = useState(
    currentSavedReview?.situationNote ?? researchDraft?.situationNote ?? '',
  );
  const [lineNote, setLineNote] = useState(
    currentSavedReview?.lineNote ?? researchDraft?.lineNote ?? '',
  );
  const [sourceText, setSourceText] = useState(
    currentSavedReview?.sources.join('\n') ?? researchDraft?.sources.join('\n') ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isCurrent = reviewMatchesSnapshot(review, snapshot);
  const approved = isCurrent && review?.decision === 'approve';
  const passed = isCurrent && review?.decision === 'pass';

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload: HandicapReview = {
      snapshot,
      decision,
      matchupNote,
      situationNote,
      lineNote,
      sources: sourceText
        .split(/\r?\n/)
        .map((source) => source.trim())
        .filter(Boolean),
      reviewedAt: new Date().toISOString(),
    };
    try {
      const response = await fetch('/api/handicap-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { review?: HandicapReview; error?: string };
      if (!response.ok || !result.review) {
        throw new Error(result.error ?? 'Unable to save the review.');
      }
      setReview(result.review);
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the review.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 w-full min-w-0 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
          <ClipboardCheck size={14} />
          Researched handicap review
          {approved && (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
              <Check size={11} /> Approved
            </span>
          )}
          {passed && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
              Passed
            </span>
          )}
          {review && !isCurrent && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
              Quote/model changed · re-review
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-100"
        >
          {open ? 'Close review' : approved || passed ? 'Edit review' : 'Review pick'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {evidence.map((item) => (
              <div
                key={`${item.label}-${item.detail}`}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
              >
                <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                  {item.label}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-2 text-[11px] leading-relaxed text-amber-200/90">
            Draft analysis includes football inference from projected score, pace, offense/defense
            profiles and prop projections. It cannot verify a specific coverage shell, blitz,
            personnel grouping or trench matchup; keep those claims qualified unless confirmed.
          </div>
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {sources.map((source) => (
                <a
                  key={`${source.href}-${source.headline}`}
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-100"
                >
                  {source.source ? `${source.source}: ` : ''}
                  {source.headline}
                </a>
              ))}
            </div>
          )}

          {researchDraft && (
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Draft notes below combine available box scores and reporting with a football read of
              the modeled matchup and likely game script. These are editable analytical inferences,
              not verified play-call or coverage data.
            </p>
          )}
          <form onSubmit={submitReview} className="grid gap-2">
            <label className="grid gap-1 text-[11px] font-medium text-zinc-300">
              Matchup / personnel read (what specifically favors or hurts this pick?)
              <textarea
                required
                minLength={10}
                maxLength={2000}
                value={matchupNote}
                onChange={(event) => setMatchupNote(event.target.value)}
                className="min-h-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-white"
                placeholder="Research notes will appear here when available."
              />
            </label>
            <label className="grid gap-1 text-[11px] font-medium text-zinc-300">
              Situation / expected production (role, usage, rest, injuries, script)
              <textarea
                required
                minLength={10}
                maxLength={2000}
                value={situationNote}
                onChange={(event) => setSituationNote(event.target.value)}
                className="min-h-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-white"
                placeholder="Research notes will appear here when available."
              />
            </label>
            <label className="grid gap-1 text-[11px] font-medium text-zinc-300">
              Handicapping the number (price/line, market disagreement, and what would make you
              pass)
              <textarea
                required
                minLength={10}
                maxLength={2000}
                value={lineNote}
                onChange={(event) => setLineNote(event.target.value)}
                className="min-h-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-white"
                placeholder="Research notes will appear here when available."
              />
            </label>
            <label className="grid gap-1 text-[11px] font-medium text-zinc-300">
              Source URLs (one per line; at least one required)
              <textarea
                required
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                className="min-h-14 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-white"
                placeholder="https://..."
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-zinc-300">
                Decision
                <select
                  value={decision}
                  onChange={(event) => setDecision(event.target.value as 'approve' | 'pass')}
                  className="ml-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-white"
                >
                  <option value="approve">Approve for Bet Now</option>
                  <option value="pass">Pass — do not bet</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {saving && <LoaderCircle size={13} className="animate-spin" />}
                Save review
              </button>
              {error && (
                <span role="alert" className="text-xs text-red-300">
                  {error}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {!approved && !passed && (
        <p className="mt-2 text-[11px] text-zinc-400">
          Review is optional. You can place this pick without opening or saving the review.
        </p>
      )}
      {passed && (
        <p className="mt-2 text-[11px] text-amber-300">
          This review is marked Pass, but you can still track the pick if you choose.
        </p>
      )}
      <div className="mt-2">
        <PlaceBetButton {...placeBetProps} />
      </div>
    </div>
  );
}

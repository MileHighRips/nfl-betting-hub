'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { allWeeks, TOTAL_WEEKS } from '@/lib/schedule';

export default function WeekSelector({
  week,
  currentWeek,
  basePath = '/slate',
}: {
  week: number;
  currentWeek: number;
  basePath?: string;
}) {
  const router = useRouter();
  const go = (w: number) => {
    const clamped = Math.max(1, Math.min(TOTAL_WEEKS, w));
    router.push(clamped === currentWeek ? basePath : `${basePath}?week=${clamped}`);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => go(week - 1)}
        disabled={week <= 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-300 transition hover:text-white disabled:opacity-40"
        aria-label="Previous week"
      >
        <ChevronLeft size={16} />
      </button>

      <select
        value={week}
        onChange={(e) => go(Number(e.target.value))}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-white outline-none focus:border-emerald-500/60"
      >
        {allWeeks().map((w) => (
          <option key={w} value={w}>
            Week {w}
            {w === currentWeek ? ' (current)' : ''}
          </option>
        ))}
      </select>

      <button
        onClick={() => go(week + 1)}
        disabled={week >= TOTAL_WEEKS}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-300 transition hover:text-white disabled:opacity-40"
        aria-label="Next week"
      >
        <ChevronRight size={16} />
      </button>

      {week !== currentWeek && (
        <button
          onClick={() => go(currentWeek)}
          className="ml-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
        >
          Jump to current
        </button>
      )}
    </div>
  );
}

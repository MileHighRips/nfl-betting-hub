'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Infinity as InfinityIcon } from 'lucide-react';
import clsx from 'clsx';

/**
 * Week / lifetime scope switcher for the pick pages. `scope` is either a week
 * number (that week's picks + results) or 'all' (the lifetime aggregate).
 */
export default function PicksScopeNav({
  scope,
  currentWeek,
  basePath,
}: {
  scope: number | 'all';
  currentWeek: number;
  basePath: string;
}) {
  const router = useRouter();
  const lifetime = scope === 'all';
  const week = lifetime ? currentWeek : scope;

  const goWeek = (w: number) => {
    const clamped = Math.max(1, Math.min(currentWeek, w));
    router.push(clamped === currentWeek ? basePath : `${basePath}?week=${clamped}`);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => router.push(`${basePath}?week=all`)}
        className={clsx(
          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
          lifetime
            ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-400 hover:text-white',
        )}
      >
        <InfinityIcon size={14} />
        Lifetime
      </button>

      <button
        onClick={() => goWeek(week - 1)}
        disabled={lifetime || week <= 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-300 transition hover:text-white disabled:opacity-40"
        aria-label="Previous week"
      >
        <ChevronLeft size={16} />
      </button>

      <select
        value={lifetime ? 'all' : week}
        onChange={(e) => (e.target.value === 'all' ? router.push(`${basePath}?week=all`) : goWeek(Number(e.target.value)))}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-white outline-none focus:border-emerald-500/60"
      >
        <option value="all">Lifetime</option>
        {Array.from({ length: currentWeek }, (_, i) => i + 1).map((w) => (
          <option key={w} value={w}>
            Week {w}
            {w === currentWeek ? ' (current)' : ''}
          </option>
        ))}
      </select>

      <button
        onClick={() => goWeek(week + 1)}
        disabled={lifetime || week >= currentWeek}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-300 transition hover:text-white disabled:opacity-40"
        aria-label="Next week"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

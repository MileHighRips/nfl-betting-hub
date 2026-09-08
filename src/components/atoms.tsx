import clsx from 'clsx';
import { TEAMS } from '@/lib/teams';
import type { TeamAbbr } from '@/lib/types';
import { confidenceBg, confidenceTone } from '@/lib/format';
import { formatOdds } from '@/lib/odds';

export function TeamBadge({ abbr, size = 34 }: { abbr: TeamAbbr; size?: number }) {
  const t = TEAMS[abbr];
  return (
    <div
      className="flex items-center justify-center rounded-lg font-black text-white shadow-inner"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})`,
        fontSize: size * 0.34,
      }}
      title={`${t.city} ${t.name}`}
    >
      {t.abbr}
    </div>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div
          className={clsx('h-full rounded-full', confidenceBg(value))}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={clsx('mono text-xs font-bold', confidenceTone(value))}>{value}%</span>
    </div>
  );
}

export function OddsBadge({ price, book }: { price: number; book?: string }) {
  return (
    <span className="mono inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs font-semibold text-zinc-200">
      {formatOdds(price)}
      {book && (
        <span className="text-[10px] text-zinc-500">
          {book === 'DraftKings' ? 'DK' : book === 'FanDuel' ? 'FD' : book}
        </span>
      )}
    </span>
  );
}

export function Chip({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'ken' | 'value' | 'fade';
}) {
  return (
    <span
      className={clsx(
        'chip',
        variant === 'ken' && 'chip-ken',
        variant === 'value' && 'chip-value',
        variant === 'fade' && 'chip-fade',
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] tracking-widest text-zinc-500 uppercase">{label}</div>
      <div className={clsx('mono mt-1 text-2xl font-bold', tone ?? 'text-white')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {icon && (
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-emerald-400">
          {icon}
        </div>
      )}
      <div>
        <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
      </div>
    </div>
  );
}

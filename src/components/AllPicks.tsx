'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ConfidenceBar, OddsBadge, Chip } from './atoms';
import PlaceBetButton from './PlaceBetButton';
import { fmtMoney } from '@/lib/format';
import { useBankroll } from '@/lib/store';

export type PickGroup = 'Spread' | 'Total' | 'Moneyline' | 'Prop' | 'Upset' | 'Futures';

export interface FlatPick {
  id: string;
  group: PickGroup;
  matchup: string; // e.g. "NE @ SEA" or "MVP"
  selection: string;
  confidence: number;
  edge: number;
  price: number;
  book: string;
  units: number;
  description: string; // for the tracker
  market: string; // for the tracker
  ken?: boolean;
}

const GROUPS: (PickGroup | 'All')[] = [
  'All',
  'Spread',
  'Total',
  'Moneyline',
  'Prop',
  'Upset',
  'Futures',
];

const GROUP_TONE: Record<PickGroup, string> = {
  Spread: 'text-sky-400',
  Total: 'text-violet-400',
  Moneyline: 'text-emerald-400',
  Prop: 'text-cyan-400',
  Upset: 'text-amber-400',
  Futures: 'text-[var(--color-gold)]',
};

export default function AllPicks({ picks }: { picks: FlatPick[] }) {
  const [filter, setFilter] = useState<(typeof GROUPS)[number]>('All');
  const [minConf, setMinConf] = useState(0);
  const { unitSize } = useBankroll();

  const shown = useMemo(
    () =>
      picks
        .filter((p) => (filter === 'All' ? true : p.group === filter))
        .filter((p) => p.confidence >= minConf)
        .sort((a, b) => b.confidence - a.confidence),
    [picks, filter, minConf],
  );

  const totalUnits = shown.reduce((s, p) => s + p.units, 0);
  const totalRisk = totalUnits * unitSize;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Picks Shown" value={String(shown.length)} />
        <Summary label="Total Units" value={`${totalUnits.toFixed(2)}u`} />
        <Summary label="Total Risk" value={fmtMoney(totalRisk)} sub={`@ ${fmtMoney(unitSize)}/u`} />
        <Summary
          label="Avg Confidence"
          value={`${shown.length ? Math.round(shown.reduce((s, p) => s + p.confidence, 0) / shown.length) : 0}%`}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setFilter(g)}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
              filter === g
                ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-400 hover:text-white',
            )}
          >
            {g}
            <span className="ml-1 text-[10px] text-zinc-500">
              {g === 'All' ? picks.length : picks.filter((p) => p.group === g).length}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
          Min conf
          <select
            value={minConf}
            onChange={(e) => setMinConf(Number(e.target.value))}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-white outline-none"
          >
            {[0, 55, 58, 60, 62, 65].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? 'Any' : `${v}%+`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Header row (desktop) */}
      <div className="hidden grid-cols-[90px_1fr_140px_120px_70px_110px] gap-3 px-3 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase lg:grid">
        <div>Type</div>
        <div>Selection</div>
        <div>Confidence</div>
        <div>Price</div>
        <div>Units</div>
        <div className="text-right">Action</div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {shown.map((p) => (
          <div
            key={p.id}
            className="card grid grid-cols-1 items-center gap-3 p-3 lg:grid-cols-[90px_1fr_140px_120px_70px_110px]"
          >
            <div className="flex items-center gap-2">
              <span className={clsx('text-xs font-bold', GROUP_TONE[p.group])}>{p.group}</span>
              {p.ken && <Chip variant="ken">Ken</Chip>}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{p.selection}</div>
              <div className="text-xs text-zinc-500">{p.matchup}</div>
            </div>
            <div>
              <ConfidenceBar value={p.confidence} />
            </div>
            <div className="flex items-center gap-2">
              <OddsBadge price={p.price} book={p.book} />
              {p.edge > 0 && (
                <span className="text-[10px] font-semibold text-emerald-400">
                  +{(p.edge * 100).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="mono text-sm font-bold text-white">{p.units.toFixed(2)}u</div>
            <div className="lg:text-right">
              <PlaceBetButton
                description={p.description}
                market={p.market}
                price={p.price}
                stakeUnits={p.units}
                confidence={p.confidence}
                source={p.ken ? 'ken' : 'model'}
                compact
              />
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="card p-8 text-center text-sm text-zinc-500">
            No picks match this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] tracking-widest text-zinc-500 uppercase">{label}</div>
      <div className="mono mt-1 text-xl font-bold text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

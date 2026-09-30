'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { FileDown } from 'lucide-react';
import { ConfidenceBar, OddsBadge, Chip } from './atoms';
import PlaceBetButton from './PlaceBetButton';
import { ResultBadge } from './GameCard';
import { fmtMoney } from '@/lib/format';
import { americanToProfit } from '@/lib/odds';
import { useBankroll } from '@/lib/store';
import type { PickType } from '@/lib/types';

export type PickGroup = 'Spread' | 'Total' | 'Moneyline' | 'Prop' | 'Upset' | 'Anytime TD' | 'Futures';

export interface FlatPick {
  id: string;
  group: PickGroup;
  matchup: string; // e.g. "NE @ SEA" or "MVP"
  kickoff?: string;
  gameId?: string;
  pickType?: PickType;
  side?: string;
  line?: number;
  player?: string;
  propMarket?: string;
  selection: string;
  confidence: number;
  edge: number;
  price: number;
  book: string;
  units: number;
  /** Model's true conviction stake (uncapped quarter-Kelly). */
  trueUnits: number;
  /** Season week this pick belongs to (undefined for season-long futures). */
  week?: number;
  /** Closing-line value (vig-free prob beaten); + = beat the close. */
  clv?: number;
  description: string; // for the tracker
  market: string; // for the tracker
  ken?: boolean;
  result?: 'won' | 'lost' | 'push';
}

const GROUPS: (PickGroup | 'All')[] = [
  'All',
  'Spread',
  'Total',
  'Moneyline',
  'Prop',
  'Anytime TD',
  'Upset',
  'Futures',
];

const GROUP_TONE: Record<PickGroup, string> = {
  Spread: 'text-sky-400',
  Total: 'text-violet-400',
  Moneyline: 'text-emerald-400',
  Prop: 'text-cyan-400',
  'Anytime TD': 'text-orange-400',
  Upset: 'text-amber-400',
  Futures: 'text-[var(--color-gold)]',
};

// NFL week runs Thu → Mon; order the day filter accordingly.
const DAY_ORDER = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'];

function kickoffDay(iso?: string): string | undefined {
  if (!iso) return undefined;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(new Date(iso));
}

export default function AllPicks({ picks }: { picks: FlatPick[] }) {
  const [filter, setFilter] = useState<(typeof GROUPS)[number]>('All');
  const [minConf, setMinConf] = useState(0);
  const [day, setDay] = useState('All');
  const [hideFutures, setHideFutures] = useState(false);
  const { unitSize } = useBankroll();

  const hasFutures = picks.some((p) => p.group === 'Futures');
  const days = useMemo(() => {
    const set = new Set<string>();
    for (const p of picks) {
      const d = kickoffDay(p.kickoff);
      if (d) set.add(d);
    }
    return DAY_ORDER.filter((d) => set.has(d));
  }, [picks]);

  const shown = useMemo(
    () =>
      picks
        .filter((p) => (filter === 'All' ? true : p.group === filter))
        .filter((p) => (hideFutures ? p.group !== 'Futures' : true))
        .filter((p) => (day === 'All' ? true : kickoffDay(p.kickoff) === day))
        .filter((p) => p.confidence >= minConf)
        .sort((a, b) => {
          if (a.kickoff && b.kickoff) {
            const kickoffOrder = new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
            if (kickoffOrder !== 0) return kickoffOrder;
          } else if (a.kickoff) {
            return -1;
          } else if (b.kickoff) {
            return 1;
          }
          const matchupOrder = a.matchup.localeCompare(b.matchup);
          return matchupOrder !== 0 ? matchupOrder : b.confidence - a.confidence;
        }),
    [picks, filter, minConf, day, hideFutures],
  );

  const totalUnits = shown.reduce((s, p) => s + p.units, 0);
  const totalRisk = totalUnits * unitSize;

  // Settled KPIs across all graded picks (whole slate, not just the filter).
  const graded = picks.filter((p) => p.result);
  const won = graded.filter((p) => p.result === 'won').length;
  const lost = graded.filter((p) => p.result === 'lost').length;
  const push = graded.filter((p) => p.result === 'push').length;
  const unitsPL = graded.reduce((s, p) => {
    if (p.result === 'won') return s + p.units * americanToProfit(p.price);
    if (p.result === 'lost') return s - p.units;
    return s;
  }, 0);
  const staked = graded.filter((p) => p.result !== 'push').reduce((s, p) => s + p.units, 0);
  const roi = staked > 0 ? unitsPL / staked : 0;

  // Closing-line value across picks that have a captured close — the truest
  // measure of whether we're beating the market, independent of win/loss luck.
  const clvPicks = shown.filter((p) => p.clv != null);
  const avgClv = clvPicks.length
    ? clvPicks.reduce((s, p) => s + (p.clv as number), 0) / clvPicks.length
    : null;

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

      {/* Settled results KPIs */}
      {graded.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary
            label="Record"
            value={`${won}-${lost}${push ? `-${push}` : ''}`}
            sub={`${graded.length} settled`}
          />
          <Summary
            label="Units P/L"
            value={`${unitsPL >= 0 ? '+' : ''}${unitsPL.toFixed(2)}u`}
            tone={unitsPL >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <Summary
            label="Profit / Loss"
            value={fmtMoney(unitsPL * unitSize)}
            tone={unitsPL >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <Summary
            label="ROI"
            value={`${roi >= 0 ? '+' : ''}${(roi * 100).toFixed(1)}%`}
            tone={roi >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
        </div>
      )}

      {/* Closing-line value */}
      {avgClv != null && (
        <div className="grid grid-cols-1 gap-3">
          <Summary
            label="Avg CLV (Closing-Line Value)"
            value={`${avgClv >= 0 ? '+' : ''}${(avgClv * 100).toFixed(2)}%`}
            tone={avgClv >= 0 ? 'text-emerald-400' : 'text-red-400'}
            sub={`${clvPicks.length} picks vs close · ${avgClv >= 0 ? 'beating' : 'behind'} the market`}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
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
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {hasFutures && (
            <button
              type="button"
              onClick={() => setHideFutures((v) => !v)}
              className={clsx(
                'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                hideFutures
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-400 hover:text-white',
              )}
              title="Hide season-long futures from the list"
            >
              {hideFutures ? 'Futures Hidden' : 'Hide Futures'}
            </button>
          )}
          {days.length > 1 && (
            <label className="flex items-center gap-2">
              Day
              <select
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-white outline-none"
              >
                <option value="All">All days</option>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
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
          </label>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
          title="Export the ordered picks as a PDF"
        >
          <FileDown size={14} />
          Export PDF
        </button>
      </div>

      {/* Header row (desktop) */}
      <div className="hidden grid-cols-[90px_1fr_140px_120px_70px_110px] gap-3 px-3 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase lg:grid">
        <div>Type</div>
        <div>Selection</div>
        <div>Confidence</div>
        <div>Price</div>
        <div>Units</div>
        <div className="pick-action text-right">Action</div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {shown.map((p) => (
          <div
            key={p.id}
            className="pick-row card grid grid-cols-1 items-center gap-3 p-3 lg:grid-cols-[90px_1fr_140px_120px_70px_110px]"
          >
            <div className="flex items-center gap-2">
              <span className={clsx('text-xs font-bold', GROUP_TONE[p.group])}>{p.group}</span>
              {p.ken && <Chip variant="ken">Ken</Chip>}
              <ResultBadge result={p.result} />
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
            <div className="pick-action lg:text-right">
              {p.units > 0 ? (
                <PlaceBetButton
                  description={p.description}
                  market={p.market}
                  price={p.price}
                  stakeUnits={p.units}
                  confidence={p.confidence}
                  source={p.ken ? 'ken' : 'model'}
                  gameId={p.gameId}
                  pickType={p.pickType}
                  side={p.side}
                  line={p.line}
                  player={p.player}
                  propMarket={p.propMarket}
                  compact
                />
              ) : (
                <span className="chip">No value</span>
              )}
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

function Summary({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] tracking-widest text-zinc-500 uppercase">{label}</div>
      <div className={clsx('mono mt-1 text-xl font-bold', tone ?? 'text-white')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

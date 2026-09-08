'use client';

import { useState } from 'react';
import { ClipboardList, Check, X, Minus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useBankroll } from '@/lib/store';
import { fmtMoney, fmtSignedPct } from '@/lib/format';
import { formatOdds, americanToProfit } from '@/lib/odds';
import { SectionTitle, Chip } from '@/components/atoms';
import type { PlacedBet } from '@/lib/types';

export default function TrackerPage() {
  const { bets, stats, unitSize, setUnitSize, updateStatus, removeBet } = useBankroll();
  const [filter, setFilter] = useState<'all' | PlacedBet['status']>('all');

  const shown = bets.filter((b) => (filter === 'all' ? true : b.status === filter));

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Bet Tracker & Bankroll"
        subtitle="Every placed pick, settle results, and watch your profit/loss update live"
        icon={<ClipboardList size={18} />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Net P/L"
          value={fmtMoney(stats.profit)}
          tone={stats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          sub={`ROI ${fmtSignedPct(stats.roi)}`}
        />
        <StatCard label="Record" value={stats.record} sub={`${stats.placed} placed`} />
        <StatCard
          label="Staked (settled)"
          value={fmtMoney(stats.staked)}
          sub={`${stats.won + stats.lost + stats.push} settled`}
        />
        <StatCard
          label="Pending Risk"
          value={fmtMoney(stats.pendingRisk)}
          sub={`${stats.pending} open`}
        />
      </div>

      {/* Unit control */}
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div>
          <div className="text-[10px] tracking-widest text-zinc-500 uppercase">Unit Size</div>
          <div className="mono text-lg font-bold text-white">{fmtMoney(unitSize)}</div>
        </div>
        <div className="flex items-center gap-2">
          {[5, 10, 25, 50, 100].map((u) => (
            <button
              key={u}
              onClick={() => setUnitSize(u)}
              className={clsx(
                'rounded-lg border px-3 py-1.5 text-sm font-semibold transition',
                unitSize === u
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-400 hover:text-white',
              )}
            >
              ${u}
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={unitSize}
            onChange={(e) => setUnitSize(Math.max(1, Number(e.target.value) || 1))}
            className="mono w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-500/60"
          />
        </div>
        <p className="ml-auto max-w-xs text-xs text-zinc-500">
          Changing unit size re-values pending stakes. Settled results keep the unit size they were
          placed at.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'won', 'lost', 'push'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition',
              filter === f
                ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-400 hover:text-white',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Bet list */}
      {shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-500">
          No bets here yet. Head to the Slate or Futures and hit &ldquo;Place&rdquo; to start
          tracking.
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((b) => (
            <BetRow key={b.id} bet={b} onStatus={updateStatus} onRemove={removeBet} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] tracking-widest text-zinc-500 uppercase">{label}</div>
      <div className={clsx('mono mt-1 text-xl font-bold', tone ?? 'text-white')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function BetRow({
  bet,
  onStatus,
  onRemove,
}: {
  bet: PlacedBet;
  onStatus: (id: string, s: PlacedBet['status']) => void;
  onRemove: (id: string) => void;
}) {
  const risk = bet.stakeUnits * bet.unitSize;
  const toWin = risk * americanToProfit(bet.price);
  const result = bet.status === 'won' ? toWin : bet.status === 'lost' ? -risk : 0;

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{bet.description}</span>
          {bet.source === 'ken' && <Chip variant="ken">Ken</Chip>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{bet.market}</span>
          <span className="mono">{formatOdds(bet.price)}</span>
          <span className="mono">
            {bet.stakeUnits}u · {fmtMoney(risk)}
          </span>
          <span className="mono">to win {fmtMoney(toWin)}</span>
          {bet.confidence != null && <span>{bet.confidence}% conf</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {bet.status !== 'pending' && (
          <span
            className={clsx(
              'mono w-20 text-right text-sm font-bold',
              bet.status === 'won' && 'text-emerald-400',
              bet.status === 'lost' && 'text-red-400',
              bet.status === 'push' && 'text-zinc-400',
            )}
          >
            {bet.status === 'push' ? 'Push' : fmtMoney(result)}
          </span>
        )}
        <div className="flex items-center gap-1">
          <IconBtn
            active={bet.status === 'won'}
            tone="emerald"
            onClick={() => onStatus(bet.id, bet.status === 'won' ? 'pending' : 'won')}
            title="Won"
          >
            <Check size={14} />
          </IconBtn>
          <IconBtn
            active={bet.status === 'lost'}
            tone="red"
            onClick={() => onStatus(bet.id, bet.status === 'lost' ? 'pending' : 'lost')}
            title="Lost"
          >
            <X size={14} />
          </IconBtn>
          <IconBtn
            active={bet.status === 'push'}
            tone="zinc"
            onClick={() => onStatus(bet.id, bet.status === 'push' ? 'pending' : 'push')}
            title="Push"
          >
            <Minus size={14} />
          </IconBtn>
          <IconBtn tone="zinc" onClick={() => onRemove(bet.id)} title="Remove">
            <Trash2 size={14} />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  active,
  tone,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  tone: 'emerald' | 'red' | 'zinc';
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={clsx(
        'flex h-8 w-8 items-center justify-center rounded-lg border transition',
        active && tone === 'emerald' && 'border-emerald-500 bg-emerald-500/15 text-emerald-400',
        active && tone === 'red' && 'border-red-500 bg-red-500/15 text-red-400',
        active && tone === 'zinc' && 'border-zinc-500 bg-zinc-500/15 text-zinc-300',
        !active &&
          'border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-500 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

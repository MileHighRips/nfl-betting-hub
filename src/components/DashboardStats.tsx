'use client';

import { useBankroll } from '@/lib/store';
import { fmtMoney, fmtSignedPct } from '@/lib/format';
import clsx from 'clsx';

export default function DashboardStats() {
  const { stats, unitSize, pendingLabel } = useBankrollView();
  const positive = stats.profit >= 0;

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="card p-4">
        <div className="text-[10px] tracking-widest text-zinc-500 uppercase">Net Profit / Loss</div>
        <div
          className={clsx(
            'mono mt-1 text-2xl font-bold',
            positive ? 'text-emerald-400' : 'text-red-400',
          )}
        >
          {fmtMoney(stats.profit)}
        </div>
        <div className="mt-0.5 text-xs text-zinc-500">ROI {fmtSignedPct(stats.roi)}</div>
      </div>
      <div className="card p-4">
        <div className="text-[10px] tracking-widest text-zinc-500 uppercase">Record</div>
        <div className="mono mt-1 text-2xl font-bold text-white">{stats.record}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{stats.placed} bets placed</div>
      </div>
      <div className="card p-4">
        <div className="text-[10px] tracking-widest text-zinc-500 uppercase">Pending</div>
        <div className="mono mt-1 text-2xl font-bold text-white">{stats.pending}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{pendingLabel}</div>
      </div>
      <div className="card p-4">
        <div className="text-[10px] tracking-widest text-zinc-500 uppercase">Unit Size</div>
        <div className="mono mt-1 text-2xl font-bold text-white">{fmtMoney(unitSize)}</div>
        <div className="mt-0.5 text-xs text-zinc-500">1 unit = configurable</div>
      </div>
    </section>
  );
}

function useBankrollView() {
  const { stats, unitSize } = useBankroll();
  return {
    stats,
    unitSize,
    pendingLabel: `${fmtMoney(stats.pendingRisk)} at risk`,
  };
}

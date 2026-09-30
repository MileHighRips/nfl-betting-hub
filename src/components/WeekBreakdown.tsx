'use client';

import clsx from 'clsx';
import { americanToProfit } from '@/lib/odds';
import { fmtMoney } from '@/lib/format';
import { useBankroll } from '@/lib/store';
import type { FlatPick } from './AllPicks';

interface Row {
  label: string;
  bets: number;
  record: string;
  unitsPL: number;
  roi: number;
}

function tally(label: string, ps: FlatPick[]): Row {
  const won = ps.filter((p) => p.result === 'won').length;
  const lost = ps.filter((p) => p.result === 'lost').length;
  const push = ps.filter((p) => p.result === 'push').length;
  const unitsPL = ps.reduce((s, p) => {
    if (p.result === 'won') return s + p.units * americanToProfit(p.price);
    if (p.result === 'lost') return s - p.units;
    return s;
  }, 0);
  const staked = ps.filter((p) => p.result !== 'push').reduce((s, p) => s + p.units, 0);
  return {
    label,
    bets: ps.length,
    record: `${won}-${lost}${push ? `-${push}` : ''}`,
    unitsPL,
    roi: staked > 0 ? unitsPL / staked : 0,
  };
}

/** Per-week results breakdown with a lifetime total row (settled picks only). */
export default function WeekBreakdown({ picks }: { picks: FlatPick[] }) {
  const { unitSize } = useBankroll();
  const graded = picks.filter((p) => p.result && p.week != null);
  if (graded.length === 0) return null;

  const byWeek = new Map<number, FlatPick[]>();
  for (const p of graded) {
    const list = byWeek.get(p.week!) ?? [];
    list.push(p);
    byWeek.set(p.week!, list);
  }
  const rows = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, ps]) => tally(`Week ${w}`, ps));
  const total = tally('Lifetime', graded);

  const money = (units: number) => fmtMoney(units * unitSize);
  const tone = (n: number) => (n >= 0 ? 'text-emerald-400' : 'text-red-400');

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[10px] tracking-widest text-zinc-500 uppercase">
            <th className="px-4 py-3 text-left font-semibold">Week</th>
            <th className="px-4 py-3 text-right font-semibold">Bets</th>
            <th className="px-4 py-3 text-right font-semibold">Record</th>
            <th className="px-4 py-3 text-right font-semibold">Units P/L</th>
            <th className="px-4 py-3 text-right font-semibold">Profit / Loss</th>
            <th className="px-4 py-3 text-right font-semibold">ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-[var(--color-border)]/60">
              <td className="px-4 py-2.5 font-semibold text-white">{r.label}</td>
              <td className="mono px-4 py-2.5 text-right text-zinc-400">{r.bets}</td>
              <td className="mono px-4 py-2.5 text-right text-white">{r.record}</td>
              <td className={clsx('mono px-4 py-2.5 text-right font-semibold', tone(r.unitsPL))}>
                {r.unitsPL >= 0 ? '+' : ''}
                {r.unitsPL.toFixed(2)}u
              </td>
              <td className={clsx('mono px-4 py-2.5 text-right', tone(r.unitsPL))}>
                {money(r.unitsPL)}
              </td>
              <td className={clsx('mono px-4 py-2.5 text-right', tone(r.roi))}>
                {r.roi >= 0 ? '+' : ''}
                {(r.roi * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
          <tr className="bg-[var(--color-surface-2)]">
            <td className="px-4 py-3 font-bold text-white">{total.label}</td>
            <td className="mono px-4 py-3 text-right text-zinc-300">{total.bets}</td>
            <td className="mono px-4 py-3 text-right font-bold text-white">{total.record}</td>
            <td className={clsx('mono px-4 py-3 text-right font-bold', tone(total.unitsPL))}>
              {total.unitsPL >= 0 ? '+' : ''}
              {total.unitsPL.toFixed(2)}u
            </td>
            <td className={clsx('mono px-4 py-3 text-right font-bold', tone(total.unitsPL))}>
              {money(total.unitsPL)}
            </td>
            <td className={clsx('mono px-4 py-3 text-right font-bold', tone(total.roi))}>
              {total.roi >= 0 ? '+' : ''}
              {(total.roi * 100).toFixed(1)}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

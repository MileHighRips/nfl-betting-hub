'use client';

import { useState } from 'react';
import { Star, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { FUTURES, FUTURES_MARKETS } from '@/data/futures';
import type { FuturesMarket } from '@/lib/types';
import { formatOdds } from '@/lib/odds';
import { Chip, ConfidenceBar, OddsBadge } from './atoms';
import PlaceBetButton from './PlaceBetButton';

export default function FuturesBoard() {
  const [market, setMarket] = useState<FuturesMarket>('Super Bowl');
  const rows = FUTURES.filter((f) => f.market === market).sort((a, b) => b.edge - a.edge);

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {FUTURES_MARKETS.map((m) => {
          const count = FUTURES.filter((f) => f.market === m).length;
          const hasKen = FUTURES.some((f) => f.market === m && f.kenPick);
          return (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                market === m
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-400 hover:text-white',
              )}
            >
              {m}
              {hasKen && <Star size={12} className="text-[var(--color-gold)]" />}
              <span className="text-[10px] text-zinc-500">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {rows.map((f) => (
          <div
            key={f.id}
            className={clsx(
              'card flex flex-col gap-3 p-4 sm:flex-row sm:items-center',
              f.kenPick && 'border-[rgba(245,196,81,0.35)]',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">{f.selection}</span>
                {f.kenPick && (
                  <Chip variant="ken">
                    <Star size={11} /> Ken Bet
                  </Chip>
                )}
                {f.kenPrediction && !f.kenPick && (
                  <Chip variant="ken">
                    <Sparkles size={11} /> Ken Prediction
                  </Chip>
                )}
                {f.tags.map((t) => (
                  <Chip
                    key={t}
                    variant={
                      t === 'Fade' || t.includes('Fade')
                        ? 'fade'
                        : t === 'Value' || t === 'Value Trough'
                          ? 'value'
                          : 'default'
                    }
                  >
                    {t}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">{f.rationale}</p>
              <div className="mt-2 flex items-center gap-4">
                <div className="w-40">
                  <ConfidenceBar value={f.confidence} />
                </div>
                <span
                  className={clsx(
                    'text-xs font-semibold',
                    f.edge > 0 ? 'text-emerald-400' : 'text-zinc-500',
                  )}
                >
                  {f.edge > 0 ? '+' : ''}
                  {(f.edge * 100).toFixed(1)}% edge
                </span>
                <span className="text-xs text-zinc-500">
                  fair {formatOdds(fairOdds(f.modelProb))}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OddsBadge price={f.price} book={f.book} />
              {f.units > 0 ? (
                <PlaceBetButton
                  description={`${f.selection} — ${f.market}`}
                  market={`Futures · ${f.market}`}
                  price={f.price}
                  stakeUnits={Number(f.units.toFixed(2))}
                  confidence={f.confidence}
                  source={f.kenPick ? 'ken' : 'model'}
                />
              ) : (
                <span className="chip">Watch</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fairOdds(p: number): number {
  return p >= 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100);
}

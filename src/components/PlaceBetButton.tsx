'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useBankroll } from '@/lib/store';
import { fmtMoney } from '@/lib/format';
import type { PickType } from '@/lib/types';

interface Props {
  description: string;
  market: string;
  price: number;
  stakeUnits: number;
  confidence?: number;
  source?: 'model' | 'ken' | 'manual';
  gameId?: string;
  pickType?: PickType;
  side?: string;
  line?: number;
  player?: string;
  propMarket?: string;
  compact?: boolean;
}

export default function PlaceBetButton({
  description,
  market,
  price,
  stakeUnits,
  confidence,
  source = 'model',
  compact,
  gameId,
  pickType,
  side,
  line,
  player,
  propMarket,
}: Props) {
  const { placeBet, unitSize } = useBankroll();
  const [done, setDone] = useState(false);

  const dollars = stakeUnits * unitSize;

  return (
    <button
      onClick={() => {
        placeBet({
          description,
          market,
          price,
          stakeUnits,
          confidence,
          source,
          gameId,
          pickType,
          side,
          line,
          player,
          propMarket,
        });
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
        done
          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
          : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-zinc-200 hover:border-emerald-500/60 hover:text-white',
        compact && 'px-2 py-1',
      )}
    >
      {done ? <Check size={14} /> : <Plus size={14} />}
      {done ? (
        'Tracked'
      ) : (
        <span className="flex flex-col items-start leading-tight">
          <span>Place {stakeUnits}u</span>
          <span className="text-[10px] font-normal text-zinc-400">{fmtMoney(dollars)}</span>
        </span>
      )}
    </button>
  );
}

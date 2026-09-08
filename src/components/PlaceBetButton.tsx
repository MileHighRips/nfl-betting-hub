'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useBankroll } from '@/lib/store';

interface Props {
  description: string;
  market: string;
  price: number;
  stakeUnits: number;
  confidence?: number;
  source?: 'model' | 'ken' | 'manual';
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
}: Props) {
  const { placeBet } = useBankroll();
  const [done, setDone] = useState(false);

  return (
    <button
      onClick={() => {
        placeBet({ description, market, price, stakeUnits, confidence, source });
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
      {done ? 'Tracked' : `Place ${stakeUnits}u`}
    </button>
  );
}

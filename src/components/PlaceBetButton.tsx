'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useBankroll } from '@/lib/store';
import { fmtMoney } from '@/lib/format';
import { noVigProb } from '@/lib/odds';
import type { PlacedBet } from '@/lib/types';

interface Props {
  description: string;
  market: string;
  price: number;
  stakeUnits: number;
  confidence?: number;
  edge?: number;
  evPercent?: number;
  valuePercent?: number;
  source?: 'model' | 'ken' | 'manual';
  gameId?: string;
  pickType?: PlacedBet['pickType'];
  side?: string;
  line?: number;
  kickoff?: string;
  marketProb?: number;
  modelProb?: number;
  decisionProb?: number;
  modelVersion?: string;
  opposingPrice?: number;
  book?: 'DraftKings' | 'FanDuel' | 'Consensus' | 'Kalshi' | 'Model';
  placementSurface?: 'bet-now' | 'other';
  alternateLine?: boolean;
  player?: string;
  propMarket?: string;
  compact?: boolean;
  /** Recommended real-dollar stake. Shown as the primary amount. */
  amountDollars?: number;
  disabled?: boolean;
}

export default function PlaceBetButton({
  description,
  market,
  price,
  stakeUnits,
  confidence,
  edge,
  evPercent,
  valuePercent,
  source = 'model',
  compact,
  gameId,
  pickType,
  side,
  line,
  kickoff,
  marketProb,
  modelProb,
  decisionProb,
  modelVersion,
  opposingPrice,
  book,
  placementSurface = 'other',
  alternateLine,
  player,
  propMarket,
  amountDollars,
  disabled = false,
}: Props) {
  const { placeBet, unitSize } = useBankroll();
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  const dollars = amountDollars ?? stakeUnits * unitSize;
  // When a real dollar amount is given by Bet Now, record THAT amount —
  // convert to units against the user's unit size so the tracker stores the exact
  // dollars bet, not a unit-size multiple.
  const unitsToPlace =
    amountDollars != null && unitSize > 0 ? amountDollars / unitSize : stakeUnits;
  const placementMarketProb =
    price !== 0 &&
    Number.isFinite(price) &&
    opposingPrice != null &&
    opposingPrice !== 0 &&
    Number.isFinite(opposingPrice)
      ? noVigProb(price, opposingPrice)
      : undefined;

  return (
    <button
      onClick={() => {
        setSaving(true);
        setSaveError(undefined);
        void placeBet({
          description,
          market,
          price,
          stakeUnits: unitsToPlace,
          confidence,
          edge,
          evPercent,
          valuePercent,
          source,
          gameId,
          pickType,
          side,
          line,
          kickoff,
          marketProb,
          modelProb,
          decisionProb,
          modelVersion,
          placementMarketProb,
          placementSurface,
          book,
          alternateLine,
          clvBasis: placementMarketProb == null ? 'odds' : 'market',
          player,
          propMarket,
        })
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          })
          .catch((error: unknown) => {
            console.error('Failed to save placed bet.', error);
            setSaveError(error instanceof Error ? error.message : 'Unable to save this bet.');
          })
          .finally(() => setSaving(false));
      }}
      disabled={disabled || saving}
      title={saveError}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
        done
          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
          : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-zinc-200 hover:border-emerald-500/60 hover:text-white',
        compact && 'px-2 py-1',
        disabled &&
          'cursor-not-allowed opacity-50 hover:border-[var(--color-border)] hover:text-zinc-200',
      )}
    >
      {done ? <Check size={14} /> : <Plus size={14} />}
      {done ? (
        'Tracked'
      ) : saving ? (
        'Saving…'
      ) : saveError ? (
        'Save failed'
      ) : (
        <span className="flex flex-col items-start leading-tight">
          <span>Bet {fmtMoney(dollars)}</span>
          <span className="text-[10px] font-normal text-zinc-400">{stakeUnits}u</span>
        </span>
      )}
    </button>
  );
}

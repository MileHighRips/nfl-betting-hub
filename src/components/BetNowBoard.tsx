'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, Clock, Newspaper } from 'lucide-react';
import PlaceBetButton from './PlaceBetButton';
import { useBankroll } from '@/lib/store';
import { americanToProb } from '@/lib/odds';
import { hoursToKickoff, timingAdvice, untilLabel, type TimingStage } from '@/lib/kickoff';
import type { NewsItem } from '@/lib/news';
import type { PickType, PlacedBet } from '@/lib/types';

export interface BetNowRow {
  key: string;
  matchup: string;
  kickoff: string;
  pickType: string;
  description: string;
  market: string;
  price: number;
  stakeUnits: number;
  edge: number;
  confidence: number;
  gameId: string;
  side?: string;
  line?: number;
  player?: string;
  propMarket?: string;
  situational?: string;
  day?: string;
  move?: { open: number; now: number; moved: number; state: 'stale' | 'steam' | 'toward' | 'away' | 'flat'; label: string };
}

const MOVE_STYLE: Record<'stale' | 'steam' | 'toward' | 'away' | 'flat', string> = {
  stale: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  steam: 'border-orange-500/50 bg-orange-500/10 text-orange-300',
  toward: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  away: 'border-zinc-600/50 bg-zinc-700/20 text-zinc-400',
  flat: 'border-zinc-600/50 bg-zinc-700/20 text-zinc-400',
};

const STAGE_STYLE: Record<TimingStage, string> = {
  'bet-now': 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  lean: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  monitor: 'border-zinc-600/50 bg-zinc-700/20 text-zinc-400',
  closing: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

const FILTERS: { key: 'all' | 'bet-now' | 'strong'; label: string }[] = [
  { key: 'all', label: 'All value' },
  { key: 'bet-now', label: 'Bet Now' },
  { key: 'strong', label: 'Strong (5%+)' },
];

function oddsLabel(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

export default function BetNowBoard({
  rows,
  news = [],
}: {
  rows: BetNowRow[];
  season: number;
  news?: NewsItem[];
}) {
  const [filter, setFilter] = useState<'all' | 'bet-now' | 'strong'>('all');
  // Default to a clean board each day: only unplaced (New) and re-bet picks show;
  // fully-placed picks drop off automatically (bankroll store knows what's down).
  const [hidePlaced, setHidePlaced] = useState(true);
  const { bets } = useBankroll();

  // Beat-writer chatter for a specific player's prop — so you can apply the
  // human read (usage, snaps, coach-speak) the way a well-sourced tout does.
  const playerNews = (player?: string): NewsItem | undefined => {
    if (!player) return undefined;
    const p = player.toLowerCase();
    return news.find((n) => n.headline.toLowerCase().includes(p));
  };

  // Match already-placed bets by pick IDENTITY (game + market + side + player),
  // not the exact line/price — so a bet stays "Placed" even if the number moved,
  // which is what actually stops you double-betting the same pick tomorrow.
  // Props key on player+market+direction (over/under parsed from the description)
  // because the stored `side` is an inconsistent placeholder ("prop") and the line
  // moves; this keeps a placed prop matched after the number changes.
  const propDir = (b: { description?: string }): 'over' | 'under' =>
    b.description && /\bunder\b/i.test(b.description) ? 'under' : 'over';
  const identity = (b: {
    gameId?: string;
    pickType?: string;
    side?: string;
    player?: string;
    propMarket?: string;
    description?: string;
  }) => {
    if (!(b.gameId && b.pickType)) return b.description ?? '';
    if (b.pickType === 'Prop') {
      return `${b.gameId}|Prop|${b.player ?? ''}|${b.propMarket ?? ''}|${propDir(b)}`;
    }
    return `${b.gameId}|${b.pickType}|${b.side ?? ''}|${b.player ?? ''}|${b.propMarket ?? ''}`;
  };
  const placedByKey = useMemo(() => {
    const m = new Map<string, PlacedBet>();
    for (const b of bets) {
      for (const k of [identity(b), b.description]) {
        if (!k) continue;
        const cur = m.get(k);
        if (!cur || (b.placedAt ?? '') > (cur.placedAt ?? '')) m.set(k, b); // keep most recent
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bets]);
  const matchPlaced = (r: BetNowRow) => placedByKey.get(identity(r)) ?? placedByKey.get(r.description);

  // Total units ALREADY committed to each pick identity and to each game, summed
  // across every re-bet — so a re-offer tops up toward the model target instead
  // of telling you to stake the whole amount again on money you already have down.
  const placedStakeByKey = useMemo(() => {
    const m = new Map<string, number>();
    const add = (k: string | undefined, u: number) => {
      if (k) m.set(k, (m.get(k) ?? 0) + u);
    };
    for (const b of bets) {
      const k = identity(b);
      add(k, b.stakeUnits ?? 0);
      if (b.description && b.description !== k) add(b.description, b.stakeUnits ?? 0);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bets]);
  const placedStakeByGame = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bets) {
      if (b.gameId) m.set(b.gameId, (m.get(b.gameId) ?? 0) + (b.stakeUnits ?? 0));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bets]);

  // Re-offer a placed bet ONLY when there's genuine new value on top: a material
  // line move, or a meaningfully bigger recommended stake.
  const reofferReason = (r: BetNowRow, b: PlacedBet): string | null => {
    if (r.stakeUnits >= (b.stakeUnits ?? 0) + 0.5) return 'stake ↑';
    const line = r.line;
    const bLine = b.line;
    if (line != null && bLine != null && ['Spread', 'Total', 'Upset'].includes(r.pickType)) {
      if (Math.abs(line - bLine) >= 1.5) return 'line moved';
    } else if (line != null && bLine != null && r.pickType === 'Prop') {
      if (Math.abs(line - bLine) >= Math.max(0.5, 0.08 * Math.abs(bLine))) return 'line moved';
    } else if (
      Math.abs(americanToProb(r.price) - americanToProb(b.price ?? r.price)) >= 0.03
    ) {
      return 'price moved';
    }
    return null;
  };

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const hrs = hoursToKickoff(r.kickoff);
        const pb = matchPlaced(r);
        // How much is already on this exact pick / on the whole game.
        const onPick =
          placedStakeByKey.get(identity(r)) ?? placedStakeByKey.get(r.description) ?? 0;
        const onGame = r.gameId ? (placedStakeByGame.get(r.gameId) ?? 0) : 0;
        // Units still needed to reach the model's target stake for this pick.
        const remaining = Math.round(Math.max(0, r.stakeUnits - onPick) * 10) / 10;
        // Re-offer only when there's a real reason AND meaningful stake left to add;
        // once you're at the target we stop suggesting the same pick.
        const reoffer = pb && remaining >= 0.5 ? (reofferReason(r, pb) ?? 'top up') : null;
        // "Placed" only when there's no new value to add; a re-offer is actionable.
        return {
          row: r,
          hrs,
          advice: timingAdvice(r.edge, hrs),
          placed: !!pb && !reoffer,
          reoffer,
          onPick,
          onGame,
          remaining,
          isNew: !pb,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, placedByKey, placedStakeByKey, placedStakeByGame],
  );

  const placedCount = enriched.filter((e) => e.placed).length;

  const visible = enriched.filter(({ row, advice, placed }) => {
    if (hidePlaced && placed) return false;
    if (filter === 'bet-now') return advice.stage === 'bet-now';
    if (filter === 'strong') return row.edge >= 0.05;
    return true;
  });

  // Group by day, then by game (matchup) within each day; sort by edge.
  type Item = (typeof visible)[number];
  const days: { day: string; games: { matchup: string; items: Item[] }[] }[] = [];
  for (const e of visible) {
    const dayLabel = e.row.day ?? '';
    let d = days.find((x) => x.day === dayLabel);
    if (!d) {
      d = { day: dayLabel, games: [] };
      days.push(d);
    }
    let gm = d.games.find((x) => x.matchup === e.row.matchup);
    if (!gm) {
      gm = { matchup: e.row.matchup, items: [] };
      d.games.push(gm);
    }
    gm.items.push(e);
  }
  const bestEdge = (items: Item[]) => Math.max(...items.map((i) => i.row.edge));
  for (const d of days) {
    for (const gm of d.games) gm.items.sort((a, b) => b.row.edge - a.row.edge);
    d.games.sort((a, b) => bestEdge(b.items) - bestEdge(a.items));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
              filter === f.key
                ? 'bg-[var(--color-surface-2)] text-white'
                : 'text-zinc-400 hover:text-white',
            )}
          >
            {f.label}
          </button>
        ))}
        {placedCount > 0 && (
          <button
            onClick={() => setHidePlaced((v) => !v)}
            className={clsx(
              'ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold transition',
              hidePlaced
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-zinc-400 hover:text-white',
            )}
          >
            {hidePlaced ? `Show placed (${placedCount})` : `Hide placed (${placedCount})`}
          </button>
        )}
        <span className={clsx('text-xs text-zinc-500', placedCount === 0 && 'ml-auto')}>
          {visible.length} bets
        </span>
      </div>

      <div className="space-y-3">
        {visible.length === 0 && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-sm text-zinc-400">
            {placedCount > 0
              ? 'All caught up — every posted pick is placed. New picks and re-bet top-ups appear here as lines move or the slate updates.'
              : 'No value bets right now.'}
          </div>
        )}
        {days.map((d) => (
          <div key={d.day} className="space-y-2">
            {d.day && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-bold text-white">{d.day}</span>
                <span className="text-[10px] text-zinc-500">
                  {d.games.reduce((s, g) => s + g.items.length, 0)} bets · {d.games.length} games
                </span>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>
            )}
            {d.games.map((gm) => (
              <div
                key={gm.matchup}
                className="rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-surface)]/40 p-2"
              >
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <span className="text-xs font-semibold text-zinc-200">{gm.matchup}</span>
                  <span className="text-[10px] text-zinc-500">
                    {gm.items.length} bet{gm.items.length > 1 ? 's' : ''} ·{' '}
                    {gm.items.reduce((s, i) => s + i.row.stakeUnits, 0).toFixed(1)}u
                  </span>
                  {(gm.items[0]?.onGame ?? 0) > 0 && (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                      {gm.items[0].onGame.toFixed(1)}u already on this game
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {gm.items.map(({ row, hrs, advice, placed, reoffer, onPick, remaining, isNew }) => (
          <div
            key={row.key}
            className={clsx(
              'flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center',
              placed
                ? 'border-emerald-500/25 bg-emerald-500/5 opacity-70'
                : 'border-[var(--color-border)] bg-[var(--color-surface)]',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  {row.pickType}
                </span>
                {isNew && (
                  <span className="rounded-md border border-sky-500/50 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                    New
                  </span>
                )}
                <span className="text-[10px] text-zinc-500">{row.matchup}</span>
                {row.edge > 0 && (
                  <span className="text-[10px] font-semibold text-emerald-400">
                    +{(row.edge * 100).toFixed(1)}% edge
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-white">
                {row.description.replace(` (${row.matchup})`, '')}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={clsx(
                    'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                    STAGE_STYLE[advice.stage],
                  )}
                >
                  {advice.label}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                  <Clock size={11} /> in {untilLabel(hrs)}
                </span>
                {row.situational && (
                  <span className="rounded-md border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                    {row.situational}
                  </span>
                )}
                {row.move && (
                  <span
                    className={clsx(
                      'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                      MOVE_STYLE[row.move.state],
                    )}
                    title={`Opened ${row.move.open}, now ${row.move.now}`}
                  >
                    {row.move.state === 'stale' ? '⚡ ' : ''}
                    {row.move.state === 'steam' ? '🔥 ' : ''}
                    {row.move.label}
                  </span>
                )}
                <span className="hidden text-[10px] text-zinc-500 sm:inline">{advice.detail}</span>
                {reoffer && onPick > 0 && (
                  <span className="text-[10px] text-zinc-500">
                    {onPick.toFixed(1)}u on this → +{remaining.toFixed(1)}u to {row.stakeUnits}u target
                  </span>
                )}
              </div>
              {(() => {
                const pn = playerNews(row.player);
                return pn ? (
                  <a
                    href={pn.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-start gap-1 text-[10px] text-cyan-400/80 hover:text-cyan-300"
                  >
                    <Newspaper size={11} className="mt-0.5 shrink-0" />
                    <span className="truncate">
                      {pn.headline}
                      {pn.source ? ` · ${pn.source}` : ''}
                    </span>
                  </a>
                ) : null;
              })()}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 font-mono text-xs text-zinc-300">
                {oddsLabel(row.price)}
              </span>
              {placed ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                  <Check size={14} /> Placed{onPick > 0 ? ` · ${onPick.toFixed(1)}u` : ''}
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  {reoffer && (
                    <span className="rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                      re-bet · {reoffer}
                    </span>
                  )}
                  <PlaceBetButton
                    description={row.description}
                    market={row.market}
                    price={row.price}
                    stakeUnits={reoffer ? remaining : row.stakeUnits}
                    confidence={row.confidence}
                    source="model"
                    gameId={row.gameId}
                    pickType={row.pickType as PickType}
                    side={row.side}
                    line={row.line}
                    player={row.player}
                    propMarket={row.propMarket}
                  />
                </div>
              )}
            </div>
          </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

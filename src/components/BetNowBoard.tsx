'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, Clock, Newspaper } from 'lucide-react';
import PlaceBetButton from './PlaceBetButton';
import { useBankroll } from '@/lib/store';
import { americanToProb } from '@/lib/odds';
import { fmtMoney, fmtSignedPct } from '@/lib/format';
import { hoursToKickoff, timingAdvice, untilLabel, type TimingStage } from '@/lib/kickoff';
import type { NewsItem } from '@/lib/news';
import type { PlacedBet } from '@/lib/types';
import type { Disconnect } from '@/lib/disconnect';
import { classifyBet, type BetTierKey } from '@/lib/bet-tier';
import type { HandicapReview, HandicapReviewDraft } from '@/lib/handicap-review-schema';
import HandicapReviewGate from './HandicapReviewGate';

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
  marketProb?: number;
  decisionProb?: number;
  evPercent?: number;
  valuePercent?: number;
  gameId: string;
  modelProb?: number;
  modelVersion?: string;
  betDollars?: number;
  netEv?: number;
  book?: 'DraftKings' | 'FanDuel' | 'Consensus' | 'Kalshi' | 'Model';
  opposingPrice?: number;
  side?: string;
  line?: number;
  alternateLine?: boolean;
  player?: string;
  propMarket?: string;
  situational?: string;
  day?: string;
  disconnect?: Disconnect;
  signal?: string;
  narrative?: boolean;
  floorExempt?: boolean;
  longshot?: boolean;
  locked?: boolean;
  review?: HandicapReview;
  researchDraft?: HandicapReviewDraft;
  footballEvidence?: { label: string; detail: string }[];
  newsSources?: { headline: string; href: string; source?: string }[];
  move?: {
    open: number;
    now: number;
    moved: number;
    state: 'stale' | 'steam' | 'toward' | 'away' | 'flat';
    label: string;
  };
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

const DISCONNECT_STYLE: Record<Disconnect['tier'], string> = {
  strong: 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300',
  value: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  lean: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  fair: 'border-zinc-600/50 bg-zinc-700/20 text-zinc-500',
};

const TIER_STYLE: Record<BetTierKey, string> = {
  mega: 'border-amber-400/70 bg-amber-400/15 text-amber-200',
  awesome: 'border-violet-500/60 bg-violet-500/15 text-violet-200',
  ev: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  news: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  narrative: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  none: 'hidden',
};

const TIER_ICON: Record<BetTierKey, string> = {
  mega: '🏆 ',
  awesome: '⭐ ',
  ev: '',
  news: '',
  narrative: '',
  none: '',
};

const FILTERS: {
  key: 'all' | 'mega' | 'awesome' | 'bet-now' | 'strong' | 'clv';
  label: string;
}[] = [
  { key: 'all', label: 'All value' },
  { key: 'clv', label: '✓ Beating close' },
  { key: 'mega', label: '🏆 Mega' },
  { key: 'awesome', label: '⭐ Awesome+' },
  { key: 'bet-now', label: 'Bet Now' },
  { key: 'strong', label: 'Strong (5%+)' },
];

// Line states where we've beaten (or not yet lost) the closing number.
const BEATS_CLOSE = new Set(['stale', 'toward', 'steam']);

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
  const [filter, setFilter] = useState<'all' | 'mega' | 'awesome' | 'bet-now' | 'strong' | 'clv'>(
    'all',
  );
  // Default to a clean board each day: only unplaced (New) and re-bet picks show;
  // fully-placed picks drop off automatically (bankroll store knows what's down).
  const [hidePlaced, setHidePlaced] = useState(true);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const { bets, unitSize } = useBankroll();

  useEffect(() => {
    const updateClock = () => setClockNow(Date.now());
    updateClock();
    const interval = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(interval);
  }, []);

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
  const matchPlaced = (r: BetNowRow) =>
    placedByKey.get(identity(r)) ?? placedByKey.get(r.description);

  // Total dollars ALREADY committed to each pick identity and game. Placed bets
  // store configurable units, while Bet Now recommendations use fixed dollar sizes.
  const placedStakeByKey = useMemo(() => {
    const m = new Map<string, number>();
    const add = (k: string | undefined, dollars: number) => {
      if (k) m.set(k, (m.get(k) ?? 0) + dollars);
    };
    for (const b of bets) {
      const k = identity(b);
      const dollars = (b.stakeUnits ?? 0) * (b.unitSize ?? unitSize);
      add(k, dollars);
      if (b.description && b.description !== k) add(b.description, dollars);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bets, unitSize]);
  const placedStakeByGame = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bets) {
      if (b.gameId) {
        const dollars = (b.stakeUnits ?? 0) * (b.unitSize ?? unitSize);
        m.set(b.gameId, (m.get(b.gameId) ?? 0) + dollars);
      }
    }
    return m;
  }, [bets, unitSize]);

  // Re-offer a placed bet ONLY when there's genuine new value on top: a material
  // line move, or a meaningfully bigger recommended stake.
  const reofferReason = (r: BetNowRow, b: PlacedBet, onPick: number): string | null => {
    const targetDollars = r.betDollars ?? r.stakeUnits * 10;
    if (targetDollars >= onPick + 5) return 'stake ↑';
    const line = r.line;
    const bLine = b.line;
    if (line != null && bLine != null && ['Spread', 'Total', 'Upset'].includes(r.pickType)) {
      if (Math.abs(line - bLine) >= 1.5) return 'line moved';
    } else if (line != null && bLine != null && r.pickType === 'Prop') {
      if (Math.abs(line - bLine) >= Math.max(0.5, 0.08 * Math.abs(bLine))) return 'line moved';
    } else if (Math.abs(americanToProb(r.price) - americanToProb(b.price ?? r.price)) >= 0.03) {
      return 'price moved';
    }
    return null;
  };

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const hrs = clockNow === null ? null : hoursToKickoff(r.kickoff, new Date(clockNow));
        const pb = matchPlaced(r);
        // How much is already on this exact pick / on the whole game.
        const onPick =
          placedStakeByKey.get(identity(r)) ?? placedStakeByKey.get(r.description) ?? 0;
        const onGame = r.gameId ? (placedStakeByGame.get(r.gameId) ?? 0) : 0;
        // Dollars still needed to reach the Bet Now target, independent of unit size.
        const targetDollars = r.betDollars ?? r.stakeUnits * 10;
        const remaining = Math.round(Math.max(0, targetDollars - onPick) * 100) / 100;
        const reoffer = pb && remaining >= 5 ? (reofferReason(r, pb, onPick) ?? 'top up') : null;
        // "Placed" only when there's no new value to add; a re-offer is actionable.
        return {
          row: r,
          hrs,
          advice: timingAdvice(r.edge, hrs ?? 24),
          placed: !!pb && !reoffer,
          reoffer,
          onPick,
          onGame,
          remaining,
          isNew: !pb,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, placedByKey, placedStakeByKey, placedStakeByGame, clockNow],
  );

  const placedCount = enriched.filter((e) => e.placed).length;

  const visible = enriched.filter(({ row, advice, placed }) => {
    if (hidePlaced && placed) return false;
    if (filter === 'bet-now') return advice.stage === 'bet-now';
    if (filter === 'strong') return row.edge >= 0.05;
    // Only picks whose line still beats (or hasn't lost) the close — true +CLV spots.
    if (filter === 'clv') return !!row.move && BEATS_CLOSE.has(row.move.state);
    if (filter === 'mega' || filter === 'awesome') {
      const t = classifyBet({
        edge: row.edge,
        disconnect: row.disconnect,
        hasSignal: !!row.signal,
        narrative: row.narrative,
      });
      return filter === 'mega' ? t.key === 'mega' : t.count >= 2;
    }
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
              hidePlaced ? 'bg-emerald-500/15 text-emerald-300' : 'text-zinc-400 hover:text-white',
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
                    {fmtMoney(
                      gm.items.reduce((s, i) => s + (i.row.betDollars ?? i.row.stakeUnits * 10), 0),
                    )}
                  </span>
                  {(gm.items[0]?.onGame ?? 0) > 0 && (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                      {fmtMoney(gm.items[0].onGame)} already on this game
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {gm.items.map(
                    ({ row, hrs, advice, placed, reoffer, onPick, remaining, isNew }) => (
                      <div
                        key={row.key}
                        className={clsx(
                          'flex flex-col gap-2 rounded-xl border p-3',
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
                            {(() => {
                              const t = classifyBet({
                                edge: row.edge,
                                disconnect: row.disconnect,
                                hasSignal: !!row.signal,
                                narrative: row.narrative,
                              });
                              return t.key !== 'none' && t.count >= 1 ? (
                                <span
                                  className={clsx(
                                    'rounded-md border px-1.5 py-0.5 text-[10px] font-bold',
                                    TIER_STYLE[t.key],
                                  )}
                                  title={`EV:${t.ev ? '✓' : '–'} News:${t.news ? '✓' : '–'} Narrative:${t.narrative ? '✓' : '–'}`}
                                >
                                  {TIER_ICON[t.key]}
                                  {t.label}
                                </span>
                              ) : null;
                            })()}
                            {isNew && (
                              <span className="rounded-md border border-sky-500/50 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                                New
                              </span>
                            )}
                            {row.longshot && (
                              <span className="rounded-md border border-fuchsia-500/50 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-300">
                                🎟️ Longshot
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-500">{row.matchup}</span>
                            <span
                              className={clsx(
                                'text-[10px] font-semibold',
                                row.edge >= 0 ? 'text-emerald-400' : 'text-red-400',
                              )}
                            >
                              Edge {fmtSignedPct(row.edge)}
                            </span>
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
                              <Clock size={11} /> in {hrs === null ? '—' : untilLabel(hrs)}
                            </span>
                            {row.situational && (
                              <span className="rounded-md border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                                {row.situational}
                              </span>
                            )}
                            {row.disconnect && row.disconnect.tier !== 'fair' && (
                              <span
                                className={clsx(
                                  'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                                  DISCONNECT_STYLE[row.disconnect.tier],
                                )}
                                title="Market disconnect — how far our number is from the price"
                              >
                                {row.disconnect.tier === 'strong' ? '🔥 ' : ''}
                                {row.disconnect.label}
                              </span>
                            )}
                            {row.signal && (
                              <span
                                className="rounded-md border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300"
                                title="Structured beat-writer/role signal feeding the model"
                              >
                                📰 {row.signal}
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
                                {row.move.state === 'toward' ? '✓ ' : ''}
                                {row.move.state === 'away' ? '⚠ ' : ''}
                                {row.move.label}
                              </span>
                            )}
                            <span className="hidden text-[10px] text-zinc-500 sm:inline">
                              {advice.detail}
                            </span>
                            {reoffer && onPick > 0 && (
                              <span className="text-[10px] text-zinc-500">
                                {fmtMoney(onPick)} on this → +{fmtMoney(remaining)} to{' '}
                                {fmtMoney(row.betDollars ?? row.stakeUnits * 10)} target
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
                        <div className="flex flex-wrap items-center gap-2">
                          {row.evPercent != null && (
                            <span
                              className={clsx(
                                'rounded-md border px-2 py-1 font-mono text-[11px] font-semibold',
                                row.evPercent >= 0
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                  : 'border-red-500/40 bg-red-500/10 text-red-300',
                              )}
                              title="Model-estimated expected profit per dollar staked, using the listed odds"
                            >
                              EV {fmtSignedPct(row.evPercent)}
                            </span>
                          )}
                          <span
                            className={clsx(
                              'rounded-md border px-2 py-1 font-mono text-[11px] font-semibold',
                              row.valuePercent == null
                                ? 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-zinc-500'
                                : row.valuePercent >= 0
                                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                                  : 'border-red-500/40 bg-red-500/10 text-red-300',
                            )}
                            title="Model win probability minus the market-implied probability from the listed odds"
                          >
                            Value %{' '}
                            {row.valuePercent == null ? '—' : fmtSignedPct(row.valuePercent)}
                          </span>
                          {row.netEv != null && row.netEv > 0 && (
                            <span
                              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-[11px] font-semibold text-emerald-300"
                              title="Model-estimated profit after subtracting the $0.50 placement fee"
                            >
                              Model EV +${row.netEv.toFixed(2)}
                            </span>
                          )}
                          <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 font-mono text-xs text-zinc-300">
                            {oddsLabel(row.price)}
                          </span>
                          {row.book && (
                            <span
                              className={clsx(
                                'rounded-md border px-2 py-1 text-[10px] font-semibold',
                                row.book === 'FanDuel'
                                  ? 'border-sky-500/50 bg-sky-500/10 text-sky-300'
                                  : row.book === 'DraftKings'
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                    : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
                              )}
                              title={
                                row.book === 'Model'
                                  ? 'Model estimate; verify the live price at your sportsbook'
                                  : 'Price source for this pick'
                              }
                            >
                              {row.book === 'FanDuel'
                                ? 'FanDuel'
                                : row.book === 'DraftKings'
                                  ? 'DK'
                                  : row.book}
                            </span>
                          )}
                          {placed ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                              <Check size={14} /> Placed{onPick > 0 ? ` · ${fmtMoney(onPick)}` : ''}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {reoffer && (
                                <span className="rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                  re-bet · {reoffer}
                                </span>
                              )}
                              {(() => {
                                const placeBetProps = {
                                  description: row.description,
                                  market: row.market,
                                  price: row.price,
                                  stakeUnits:
                                    (reoffer
                                      ? remaining
                                      : (row.betDollars ?? row.stakeUnits * 10)) / unitSize,
                                  amountDollars: reoffer ? remaining : row.betDollars,
                                  confidence: row.confidence,
                                  edge: row.edge,
                                  evPercent: row.evPercent,
                                  valuePercent: row.valuePercent,
                                  marketProb: row.marketProb,
                                  modelProb: row.modelProb,
                                  decisionProb: row.decisionProb,
                                  modelVersion: row.modelVersion,
                                  opposingPrice: row.opposingPrice,
                                  book: row.book,
                                  kickoff: row.kickoff,
                                  source: 'model' as const,
                                  placementSurface: 'bet-now' as const,
                                  gameId: row.gameId,
                                  pickType: row.pickType as PlacedBet['pickType'],
                                  side: row.side,
                                  line: row.line,
                                  alternateLine: row.alternateLine,
                                  player: row.player,
                                  propMarket: row.propMarket,
                                };
                                return row.locked ? (
                                  <PlaceBetButton {...placeBetProps} />
                                ) : (
                                  <HandicapReviewGate
                                    key={`${row.key}-${row.line ?? ''}-${row.price}-${row.modelProb ?? ''}`}
                                    snapshot={{
                                      key: row.key,
                                      gameId: row.gameId,
                                      selection: row.description,
                                      pickType: row.pickType,
                                      book: row.book,
                                      line: row.line,
                                      price: row.price,
                                      modelProb: row.modelProb,
                                      marketProb: row.marketProb,
                                      confidence: row.confidence,
                                      edge: row.edge,
                                      evPercent: row.evPercent,
                                      valuePercent: row.valuePercent,
                                      betDollars: row.betDollars,
                                      netEv: row.netEv,
                                    }}
                                    initialReview={row.review}
                                    researchDraft={row.researchDraft}
                                    evidence={row.footballEvidence ?? []}
                                    sources={row.newsSources ?? []}
                                    placeBetProps={placeBetProps}
                                  />
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

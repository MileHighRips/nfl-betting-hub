'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Check, X, Minus, Trash2, RefreshCw, Search, Pencil } from 'lucide-react';
import clsx from 'clsx';
import { useBankroll, computeStats } from '@/lib/store';
import { fmtMoney, fmtSignedPct } from '@/lib/format';
import { formatOdds, americanToProfit } from '@/lib/odds';
import { SectionTitle, Chip } from '@/components/atoms';
import type { PlacedBet } from '@/lib/types';
import type { LiveStatus } from '@/lib/live-status';

/** Week a bet belongs to, from its game id or market label (undefined for futures). */
function betWeek(b: PlacedBet): number | undefined {
  const fromId = b.gameId?.match(/-w(\d+)-/);
  if (fromId) return Number(fromId[1]);
  const fromMarket = b.market.match(/week\s*(\d+)/i);
  return fromMarket ? Number(fromMarket[1]) : undefined;
}

/** Category used by the type filter: the pick type, or Futures for season-long markets. */
function betType(b: PlacedBet): string {
  if (b.pickType) return b.pickType;
  if (betWeek(b) === undefined) return 'Futures';
  return 'Other';
}

/** True when the bet's text fields contain the search query (case-insensitive). */
function matchesSearch(b: PlacedBet, query: string): boolean {
  if (!query) return true;
  const haystack = [b.description, b.market, b.side, b.player, b.propMarket]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function TrackerPage() {
  const {
    bets,
    stats,
    unitSize,
    setUnitSize,
    updateStatus,
    updateStake,
    removeBet,
    refresh,
    syncError,
  } = useBankroll();
  const [filter, setFilter] = useState<'all' | PlacedBet['status']>('all');
  const [weekFilter, setWeekFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'bet-now' | 'other'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [evFilter, setEvFilter] = useState<string>('all');
  const [valueFilter, setValueFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [statuses, setStatuses] = useState<Record<string, LiveStatus>>({});

  const fetchStatuses = useCallback(() => {
    fetch('/api/game-status')
      .then((r) => r.json())
      .then((d: { statuses: Record<string, LiveStatus> }) => setStatuses(d.statuses ?? {}))
      .catch(() => {});
  }, []);

  // Poll live scores and re-grade every 30s so results update in real time.
  useEffect(() => {
    fetchStatuses();
    const id = setInterval(() => {
      fetchStatuses();
      refresh();
    }, 30000);
    return () => clearInterval(id);
  }, [fetchStatuses, refresh]);

  const refreshAll = () => {
    refresh();
    fetchStatuses();
  };

  const weekSet = new Set<number>();
  let hasFutures = false;
  for (const b of bets) {
    const w = betWeek(b);
    if (w === undefined) hasFutures = true;
    else weekSet.add(w);
  }
  const weeks = [...weekSet].sort((a, b) => a - b);

  const typeSet = new Set<string>();
  for (const b of bets) typeSet.add(betType(b));
  const types = [...typeSet].sort();

  const weekBets = bets.filter((b) => {
    if (weekFilter === 'all') return true;
    const w = betWeek(b);
    if (weekFilter === 'futures') return w === undefined;
    return w === Number(weekFilter);
  });
  // KPIs follow the week, type, and search filters; the status buttons only narrow the list.
  const scopedBets = weekBets.filter(
    (b) =>
      (typeFilter === 'all' ? true : betType(b) === typeFilter) &&
      (originFilter === 'all'
        ? true
        : originFilter === 'bet-now'
          ? b.placementSurface === 'bet-now'
          : b.placementSurface !== 'bet-now') &&
      matchesSearch(b, search) &&
      (evFilter === 'all'
        ? true
        : (() => {
            const e = b.evPercent;
            return e !== undefined && e * 100 >= Number(evFilter);
          })()) &&
      (valueFilter === 'all'
        ? true
        : (() => {
            const v = b.valuePercent;
            return v !== undefined && v * 100 >= Number(valueFilter);
          })()),
  );
  const scopeFiltered =
    weekFilter !== 'all' ||
    originFilter !== 'all' ||
    typeFilter !== 'all' ||
    evFilter !== 'all' ||
    valueFilter !== 'all' ||
    search.trim() !== '';
  const viewStats = scopeFiltered ? computeStats(scopedBets, unitSize) : stats;
  const clvBets = scopedBets.filter(
    (bet) => bet.clvStatus === 'available' && bet.clv != null && bet.clvBasis === 'market',
  );
  const avgClv = clvBets.length
    ? clvBets.reduce((sum, bet) => sum + bet.clv!, 0) / clvBets.length
    : undefined;

  const shown = scopedBets.filter((b) => (filter === 'all' ? true : b.status === filter));

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Bet Tracker & Bankroll"
        subtitle="Every placed pick, settle results, and watch your profit/loss update live"
        icon={<ClipboardList size={18} />}
      />

      {syncError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
        >
          {syncError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard
          label="Net P/L"
          value={fmtMoney(viewStats.profit)}
          tone={viewStats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          sub={`ROI ${fmtSignedPct(viewStats.roi)}`}
        />
        <StatCard label="Record" value={viewStats.record} sub={`${viewStats.placed} placed`} />
        <StatCard
          label="Risked (settled)"
          value={fmtMoney(viewStats.staked)}
          sub={`${viewStats.won + viewStats.lost + viewStats.push} settled`}
        />
        <StatCard
          label="Pending Risk"
          value={fmtMoney(viewStats.pendingRisk)}
          sub={`${viewStats.pending} open`}
        />
        <StatCard
          label="Avg CLV"
          value={avgClv == null ? '—' : fmtSignedPct(avgClv, 2)}
          tone={avgClv == null ? undefined : avgClv >= 0 ? 'text-emerald-400' : 'text-red-400'}
          sub={clvBets.length ? `${clvBets.length} market bets vs close` : 'No fair-market CLV yet'}
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
      <div className="flex flex-wrap items-center gap-2">
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
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Origin
          <select
            value={originFilter}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'all' || value === 'bet-now' || value === 'other')
                setOriginFilter(value);
            }}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-white outline-none focus:border-emerald-500/60"
          >
            <option value="all">All placements</option>
            <option value="bet-now">Bet Now</option>
            <option value="other">Other / legacy</option>
          </select>
        </label>
        <div className="relative ml-auto">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bets…"
            className="w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pr-3 pl-8 text-xs text-white outline-none focus:border-emerald-500/60"
          />
        </div>
        {types.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Type
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-white outline-none focus:border-emerald-500/60"
            >
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        <label
          className="flex items-center gap-2 text-xs text-zinc-400"
          title="Expected profit per dollar staked, captured from the model recommendation when the bet was placed."
        >
          EV
          <select
            value={evFilter}
            onChange={(e) => setEvFilter(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-white outline-none focus:border-emerald-500/60"
          >
            <option value="all">Any EV</option>
            <option value="0">EV ≥ 0%</option>
            <option value="2">EV ≥ 2%</option>
            <option value="5">EV ≥ 5%</option>
            <option value="10">EV ≥ 10%</option>
            <option value="15">EV ≥ 15%</option>
          </select>
        </label>
        <label
          className="flex items-center gap-2 text-xs text-zinc-400"
          title="Model win probability minus market-implied probability, captured when the bet was placed."
        >
          Value
          <select
            value={valueFilter}
            onChange={(e) => setValueFilter(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-white outline-none focus:border-emerald-500/60"
          >
            <option value="all">Any value</option>
            <option value="0">Value ≥ 0%</option>
            <option value="2">Value ≥ 2%</option>
            <option value="4">Value ≥ 4%</option>
            <option value="6">Value ≥ 6%</option>
            <option value="10">Value ≥ 10%</option>
          </select>
        </label>
        {(weeks.length > 0 || hasFutures) && (
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Week
            <select
              value={weekFilter}
              onChange={(e) => setWeekFilter(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-white outline-none focus:border-emerald-500/60"
            >
              <option value="all">All weeks</option>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
              {hasFutures && <option value="futures">Futures</option>}
            </select>
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={refreshAll}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-emerald-500/60 hover:text-white"
      >
        <RefreshCw size={14} />
        Refresh Results
      </button>

      {/* Bet list */}
      {shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-500">
          No bets here yet. Head to the Slate or Futures and hit &ldquo;Place&rdquo; to start
          tracking.
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((b) => (
            <BetRow
              key={b.id}
              bet={b}
              status={b.gameId ? statuses[b.gameId] : undefined}
              onStatus={updateStatus}
              onStake={updateStake}
              onRemove={removeBet}
            />
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
  status,
  onStatus,
  onStake,
  onRemove,
}: {
  bet: PlacedBet;
  status?: LiveStatus;
  onStatus: (id: string, s: PlacedBet['status']) => void;
  onStake: (id: string, patch: { stakeUnits?: number; unitSize?: number }) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [unitsDraft, setUnitsDraft] = useState('');
  const [amountDraft, setAmountDraft] = useState('');
  const stake = bet.stakeUnits * bet.unitSize;
  const fee = bet.fee ?? 0;
  const totalRisk = stake + fee;
  const toWin = stake * americanToProfit(bet.price) - fee;
  const result =
    bet.status === 'won'
      ? toWin
      : bet.status === 'lost'
        ? -totalRisk
        : bet.status === 'push'
          ? -fee
          : 0;
  const live = status && status.state !== 'pre';
  const round = (n: number) => Math.round(n * 100) / 100;

  const startEdit = () => {
    setUnitsDraft(String(bet.stakeUnits));
    setAmountDraft(String(round(stake)));
    setEditing(true);
  };

  const saveEdit = () => {
    const units = Number(unitsDraft);
    if (Number.isFinite(units) && units > 0) onStake(bet.id, { stakeUnits: round(units) });
    setEditing(false);
  };

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{bet.description}</span>
          {bet.source === 'ken' && <Chip variant="ken">Ken</Chip>}
          {live && (
            <span
              className={clsx(
                'chip',
                status!.state === 'in'
                  ? 'border-red-500/40 bg-red-500/10 text-red-300'
                  : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
              )}
            >
              {status!.state === 'in' ? 'LIVE' : 'Final'} {status!.away} {status!.awayScore}–
              {status!.homeScore} {status!.home}
              {status!.state === 'in' && status!.detail ? ` · ${status!.detail}` : ''}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{bet.market}</span>
          {bet.placementSurface === 'bet-now' && (
            <span className="font-semibold text-emerald-400/80">Bet Now</span>
          )}
          {bet.book && <span>{bet.book}</span>}
          <span className="mono">{formatOdds(bet.price)}</span>
          <button
            type="button"
            onClick={startEdit}
            title="Adjust stake"
            className="mono inline-flex items-center gap-1 rounded hover:text-white"
          >
            {bet.stakeUnits}u · {fmtMoney(stake)}
            <Pencil size={11} className="text-zinc-600" />
          </button>
          {fee > 0 && (
            <span className="mono text-amber-400/80" title="Per-bet fee included in P&L">
              Fee {fmtMoney(fee)} · risk {fmtMoney(totalRisk)}
            </span>
          )}
          <span className="mono">to win {fmtMoney(toWin)}</span>
          {bet.confidence != null && <span>{bet.confidence}% conf</span>}
          <span
            className={clsx(
              'mono',
              bet.edge == null
                ? 'text-zinc-600'
                : bet.edge >= 0
                  ? 'text-emerald-400/80'
                  : 'text-red-400/80',
            )}
            title="Model probability edge recorded when the bet was placed"
          >
            Edge {bet.edge == null ? '—' : fmtSignedPct(bet.edge)}
          </span>
          <span
            className={clsx(
              'mono',
              bet.evPercent == null
                ? 'text-zinc-600'
                : bet.evPercent >= 0
                  ? 'text-emerald-400/80'
                  : 'text-red-400/80',
            )}
            title="Expected profit per dollar staked, before fees, captured when the bet was placed"
          >
            EV {bet.evPercent == null ? '—' : fmtSignedPct(bet.evPercent)}
          </span>
          <span
            className={clsx(
              'mono',
              bet.valuePercent == null
                ? 'text-zinc-600'
                : bet.valuePercent >= 0
                  ? 'text-emerald-400/80'
                  : 'text-red-400/80',
            )}
            title="Model win probability minus market-implied probability, captured when the bet was placed"
          >
            Value % {bet.valuePercent == null ? '—' : fmtSignedPct(bet.valuePercent)}
          </span>
          <span
            className={clsx(
              'mono',
              bet.clvStatus === 'available'
                ? (bet.clv ?? bet.clvLine ?? -1) >= 0
                  ? 'text-emerald-400/80'
                  : 'text-red-400/80'
                : 'text-zinc-600',
            )}
            title={
              bet.clvStatus === 'unavailable'
                ? bet.clvUnavailableReason === 'no-pre-kickoff-snapshot'
                  ? 'No pre-kickoff quote was saved for this game, so closing-line value cannot be calculated. The local server must be running to capture closing prices.'
                  : 'A closing quote exists, but it does not include this bet’s market or sportsbook.'
                : 'Market CLV compares closing no-vig probability with the same-book, placement-time no-vig probability. Odds CLV compares with the bet’s break-even probability. The separate line value shows favorable spread/total/prop movement.'
            }
          >
            CLV{' '}
            {bet.clvStatus === 'available' && (bet.clv != null || bet.clvLine != null)
              ? [
                  bet.clv != null
                    ? `${bet.clvBasis === 'market' ? 'Market' : bet.clvBasis === 'legacy' ? 'Legacy' : 'Odds'} ${fmtSignedPct(bet.clv)}`
                    : undefined,
                  bet.clvLine != null
                    ? `${bet.clvLine >= 0 ? '+' : ''}${bet.clvLine.toFixed(1)} ${
                        bet.pickType === 'Prop' || /·\s*Prop$/.test(bet.market) ? 'line' : 'pt'
                      }`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : bet.clvStatus === 'pending'
                ? 'Pending'
                : bet.clvStatus === 'unavailable'
                  ? 'Unavailable'
                  : '—'}
          </span>
        </div>
        {editing && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-zinc-400">
              Units
              <input
                type="number"
                min={0}
                step={0.5}
                value={unitsDraft}
                autoFocus
                onChange={(e) => {
                  const u = e.target.value;
                  setUnitsDraft(u);
                  setAmountDraft(u === '' ? '' : String(round(Number(u) * bet.unitSize)));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="mono w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-white outline-none focus:border-emerald-500/60"
              />
            </label>
            <label className="flex items-center gap-1.5 text-zinc-400">
              Amount $
              <input
                type="number"
                min={0}
                value={amountDraft}
                onChange={(e) => {
                  const a = e.target.value;
                  setAmountDraft(a);
                  setUnitsDraft(
                    a === '' || !bet.unitSize ? '' : String(round(Number(a) / bet.unitSize)),
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="mono w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-white outline-none focus:border-emerald-500/60"
              />
            </label>
            <button
              type="button"
              onClick={saveEdit}
              className="rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 font-semibold text-white transition hover:bg-emerald-500/20"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-semibold text-zinc-400 transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}
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
            {bet.status === 'push' ? `Push · ${fmtMoney(result)}` : fmtMoney(result)}
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

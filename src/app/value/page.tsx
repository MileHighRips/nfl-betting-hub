import { Flame, Zap, AlertTriangle } from 'lucide-react';
import { getGames } from '@/lib/odds-source';
import { analyzeGame } from '@/lib/model';
import { FUTURES } from '@/data/futures';
import { getCurrentWeek } from '@/lib/schedule';
import { Chip, ConfidenceBar, OddsBadge, SectionTitle } from '@/components/atoms';
import PlaceBetButton from '@/components/PlaceBetButton';
import type { ModelPick } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ValuePage() {
  const CURRENT_WEEK = getCurrentWeek();
  const { games } = await getGames(CURRENT_WEEK);
  const analyses = games.map(analyzeGame);

  // Collect every game pick with a positive edge.
  const gamePicks: ModelPick[] = [];
  for (const a of analyses) {
    for (const p of [a.spread, a.total, a.moneyline, a.prop, a.upset].filter(
      Boolean,
    ) as ModelPick[]) {
      if (p.edge > 0.03) gamePicks.push(p);
    }
  }
  gamePicks.sort((x, y) => y.edge - x.edge);

  const futuresValue = FUTURES.filter((f) => f.edge > 0).sort((a, b) => b.edge - a.edge);

  // "Sharp alerts": the most extreme disagreements anywhere.
  const sharpFutures = futuresValue.filter((f) => f.edge >= 0.03).slice(0, 6);
  const longshots = FUTURES.filter((f) => f.price >= 2000 && f.edge > 0).sort(
    (a, b) => b.price - a.price,
  );

  return (
    <div className="space-y-8">
      <SectionTitle
        title="Value Board"
        subtitle="Prices that look out of whack — where the model most disagrees with DraftKings & FanDuel"
        icon={<Flame size={18} />}
      />

      {/* Sharp alerts */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Zap size={16} className="text-[var(--color-gold)]" />
          <h3 className="text-sm font-bold tracking-widest text-zinc-400 uppercase">
            Sharp Alerts — Biggest Futures Mispricings
          </h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sharpFutures.map((f) => (
            <div key={f.id} className="card border-[rgba(245,196,81,0.3)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  {f.market}
                </span>
                <OddsBadge price={f.price} book={f.book} />
              </div>
              <div className="mt-1 text-sm font-bold text-white">{f.selection}</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-lg font-black text-emerald-400">
                  +{(f.edge * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-zinc-500">edge vs market</span>
              </div>
              {f.kenPick && (
                <div className="mt-2">
                  <Chip variant="ken">Ken Bet</Chip>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Longshot watch */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-cyan-400" />
          <h3 className="text-sm font-bold tracking-widest text-zinc-400 uppercase">
            Longshot Watch — Big Prices Worth Keeping an Eye On
          </h3>
        </div>
        <div className="space-y-2">
          {longshots.map((f) => (
            <div key={f.id} className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{f.selection}</span>
                  <Chip>{f.market}</Chip>
                  {f.kenPick && <Chip variant="ken">Ken Bet</Chip>}
                </div>
                <p className="mt-1 text-xs text-zinc-500">{f.rationale}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-400">
                  +{(f.edge * 100).toFixed(1)}%
                </span>
                <OddsBadge price={f.price} book={f.book} />
                <PlaceBetButton
                  description={`${f.selection} — ${f.market}`}
                  market={`Futures · ${f.market}`}
                  price={f.price}
                  stakeUnits={Number((f.units || 0.5).toFixed(2))}
                  confidence={f.confidence}
                  source={f.kenPick ? 'ken' : 'model'}
                  compact
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly edges */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Flame size={16} className="text-emerald-400" />
          <h3 className="text-sm font-bold tracking-widest text-zinc-400 uppercase">
            Week {CURRENT_WEEK} Edges
          </h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gamePicks.slice(0, 12).map((p, i) => (
            <div key={p.gameId + p.type + i} className="card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  {p.type}
                </span>
                <OddsBadge price={p.price} book={p.book} />
              </div>
              <div className="mt-1 text-sm font-bold text-white">{p.selection}</div>
              <div className="mt-2">
                <ConfidenceBar value={p.confidence} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400">
                  +{(p.edge * 100).toFixed(1)}% edge
                </span>
                <PlaceBetButton
                  description={p.selection}
                  market={`Week ${CURRENT_WEEK} · ${p.type}`}
                  price={p.price}
                  stakeUnits={Number(p.units.toFixed(2))}
                  confidence={p.confidence}
                  source="model"
                  compact
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

import { Layers, Link2 } from 'lucide-react';
import { formatOdds } from '@/lib/odds';
import PlaceBetButton from './PlaceBetButton';
import type { ParlaySuggestion } from '@/lib/parlays';

/**
 * Value parlay board: cross-game straight parlays (sound independent math). All
 * strictly +EV. Same-game parlays live inside their game card.
 */
export default function ParlaysBoard({
  parlays,
  week,
}: {
  parlays: ParlaySuggestion[];
  week: number;
}) {
  if (!parlays.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Layers size={16} className="text-emerald-400" />
        <h3 className="text-sm font-bold text-white">Value Parlays</h3>
        <span className="text-[10px] text-zinc-500">+EV combinations only</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {parlays.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="chip border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                {p.legs.length}-Leg Parlay
              </span>
              <span className="mono text-sm font-bold text-white">{formatOdds(p.americanOdds)}</span>
              <span className="text-[10px] font-semibold text-emerald-400">
                +{(p.ev * 100).toFixed(0)}% EV
              </span>
              <div className="ml-auto">
                <PlaceBetButton
                  description={`${p.legs.length}-Leg Parlay: ${p.legs.map((l) => l.selection).join(' + ')}`}
                  market={`Week ${week} · Parlay`}
                  price={p.americanOdds}
                  stakeUnits={Number(p.units.toFixed(2))}
                  source="model"
                  compact
                />
              </div>
            </div>
            <div className="space-y-1.5">
              {p.legs.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Link2 size={12} className="shrink-0 text-zinc-600" />
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{l.selection}</span>
                  <span className="text-zinc-500">{l.matchup}</span>
                  <span className="mono text-zinc-400">{formatOdds(l.price)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-zinc-500">
              Model win {Math.round(p.modelProb * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

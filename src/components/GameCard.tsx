import { AlertTriangle, TrendingUp } from 'lucide-react';
import type { GameAnalysis } from '@/lib/model';
import { TEAMS } from '@/lib/teams';
import { fmtKick } from '@/lib/format';
import { formatOdds } from '@/lib/odds';
import { Chip, ConfidenceBar, OddsBadge, TeamBadge } from './atoms';
import PlaceBetButton from './PlaceBetButton';
import type { ModelPick } from '@/lib/types';

function PickRow({
  label,
  pick,
  matchup,
  week,
}: {
  label: string;
  pick: ModelPick;
  matchup: string;
  week: number;
}) {
  const edgePos = pick.edge > 0;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-widest text-zinc-500 uppercase">{label}</span>
          {edgePos && (
            <span className="text-[10px] font-semibold text-emerald-400">
              +{(pick.edge * 100).toFixed(1)}% edge
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-white">{pick.selection}</div>
        <div className="mt-1.5 max-w-[220px]">
          <ConfidenceBar value={pick.confidence} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <OddsBadge price={pick.price} book={pick.book} />
        {pick.units > 0 ? (
          <PlaceBetButton
            description={`${pick.selection} (${matchup})`}
            market={`Week ${week} · ${pick.type}`}
            price={pick.price}
            stakeUnits={Number(pick.units.toFixed(2))}
            confidence={pick.confidence}
            source="model"
          />
        ) : (
          <span className="chip">No value</span>
        )}
      </div>
    </div>
  );
}

export default function GameCard({ a }: { a: GameAnalysis }) {
  const { game } = a;
  const home = TEAMS[game.home];
  const away = TEAMS[game.away];
  const matchup = `${away.abbr} @ ${home.abbr}`;
  const dk = game.books.find((b) => b.book === 'DraftKings')!;
  const fd = game.books.find((b) => b.book === 'FanDuel')!;

  return (
    <div className="card card-hover overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] p-4">
        <div className="flex items-center gap-2">
          <TeamBadge abbr={game.away} />
          <span className="text-zinc-600">@</span>
          <TeamBadge abbr={game.home} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">
            {away.city} {away.name} at {home.city} {home.name}
          </div>
          <div className="text-xs text-zinc-500">
            {game.status === 'pre' || !game.status ? (
              fmtKick(game.kickoff)
            ) : (
              <span className="mono font-semibold text-zinc-300">
                {away.abbr} {game.awayScore} · {home.abbr} {game.homeScore}
                <span className="ml-1 text-zinc-500">
                  {game.statusDetail ?? (game.status === 'in' ? 'Live' : 'Final')}
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {game.status === 'in' && (
            <span className="chip border-red-500/40 bg-red-500/10 text-red-300">LIVE</span>
          )}
          {game.status === 'post' && <Chip>Final</Chip>}
          {game.context.divisionGame && <Chip>Division</Chip>}
          {game.context.weather === 'dome' && <Chip>Dome</Chip>}
          {game.context.notes && <Chip>{game.context.notes}</Chip>}
        </div>
      </div>

      {/* Line shopping table */}
      <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1 px-4 py-3 text-xs">
        <div />
        <div className="text-center font-semibold text-zinc-500">Spread</div>
        <div className="text-center font-semibold text-zinc-500">Total</div>
        <div className="text-center font-semibold text-zinc-500">Moneyline</div>

        {[
          { name: 'DK', b: dk },
          { name: 'FD', b: fd },
        ].map(({ name, b }) => (
          <FragmentRow key={name} name={name} b={b} awayAbbr={away.abbr} homeAbbr={home.abbr} />
        ))}
      </div>

      {/* Model picks */}
      <div className="space-y-2 px-4 pb-3">
        <PickRow label="Model · Spread" pick={a.spread} matchup={matchup} week={game.week} />
        <PickRow label="Model · Total" pick={a.total} matchup={matchup} week={game.week} />
        {a.moneyline.confidence >= a.spread.confidence && (
          <PickRow
            label="Model · Moneyline"
            pick={a.moneyline}
            matchup={matchup}
            week={game.week}
          />
        )}
      </div>

      {/* Upset alert */}
      {a.upset && (
        <div className="mx-4 mb-3 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 sm:flex-row sm:items-center">
          <AlertTriangle size={18} className="text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-amber-300">Underdog Upset Angle</div>
            <div className="truncate text-sm font-semibold text-white">{a.upset.selection}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="mono text-xs text-amber-300">{a.upset.confidence}%</span>
            <OddsBadge price={a.upset.price} book={a.upset.book} />
            <PlaceBetButton
              description={`${a.upset.selection} (${matchup})`}
              market={`Week ${game.week} · Upset`}
              price={a.upset.price}
              stakeUnits={Number(a.upset.units.toFixed(2))}
              confidence={a.upset.confidence}
              source="model"
            />
          </div>
        </div>
      )}

      {/* Best prop */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp size={15} className="text-cyan-400" />
          <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
            Highest-Confidence Prop
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white">
              {game.prop.player} · {game.prop.side} {game.prop.line} {game.prop.market}
            </div>
            <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{game.prop.rationale}</div>
            <div className="mt-1.5 max-w-[240px]">
              <ConfidenceBar value={game.prop.confidence} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="mono text-xs text-zinc-400">
              proj {game.prop.projection} / {formatOdds(game.prop.price)}
            </span>
            <PlaceBetButton
              description={`${game.prop.player} ${game.prop.side} ${game.prop.line} ${game.prop.market} (${matchup})`}
              market={`Week ${game.week} · Prop`}
              price={game.prop.price}
              stakeUnits={Number(a.prop.units.toFixed(2)) || 0.5}
              confidence={game.prop.confidence}
              source="model"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({
  name,
  b,
  awayAbbr,
  homeAbbr,
}: {
  name: string;
  b: import('@/lib/types').BookLine;
  awayAbbr: string;
  homeAbbr: string;
}) {
  return (
    <>
      <div className="flex items-center text-[11px] font-bold text-zinc-400">{name}</div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="mono text-zinc-300">
          {homeAbbr} {b.spread > 0 ? '+' : ''}
          {b.spread}
        </span>
        <span className="mono text-[10px] text-zinc-600">{formatOdds(b.spreadPriceHome)}</span>
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="mono text-zinc-300">{b.total}</span>
        <span className="mono text-[10px] text-zinc-600">
          o{formatOdds(b.overPrice)} / u{formatOdds(b.underPrice)}
        </span>
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="mono text-zinc-300">
          {awayAbbr} {formatOdds(b.moneylineAway)}
        </span>
        <span className="mono text-zinc-300">
          {homeAbbr} {formatOdds(b.moneylineHome)}
        </span>
      </div>
    </>
  );
}

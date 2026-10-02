import { AlertTriangle, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import type { GameAnalysis } from '@/lib/model';
import type { GameGrades, PickResult } from '@/lib/pick-grade';
import { TEAMS } from '@/lib/teams';
import { fmtKick } from '@/lib/format';
import { formatOdds } from '@/lib/odds';
import { Chip, ConfidenceBar, OddsBadge, TeamBadge } from './atoms';
import PlaceBetButton from './PlaceBetButton';
import LockToggle from './LockToggle';
import type { ModelPick } from '@/lib/types';
import type { ParlaySuggestion } from '@/lib/parlays';
import { classifyBet, type BetTierKey } from '@/lib/bet-tier';

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

function TierBadge({
  edge,
  disconnect,
  hasSignal,
  narrative,
}: {
  edge: number;
  disconnect?: ModelPick['disconnect'];
  hasSignal?: boolean;
  narrative?: boolean;
}) {
  const t = classifyBet({ edge, disconnect, hasSignal, narrative });
  if (t.key === 'none') return null;
  return (
    <span
      className={clsx('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', TIER_STYLE[t.key])}
      title={`EV:${t.ev ? '✓' : '–'} News:${t.news ? '✓' : '–'} Narrative:${t.narrative ? '✓' : '–'}`}
    >
      {TIER_ICON[t.key]}
      {t.label}
    </span>
  );
}

export function ResultBadge({ result }: { result?: PickResult }) {
  if (!result) return null;
  return (
    <span
      className={clsx(
        'chip',
        result === 'won' && 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400',
        result === 'lost' && 'border-red-500/50 bg-red-500/15 text-red-400',
        result === 'push' && 'border-zinc-500/50 bg-zinc-500/15 text-zinc-300',
      )}
    >
      {result === 'won' ? 'Won' : result === 'lost' ? 'Lost' : 'Push'}
    </span>
  );
}
// The slate stakes by conviction (true units). Legacy week 1-2 locks have no
// trueUnits, so they keep their frozen flat stake and never move.
function stakeOf(pick: { units: number; trueUnits?: number }): number {
  return Number((pick.trueUnits ?? pick.units).toFixed(2));
}

function PickRow({
  label,
  pick,
  matchup,
  week,
  result,
}: {
  label: string;
  pick: ModelPick;
  matchup: string;
  week: number;
  result?: PickResult;
}) {
  const edgePos = pick.edge > 0;
  const stake = stakeOf(pick);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] tracking-widest text-zinc-500 uppercase">{label}</span>
          {edgePos && (
            <span className="text-[10px] font-semibold text-emerald-400">
              +{(pick.edge * 100).toFixed(1)}% edge
            </span>
          )}
          <TierBadge
            edge={pick.edge}
            disconnect={pick.disconnect}
            hasSignal={!!pick.note}
            narrative={pick.narrative}
          />
          <ResultBadge result={result} />
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-white">{pick.selection}</div>
        <div className="mt-1.5 max-w-[220px]">
          <ConfidenceBar value={pick.confidence} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <OddsBadge price={pick.price} book={pick.book} />
        {stake > 0 ? (
          <PlaceBetButton
            description={`${pick.selection} (${matchup})`}
            market={`Week ${week} · ${pick.type}`}
            price={pick.price}
            stakeUnits={stake}
            confidence={pick.confidence}
            source="model"
            gameId={pick.gameId}
            pickType={pick.type}
            side={pick.side}
            line={pick.line}
            player={pick.player}
            propMarket={pick.propMarket}
          />
        ) : (
          <span className="chip">No value</span>
        )}
      </div>
    </div>
  );
}

export default function GameCard({
  a,
  grades,
  sgp,
}: {
  a: GameAnalysis;
  grades?: GameGrades;
  sgp?: ParlaySuggestion;
}) {
  const { game } = a;
  const home = TEAMS[game.home];
  const away = TEAMS[game.away];
  const matchup = `${away.abbr} @ ${home.abbr}`;
  const dk = game.books.find((b) => b.book === 'DraftKings') ?? game.books[0];

  // Surface the model's best big-payout +EV scorer alongside the core ATDs.
  const atdList = [...a.anytimeTds];
  const lsPlayer = a.anytimeTdLongshot?.player;
  if (a.anytimeTdLongshot && !atdList.some((t) => t.player === lsPlayer)) {
    atdList.push(a.anytimeTdLongshot);
  }

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
          <LockToggle gameId={game.id} locked={!!a.locked} />
          {game.context.awayQbOut && (
            <span className="chip border-amber-500/40 bg-amber-500/10 text-amber-300">
              {away.abbr} QB Out
            </span>
          )}
          {game.context.homeQbOut && (
            <span className="chip border-amber-500/40 bg-amber-500/10 text-amber-300">
              {home.abbr} QB Out
            </span>
          )}
          {game.context.divisionGame && <Chip>Division</Chip>}
          {game.context.weather === 'dome' && <Chip>Dome</Chip>}
          {game.context.windMph != null && game.context.windMph >= 12 && (
            <Chip>Wind {game.context.windMph}mph</Chip>
          )}
          {(game.context.weather === 'rain' || game.context.weather === 'snow') && (
            <Chip>{game.context.weather === 'snow' ? 'Snow' : 'Rain'}</Chip>
          )}
          {game.context.weather === 'cold' && game.context.tempF != null && (
            <Chip>{game.context.tempF}°F</Chip>
          )}
          {game.context.notes && <Chip>{game.context.notes}</Chip>}
        </div>
      </div>

      {/* DraftKings line */}
      <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1 px-4 py-3 text-xs">
        <div />
        <div className="text-center font-semibold text-zinc-500">Spread</div>
        <div className="text-center font-semibold text-zinc-500">Total</div>
        <div className="text-center font-semibold text-zinc-500">Moneyline</div>

        <FragmentRow name="DK" b={dk} awayAbbr={away.abbr} homeAbbr={home.abbr} />
      </div>

      {/* Simulation projection */}
      <div className="flex items-center justify-between border-y border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-2 text-xs">
        <span className="tracking-widest text-zinc-500 uppercase">Sim Projection</span>
        <span className="mono text-zinc-300">
          {away.abbr} {a.projAway.toFixed(1)} — {home.abbr} {a.projHome.toFixed(1)}
        </span>
        <span className="mono text-zinc-500">
          {Math.round(Math.max(a.homeWinProb, 1 - a.homeWinProb) * 100)}% win ·{' '}
          {(a.sim.n / 1000).toFixed(0)}k sims
        </span>
      </div>

      {/* Game-script narrative (derived from the sim — high/low scoring, blowout) */}
      {a.script && a.script.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]/20 px-4 py-2 text-[11px]">
          <span className="tracking-widest text-zinc-500 uppercase">Script</span>
          {a.script.tags.map((t, i) => (
            <span
              key={i}
              className="rounded-md border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 font-semibold text-orange-300"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Model picks */}
      <div className="space-y-2 px-4 pb-3">
        <PickRow
          label="Model · Spread"
          pick={a.spread}
          matchup={matchup}
          week={game.week}
          result={grades?.spread}
        />
        <PickRow
          label="Model · Total"
          pick={a.total}
          matchup={matchup}
          week={game.week}
          result={grades?.total}
        />
        {a.moneyline.confidence >= a.spread.confidence && (
          <PickRow
            label="Model · Moneyline"
            pick={a.moneyline}
            matchup={matchup}
            week={game.week}
            result={grades?.moneyline}
          />
        )}
      </div>

      {/* Upset alert — frozen locked games only; for live games it duplicates the ML pick */}
      {a.upset && a.locked && (
        <div className="mx-4 mb-3 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 sm:flex-row sm:items-center">
          <AlertTriangle size={18} className="text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-amber-300">Underdog Upset Angle</div>
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-white">{a.upset.selection}</span>
              <ResultBadge result={grades?.upset} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="mono text-xs text-amber-300">{a.upset.confidence}%</span>
            <OddsBadge price={a.upset.price} book={a.upset.book} />
            <PlaceBetButton
              description={`${a.upset.selection} (${matchup})`}
              market={`Week ${game.week} · Upset`}
              price={a.upset.price}
              stakeUnits={stakeOf(a.upset)}
              confidence={a.upset.confidence}
              source="model"
              gameId={a.upset.gameId}
              pickType={a.upset.type}
              side={a.upset.side}
              line={a.upset.line}
            />
          </div>
        </div>
      )}

      {/* Value props (multiple when the model finds value) */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp size={15} className="text-cyan-400" />
          <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
            {a.props.length > 1 ? 'Value Props' : 'Highest-Confidence Prop'}
          </span>
          {a.locked && <ResultBadge result={grades?.prop} />}
        </div>
        <div className="space-y-2">
          {a.props.map(({ pick, detail }, i) => {
            const stake = stakeOf(pick);
            return (
              <div
                key={`${detail.player}-${detail.market}-${i}`}
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {detail.player} · {detail.side} {detail.line} {detail.market}
                    </span>
                    {pick.edge > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-400">
                        +{(pick.edge * 100).toFixed(1)}%
                      </span>
                    )}
                    <TierBadge
                      edge={pick.edge}
                      disconnect={pick.disconnect}
                      hasSignal={!!pick.note}
                      narrative={pick.narrative}
                    />
                    {i === 0 && a.locked && <ResultBadge result={grades?.prop} />}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{detail.rationale}</div>
                  <div className="mt-1.5 max-w-[240px]">
                    <ConfidenceBar value={detail.confidence} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="mono text-xs text-zinc-400">
                    proj {detail.projection} / {formatOdds(detail.price)}
                  </span>
                  {stake > 0 ? (
                    <PlaceBetButton
                      description={`${detail.player} ${detail.side} ${detail.line} ${detail.market} (${matchup})`}
                      market={`Week ${game.week} · Prop`}
                      price={detail.price}
                      stakeUnits={stake}
                      confidence={detail.confidence}
                      source="model"
                      gameId={pick.gameId}
                      pickType={pick.type}
                      side={detail.side.toLowerCase()}
                      line={pick.line}
                      player={detail.player}
                      propMarket={detail.market}
                    />
                  ) : (
                    <span className="chip">No value</span>
                  )}
                </div>
              </div>
            );
          })}
          {a.props.length === 0 && (
            <div className="text-xs text-zinc-500">No prop value in this game.</div>
          )}
        </div>
      </div>

      {/* Anytime TDs (multiple scorers when there's value) */}
      {atdList.length > 0 && (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] tracking-widest text-orange-400 uppercase">
              {atdList.length > 1 ? 'Anytime TD Value' : 'Anytime TD'}
            </span>
          </div>
          <div className="space-y-2">
            {atdList.map((td, i) => {
              const stake = stakeOf(td);
              const isLongshot = td.player === lsPlayer && !a.anytimeTds.some((x) => x.player === lsPlayer);
              const tdGrade =
                td.player === a.anytimeTd?.player
                  ? grades?.anytimeTd
                  : td.player === a.anytimeTdLongshot?.player
                    ? grades?.anytimeTdLongshot
                    : undefined;
              return (
                <div
                  key={`${td.player}-${i}`}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">{td.player}</span>
                      {td.ev > 0 && (
                        <span className="text-[10px] font-semibold text-emerald-400">
                          +{(td.ev * 100).toFixed(0)}% EV
                        </span>
                      )}
                      {isLongshot && (
                        <span className="rounded-md border border-fuchsia-500/50 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-300">
                          🎟️ Longshot
                        </span>
                      )}
                      <TierBadge
                        edge={td.edge}
                        disconnect={td.disconnect}
                        hasSignal={!!td.note}
                        narrative={td.narrative}
                      />
                      {td.note && (
                        <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                          📰 {td.note}
                        </span>
                      )}
                      {a.locked && <ResultBadge result={tdGrade} />}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {Math.round(td.prob * 100)}% to score · DK{' '}
                      {Math.round(td.impliedProb * 100)}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <OddsBadge price={td.price} book={td.book} />
                    {stake > 0 ? (
                      <PlaceBetButton
                        description={`${td.player} Anytime TD (${matchup})`}
                        market={`Week ${game.week} · Anytime TD`}
                        price={td.price}
                        stakeUnits={stake}
                        confidence={Math.round(td.prob * 100)}
                        source="model"
                      />
                    ) : (
                      <span className="chip">No value</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Same-game parlay for this game (correlated, +EV — payout is a book-verified estimate) */}
      {sgp && (
        <div className="border-t border-fuchsia-500/30 bg-fuchsia-500/5 px-4 py-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] tracking-widest text-fuchsia-300 uppercase">
              Same-Game Parlay
            </span>
            <span className="mono text-xs font-bold text-white">
              {formatOdds(sgp.americanOdds)}
            </span>
            <span className="text-[10px] font-semibold text-emerald-400">
              +{(sgp.ev * 100).toFixed(0)}% EV
            </span>
            <span className="chip">est. · verify at book</span>
            <div className="ml-auto">
              <PlaceBetButton
                description={`SGP (${matchup}): ${sgp.legs.map((l) => l.selection).join(' + ')}`}
                market={`Week ${game.week} · SGP`}
                price={sgp.americanOdds}
                stakeUnits={Number(sgp.units.toFixed(2))}
                source="model"
                gameId={game.id}
                compact
              />
            </div>
          </div>
          <div className="space-y-1">
            {sgp.legs.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-zinc-200">{l.selection}</span>
                <span className="mono text-zinc-400">{formatOdds(l.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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

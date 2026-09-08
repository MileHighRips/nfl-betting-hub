import Link from 'next/link';
import { ArrowRight, Flame, Star, TrendingUp, Trophy } from 'lucide-react';
import { getGames } from '@/lib/odds-source';
import { analyzeGame } from '@/lib/model';
import { FUTURES } from '@/data/futures';
import { CURRENT_SEASON, CURRENT_WEEK } from '@/data/games';
import { Chip, ConfidenceBar, OddsBadge, SectionTitle } from '@/components/atoms';
import PlaceBetButton from '@/components/PlaceBetButton';
import DashboardStats from '@/components/DashboardStats';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { games, source } = await getGames();
  const analyses = games.map(analyzeGame);

  const topPlays = analyses
    .map((a) => a.topPick)
    .filter((p) => p.units > 0)
    .sort((x, y) => y.confidence - x.confidence)
    .slice(0, 6);

  const upsets = analyses.filter((a) => a.upset).map((a) => a.upset!);
  const kenBets = FUTURES.filter((f) => f.kenPick);
  const bestValue = [...FUTURES].sort((a, b) => b.edge - a.edge).slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <Chip variant="value">
              <Flame size={12} /> {source === 'live' ? 'Live Odds' : 'Seed Odds'}
            </Chip>
            <Chip>
              Season {CURRENT_SEASON} · Week {CURRENT_WEEK}
            </Chip>
          </div>
          <h1 className="mt-3 max-w-2xl text-3xl font-black tracking-tight text-white sm:text-4xl">
            The complete <span className="grad-text">NFL betting hub</span>, built on Ken
            Barkley&rsquo;s models.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Weekly lines from DraftKings &amp; FanDuel, a transparent weighted confidence engine,
            every futures market, a value board for out-of-whack prices, and a bankroll tracker so
            you can watch profit &amp; loss in real time.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/slate"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400"
            >
              This Week&rsquo;s Slate <ArrowRight size={15} />
            </Link>
            <Link
              href="/futures"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:text-white"
            >
              Futures &amp; Awards
            </Link>
          </div>
        </div>
      </section>

      <DashboardStats />

      {/* Top plays */}
      <section>
        <SectionTitle
          title="Top Model Plays This Week"
          subtitle="Highest-confidence edges across the slate"
          icon={<TrendingUp size={18} />}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topPlays.map((p) => (
            <div key={p.gameId + p.type} className="card card-hover p-4">
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
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Rec. {p.units.toFixed(2)}u</span>
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

      {/* Upsets + Ken bets */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle
            title="Underdog Upset Radar"
            subtitle="Dogs the model likes to win outright"
            icon={<Flame size={18} />}
          />
          <div className="space-y-3">
            {upsets.length === 0 && (
              <div className="card p-4 text-sm text-zinc-500">
                No standout underdog upsets on the board this week.
              </div>
            )}
            {upsets.map((u) => (
              <div key={u.gameId} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-white">{u.selection}</div>
                  <OddsBadge price={u.price} book={u.book} />
                </div>
                <div className="mt-2 max-w-xs">
                  <ConfidenceBar value={u.confidence} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle
            title="Ken&rsquo;s Actual 2026 Bets"
            subtitle="The turquoise picks straight from the guide"
            icon={<Star size={18} />}
          />
          <div className="space-y-2">
            {kenBets.map((f) => (
              <div key={f.id} className="card flex items-center gap-3 p-3">
                <Trophy size={16} className="shrink-0 text-[var(--color-gold)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{f.selection}</div>
                  <div className="text-xs text-zinc-500">{f.market}</div>
                </div>
                <OddsBadge price={f.price} book={f.book} />
                <PlaceBetButton
                  description={`${f.selection} — ${f.market}`}
                  market={`Futures · ${f.market}`}
                  price={f.price}
                  stakeUnits={Number((f.units || 0.5).toFixed(2))}
                  confidence={f.confidence}
                  source="ken"
                  compact
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Value peek */}
      <section>
        <SectionTitle
          title="Biggest Value on the Board"
          subtitle="Where our number most disagrees with the market"
          icon={<Flame size={18} />}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {bestValue.map((f) => (
            <div key={f.id} className="card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  {f.market}
                </span>
                <OddsBadge price={f.price} book={f.book} />
              </div>
              <div className="mt-1 text-sm font-bold text-white">{f.selection}</div>
              <div className="mt-2 text-xs font-semibold text-emerald-400">
                +{(f.edge * 100).toFixed(1)}% edge
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Link href="/value" className="text-sm font-semibold text-emerald-400 hover:underline">
            See the full value board →
          </Link>
        </div>
      </section>
    </div>
  );
}

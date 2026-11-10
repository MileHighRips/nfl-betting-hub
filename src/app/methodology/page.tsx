import { BrainCircuit, Database } from 'lucide-react';
import { SectionTitle, Chip } from '@/components/atoms';
import { SIM_CONFIG } from '@/lib/simulation';

export const metadata = { title: 'The Model · LockyLines' };

const KEN_MODELS = [
  {
    name: 'Short list, open mind',
    body: 'For every multi-way futures market, whittle 32 teams / dozens of players down to a short list of realistic winners, then only bet longshots on that list when the price is wrong. Everyone else has to prove it.',
  },
  {
    name: 'Super Bowl profile',
    body: 'Winners are almost always top-14 (ideally top-10) prior-year DVOA with a QB who has a top-10 PFF passing season on file. 2026 clean fits: Rams, Seahawks, Lions, Colts. Fringe: Bills, Jaguars, Ravens, Falcons, Bears.',
  },
  {
    name: '"Good football players" + retention',
    body: 'Champions carry stacked rosters by PFF grade (80+/75+/70+) on BOTH sides, and they retain that talent year-over-year. Roster talent predicts titles better than regular-season wins.',
  },
  {
    name: 'Mid-QB Theory',
    body: 'For OPOY, DPOY and Coach of the Year, you want a candidate playing with a non-elite, non-big-name QB. Star QBs are credit vacuums — they soak up the narrative and the votes.',
  },
  {
    name: 'Pass-defense regression',
    body: 'Pass defense is the least sticky unit year-over-year (r≈0.30 vs 0.45 for pass offense). Elite pass D craters; bottom-tier pass D bounces up ~45%. Worst-8 pass-D teams beat their win total ~59% next year (65% excluding rookie QBs). Basis for the Jets & Titans overs.',
  },
  {
    name: 'Sell the news / be last',
    body: 'When a preseason injury frenzy moves a market, don\u2019t chase the panic — be last and buy the other side after the overreaction (Romo→Dak, Kupp IR→Rams).',
  },
  {
    name: 'Price it like a stock',
    body: 'Buy at troughs with upside (T.J. Watt DPOY +3000), fade spikes bought at career-highs (Myles Garrett post-record + trade). Where is this name trading vs. its own history?',
  },
];

const FACTORS = [
  [
    'Efficiency Matchup',
    'Each team\u2019s offense vs the opponent\u2019s defense, in points — sets expected scoring.',
  ],
  ['Home Field', 'Team-specific edge (altitude, crowd, dome): Denver/Seattle ~2.5, others ~1.8.'],
  [
    'Rest & Bye',
    `${SIM_CONFIG.restPtPerDay} pts per day of rest edge, capped at ±${SIM_CONFIG.restCap}.`,
  ],
  [
    'Travel & Body Clock',
    'Haversine trip distance + timezone shift; penalizes West teams in early ET kicks.',
  ],
  ['Weather', 'Wind/rain/snow/cold suppress scoring and field-goal success; dome nudges up.'],
  ['Pace', 'Team tempo scales possessions per game — the lever that drives total value.'],
  [
    'QB Availability',
    'Team-specific backup dropoff (e.g. −9 for elite-QB teams) when a starter is out.',
  ],
  ['Pass-D Regression', 'Ken\u2019s least-sticky-unit signal is baked into the team ratings.'],
  [
    'In-Season Learning',
    'Elo-style margin updates adjust each team\u2019s rating from real results, weekly.',
  ],
  [
    'Market Blend',
    '20–25% model / 75–80% vig-free market until live picks establish model calibration.',
  ],
];

const DATA_PROXIES: [string, string][] = [
  [
    'ESPN Schedule & Odds',
    'Real matchups, kickoff times, and live DraftKings spread/total/moneyline.',
  ],
  ['Live Scores & Status', 'In-game scores and final results power grading and the form model.'],
  [
    'Injuries',
    'ESPN position/status/timestamp reports are captured for validation; players listed Out, IR, Suspended or Doubtful are excluded from props and the live starter-QB flag is modeled. Unvalidated positional impact is not assumed.',
  ],
  [
    'Timestamped Market History',
    'Pre-kickoff sportsbook spread, total, moneyline and available prop quotes are appended when prices/lines change. Collection starts with this release and is not backfilled.',
  ],
  [
    'Live Weather (Open-Meteo)',
    'Hourly wind, direction, precipitation and temperature at outdoor stadiums are timestamped. Existing wind/weather effects remain active; wind direction is captured for validation, not assigned an untested field-orientation effect.',
  ],
  [
    'Rest & Bye',
    'Actual days of rest per team, derived from prior game dates (short weeks, byes).',
  ],
  [
    'Results-Based Learning',
    'Completed games run an Elo-style update, re-rating every team weekly.',
  ],
  [
    'FanDuel (optional)',
    'Add a free Odds-API key to line-shop FanDuel and pull exact posted prop lines.',
  ],
];

const NOT_CONNECTED: [string, string][] = [
  [
    'Player tracking & assignments',
    'Official Next Gen Stats tracking and verified CB-WR / blocker-defender assignments are not connected to live picks.',
  ],
  [
    'Practice & depth-chart trends',
    'Structured practice participation, snap trends and depth-chart movement are not available in the connected feeds.',
  ],
  [
    'Officials & external market feeds',
    'Referee assignments and Action Network, Unabated, Kalshi or Polymarket feeds are not integrated.',
  ],
  [
    'Offline play-by-play experiments',
    'nflverse/PBP and scheme experiments remain research-only; prior walk-forward results did not justify adding them to live probabilities.',
  ],
];

export default function MethodologyPage() {
  return (
    <div className="space-y-8">
      <SectionTitle
        title="The Model"
        subtitle="How the hub turns Ken Barkley's philosophy into numbers, confidence and stakes"
        icon={<BrainCircuit size={18} />}
      />

      <section className="card p-6">
        <h3 className="text-base font-bold text-white">The drive-level simulation engine</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Every game is played out{' '}
          <span className="text-white">
            {(SIM_CONFIG.n / 1000).toFixed(0)},000 times, drive by drive
          </span>
          . The factors below build each team&rsquo;s expected points from first principles —
          offensive efficiency vs the opponent&rsquo;s defense, scaled by pace — and each possession
          resolves to a touchdown, field goal, or nothing. Because the{' '}
          <span className="text-white">total is modeled, not pinned to the market</span>, genuine
          Over/Under value shows up when our efficiency-and-pace view disagrees with the book.
          Spread (push-aware on key numbers), moneyline, total and team totals are all read off the
          same simulated distribution. Edge is{' '}
          <span className="text-emerald-400">model probability − market probability</span>. Until
          archived live results establish calibration, estimates are blended with the vig-free
          market using a 25–40% model weight depending on market, and one-eighth Kelly, capped at
          0.5 units.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {FACTORS.map(([label, detail]) => (
            <div
              key={label}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="text-sm font-semibold text-white">{label}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{detail}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip>{(SIM_CONFIG.n / 1000).toFixed(0)}k drive-level sims</Chip>
          <Chip>Push-aware key numbers</Chip>
          <Chip>First-principles totals</Chip>
          <Chip>Vig removed · line-shopped</Chip>
        </div>
      </section>

      <section className="card p-6">
        <h3 className="text-base font-bold text-white">
          Connected live data and validation capture
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Bet Now uses the live inputs listed here. Some fields are captured only for prospective
          validation; they are not automatically treated as proven model edges.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {DATA_PROXIES.map(([label, detail]) => (
            <div
              key={label}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Database size={14} className="text-emerald-400" />
                {label}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">{detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h3 className="text-base font-bold text-white">Not connected to live picks</h3>
        <p className="mt-2 text-sm text-zinc-400">
          These sources or granular data are not currently available in the live pipeline. The model
          does not infer player assignments or fabricate missing inputs.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {NOT_CONNECTED.map(([label, detail]) => (
            <div
              key={label}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="text-sm font-semibold text-white">{label}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold tracking-widest text-zinc-400 uppercase">
          Ken Barkley&rsquo;s Core Models
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {KEN_MODELS.map((m) => (
            <div key={m.name} className="card p-4">
              <div className="text-sm font-bold text-white">{m.name}</div>
              <p className="mt-1 text-sm text-zinc-400">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h3 className="text-base font-bold text-white">Player prop model</h3>
        <p className="mt-2 text-sm text-zinc-400">
          The single best prop per game is chosen by projecting every candidate (QBs, lead backs,
          top receivers, marquee rushers) from the <span className="text-white">live</span> game
          environment — each team&rsquo;s implied total and game script from the current DraftKings
          spread/total. Pass volume rises for trailing teams; rushing rises for favorites
          controlling the clock. Each projection is compared to the line and turned into an
          Over/Under probability with a per-market standard deviation, so the model backs the{' '}
          <span className="text-emerald-400">Over or the Under</span> — whichever holds the edge —
          and surfaces the highest-conviction look. Connect a live prop feed to replace the neutral
          baselines with the exact posted lines.
        </p>
      </section>

      <section className="card p-6">
        <h3 className="text-base font-bold text-white">Staking &amp; bankroll</h3>
        <p className="mt-2 text-sm text-zinc-400">
          One unit starts at $10 (configurable on the Tracker). Bet Now recommends at most one $5
          pick per game while the live model is being validated. This is a risk limit, not a promise
          of profit; use the live-pick scoreboard and closing-line value before increasing stakes.
        </p>
      </section>

      <p className="text-xs text-zinc-600">
        This hub adapts Ken Barkley&rsquo;s publicly-described 2026 methodology for personal use.
        Live schedule, DraftKings odds and scores come free from ESPN; add a free Odds-API key to
        overlay FanDuel. For entertainment only — bet responsibly.
      </p>
    </div>
  );
}

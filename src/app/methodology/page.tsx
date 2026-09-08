import { BrainCircuit } from 'lucide-react';
import { SectionTitle, Chip } from '@/components/atoms';
import { MODEL_CONFIG } from '@/lib/model';

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
  ['Power Rating Edge', 'Neutral-field team strength differential on a points scale.'],
  ['Home Field', `${MODEL_CONFIG.homeFieldAdvantage} pts to the host (0 at neutral sites).`],
  [
    'Rest Differential',
    `${MODEL_CONFIG.restPointPerDay} pts per day of rest edge, capped at ±${MODEL_CONFIG.restCap}.`,
  ],
  ['QB Availability', `±${MODEL_CONFIG.qbOutSwing} pt swing when a starting QB is ruled out.`],
  [
    'Division Dampener',
    `Rivalry familiarity tightens the margin by ${((1 - MODEL_CONFIG.divisionDampener) * 100).toFixed(0)}%.`,
  ],
  ['Pass-D Regression', 'Ken\u2019s least-sticky-unit signal nudges the season expectation.'],
  [
    'In-Season Learning',
    'After every completed game, an Elo-style margin update adjusts each team\u2019s power rating from real results.',
  ],
  [
    'Market Anchor',
    `${(MODEL_CONFIG.marketBlend * 100).toFixed(0)}% weight to the vig-free DraftKings line so we never stray absurdly from an efficient price.`,
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
        <h3 className="text-base font-bold text-white">The weighted confidence engine</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Every game pick is built from an explainable stack of factors — not a black box. We
          project a point margin, convert it to a win/cover probability with an NFL-calibrated
          normal curve (σ = {MODEL_CONFIG.sigma}), then blend it with the market&rsquo;s vig-removed
          price. Edge is{' '}
          <span className="text-emerald-400">model probability − market probability</span>, and
          stakes are sized with quarter-Kelly, hard-capped at 1 unit — you never risk more than a
          single unit on any bet.
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
          <Chip>Vig removed</Chip>
          <Chip>Quarter-Kelly sizing</Chip>
          <Chip>Normal-curve win prob</Chip>
          <Chip>Line-shopped best price</Chip>
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
        <h3 className="text-base font-bold text-white">Staking &amp; bankroll</h3>
        <p className="mt-2 text-sm text-zinc-400">
          One unit starts at $10 (configurable on the Tracker). Recommended stakes come from
          fractional Kelly on the model edge, so bigger, more confident edges get more units — but
          never more than 1 unit on a single play. Track results on the Tracker and the hub keeps a
          live record and ROI.
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

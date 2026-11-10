import { BarChart3 } from 'lucide-react';
import { Chip, SectionTitle } from '@/components/atoms';
import { runLivePickBacktest } from '@/lib/live-backtest';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Live Validation · LockyLines' };

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function ValidationPage() {
  const report = await runLivePickBacktest();

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Live Model Validation"
        subtitle="Prospective Bet Now results, calibration, market comparison, and picks filtered out"
        icon={<BarChart3 size={18} />}
      />

      <div className="card flex flex-wrap items-center gap-2 p-4 text-xs text-zinc-400">
        <Chip>{report.gamesObserved} games archived</Chip>
        <Chip>{report.gamesGraded} games graded</Chip>
        <Chip>{report.picksGraded} picks graded</Chip>
        <span className="ml-auto">Updated {new Date(report.generatedAt).toLocaleString()}</span>
      </div>

      {report.note && (
        <div className="card border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-200">
          {report.note}
        </div>
      )}

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-3 text-sm font-bold text-white">Recommended picks</h2>
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="p-2">Model</th>
              <th className="p-2">Market</th>
              <th className="p-2">Graded</th>
              <th className="p-2">Record</th>
              <th className="p-2">ROI</th>
              <th className="p-2">95% approx. range</th>
              <th className="p-2">Brier · model / market / blend</th>
              <th className="p-2">Log loss · blend</th>
              <th className="p-2">Mean CLV</th>
            </tr>
          </thead>
          <tbody>
            {report.markets.map((market) => (
              <tr
                key={`${market.modelVersion}-${market.market}`}
                className="border-t border-[var(--color-border)] text-zinc-300"
              >
                <td className="p-2">{market.modelVersion}</td>
                <td className="p-2 font-semibold text-white">{market.market}</td>
                <td className="p-2">{market.graded}</td>
                <td className="p-2">
                  {market.wins}-{market.losses}-{market.pushes}
                </td>
                <td className="p-2">{pct(market.roi)}</td>
                <td className="p-2">
                  {pct(market.roi95Low)} to {pct(market.roi95High)}
                </td>
                <td className="p-2">
                  {market.modelBrier.toFixed(3)} / {market.marketBrier.toFixed(3)} /{' '}
                  {market.decisionBrier.toFixed(3)}
                </td>
                <td className="p-2">{market.decisionLogLoss.toFixed(3)}</td>
                <td className="p-2">
                  {market.clvCount ? pct(market.meanClv) : '—'} ({market.clvCount})
                </td>
              </tr>
            ))}
            {!report.markets.length && (
              <tr>
                <td colSpan={9} className="p-3 text-zinc-500">
                  There are no graded recommendations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-zinc-500">
          Lower Brier and log-loss scores are better. The ROI range is an approximate per-pick
          interval, not a guarantee; pushes are excluded from probability scores. Market probability
          is the stored no-vig comparison at recommendation time.
        </p>
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-3 text-sm font-bold text-white">Recommendations vs. filtered candidates</h2>
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="p-2">Model</th>
              <th className="p-2">Market</th>
              <th className="p-2">Recommended</th>
              <th className="p-2">Passed</th>
              <th className="p-2">Recommended wins</th>
              <th className="p-2">Passed wins</th>
              <th className="p-2">Brier · recommended / passed</th>
            </tr>
          </thead>
          <tbody>
            {report.candidateValidation.map((market) => (
              <tr
                key={`${market.modelVersion}-${market.market}`}
                className="border-t border-[var(--color-border)] text-zinc-300"
              >
                <td className="p-2">{market.modelVersion}</td>
                <td className="p-2 font-semibold text-white">{market.market}</td>
                <td className="p-2">{market.recommended}</td>
                <td className="p-2">{market.passed}</td>
                <td className="p-2">{market.recommendedWins}</td>
                <td className="p-2">{market.passedWins}</td>
                <td className="p-2">
                  {market.recommendedBrier.toFixed(3)} / {market.passedBrier.toFixed(3)}
                </td>
              </tr>
            ))}
            {!report.candidateValidation.length && (
              <tr>
                <td colSpan={7} className="p-3 text-zinc-500">
                  Candidate comparisons will appear after scheduled live captures and grading.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-zinc-500">
          Passed picks are counterfactual candidates, not bets: they are useful for testing selection
          filters, but should not be counted in bankroll ROI.
        </p>
      </section>
    </div>
  );
}

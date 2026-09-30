import { fmtKick } from '@/lib/format';
import { formatOdds } from '@/lib/odds';
import type { FlatPick } from './AllPicks';

/**
 * Print-only document (hidden on screen). Groups every pick by game in kickoff
 * order, highest confidence first, in a clean paper layout for PDF export.
 */
export default function PrintPicks({
  picks,
  week,
  season,
  provider,
}: {
  picks: FlatPick[];
  week: number;
  season: number;
  provider: string;
}) {
  const gamePicks = picks.filter((p) => p.group !== 'Futures');
  const futures = picks.filter((p) => p.group === 'Futures');

  const byGame = new Map<string, FlatPick[]>();
  for (const p of gamePicks) {
    const list = byGame.get(p.matchup) ?? [];
    list.push(p);
    byGame.set(p.matchup, list);
  }

  const games = [...byGame.entries()]
    .map(([matchup, list]) => ({
      matchup,
      kickoff: list.find((p) => p.kickoff)?.kickoff,
      picks: [...list].sort((a, b) => b.confidence - a.confidence),
    }))
    .sort((a, b) => {
      if (a.kickoff && b.kickoff)
        return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
      return a.matchup.localeCompare(b.matchup);
    });

  const totalUnits = picks.reduce((s, p) => s + p.units, 0);
  const avgConf = picks.length
    ? Math.round(picks.reduce((s, p) => s + p.confidence, 0) / picks.length)
    : 0;

  const edgeCell = (edge: number) => (edge > 0 ? `+${(edge * 100).toFixed(1)}%` : '—');

  return (
    <div className="print-doc">
      <header className="print-head">
        <div>
          <div className="print-brand">LOCKYLINES</div>
          <h1>
            All Picks · Week {week} · {season}
          </h1>
          <p>Every value bet the model likes — grouped by game, highest confidence first.</p>
        </div>
        <div className="print-meta">
          NFL Betting Hub · {season}
          <br />
          Odds source: {provider}
        </div>
      </header>

      <section className="print-summary">
        <div>
          <span>Games</span>
          <strong>{games.length}</strong>
        </div>
        <div>
          <span>Total Picks</span>
          <strong>{picks.length}</strong>
        </div>
        <div>
          <span>Total Units</span>
          <strong>{totalUnits.toFixed(2)}u</strong>
        </div>
        <div>
          <span>Avg Confidence</span>
          <strong>{avgConf}%</strong>
        </div>
      </section>

      {games.map((g) => (
        <section key={g.matchup} className="print-game">
          <div className="print-game-head">
            <span className="print-game-title">{g.matchup}</span>
            {g.kickoff && <span className="print-game-time">{fmtKick(g.kickoff)}</span>}
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th className="c-type">Type</th>
                <th className="c-sel">Selection</th>
                <th className="c-num">Conf</th>
                <th className="c-num">Edge</th>
                <th className="c-odds">Odds</th>
                <th className="c-num">Units</th>
              </tr>
            </thead>
            <tbody>
              {g.picks.map((p) => (
                <tr key={p.id}>
                  <td className="c-type">{p.group}</td>
                  <td className="c-sel">{p.selection}</td>
                  <td className="c-num">{p.confidence}%</td>
                  <td className="c-num c-edge">{edgeCell(p.edge)}</td>
                  <td className="c-odds">
                    {formatOdds(p.price)} · {p.book}
                  </td>
                  <td className="c-num">{p.units.toFixed(2)}u</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {futures.length > 0 && (
        <section className="print-game">
          <div className="print-game-head">
            <span className="print-game-title">Futures &amp; Awards</span>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th className="c-type">Market</th>
                <th className="c-sel">Selection</th>
                <th className="c-num">Conf</th>
                <th className="c-num">Edge</th>
                <th className="c-odds">Odds</th>
                <th className="c-num">Units</th>
              </tr>
            </thead>
            <tbody>
              {futures.map((p) => (
                <tr key={p.id}>
                  <td className="c-type">{p.matchup}</td>
                  <td className="c-sel">
                    {p.selection}
                    {p.ken ? ' · Ken' : ''}
                  </td>
                  <td className="c-num">{p.confidence}%</td>
                  <td className="c-num c-edge">{edgeCell(p.edge)}</td>
                  <td className="c-odds">
                    {formatOdds(p.price)} · {p.book}
                  </td>
                  <td className="c-num">{p.units.toFixed(2)}u</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="print-foot">
        Built on Ken Barkley&rsquo;s {season} NFL betting models · For entertainment purposes · Bet
        responsibly
      </footer>
    </div>
  );
}

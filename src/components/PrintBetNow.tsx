import { fmtKick } from '@/lib/format';
import { formatOdds } from '@/lib/odds';
import UnitAmount from './UnitAmount';
import type { BetNowRow } from './BetNowBoard';

/**
 * Print-only Bet Now document (hidden on screen). Lists ONLY the actionable
 * value bets — grouped by game, ordered by kickoff — with edge, price and the
 * conviction stake, so the day's card can be reviewed/carried on paper.
 */
export default function PrintBetNow({
  rows,
  week,
  season,
  placed = {},
}: {
  rows: BetNowRow[];
  week: number;
  season: number;
  /** Units already placed per row key (server-side bankroll store). */
  placed?: Record<string, number>;
}) {
  const gameMap = new Map<
    string,
    { matchup: string; day: string; kickoff: string; rows: BetNowRow[] }
  >();
  for (const r of rows) {
    if (!gameMap.has(r.matchup)) {
      gameMap.set(r.matchup, { matchup: r.matchup, day: r.day ?? '', kickoff: r.kickoff, rows: [] });
    }
    gameMap.get(r.matchup)!.rows.push(r);
  }
  const games = [...gameMap.values()]
    .map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => b.edge - a.edge) }))
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  const totalUnits = rows.reduce((s, r) => s + r.stakeUnits, 0);
  const onPickOf = (r: BetNowRow) => placed[r.key] ?? 0;
  const restakeOf = (r: BetNowRow) => Math.round(Math.max(0, r.stakeUnits - onPickOf(r)) * 10) / 10;
  const placedCount = rows.filter((r) => onPickOf(r) > 0).length;
  const toPlaceUnits = rows.reduce((s, r) => s + restakeOf(r), 0);
  const edgeCell = (edge: number) => (edge > 0 ? `+${(edge * 100).toFixed(1)}%` : '—');
  const selOf = (r: BetNowRow) => r.description.replace(` (${r.matchup})`, '');

  return (
    <div className="print-doc">
      <header className="print-head">
        <div>
          <div className="print-brand">LOCKYLINES</div>
          <h1>
            Bet Now · Week {week} · {season}
          </h1>
          <p>Only actionable value bets (≥2% edge) with conviction stakes — grab the numbers before they move.</p>
        </div>
        <div className="print-meta">
          NFL Betting Hub · {season}
          <br />
          Unit size: <UnitAmount units={1} className="mono" />
        </div>
      </header>

      <section className="print-summary">
        <div>
          <span>Value Bets</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Already Placed</span>
          <strong>{placedCount}</strong>
        </div>
        <div>
          <span>To Place</span>
          <strong>{toPlaceUnits.toFixed(1)}u</strong>
        </div>
        <div>
          <span>Total Target</span>
          <strong>{totalUnits.toFixed(1)}u</strong>
        </div>
      </section>

      {games.map((g) => (
        <section key={g.matchup} className="print-game">
          <div className="print-game-head">
            <span className="print-game-title">{g.matchup}</span>
            <span className="print-game-time">
              {g.day}
              {g.kickoff ? ` · ${fmtKick(g.kickoff)}` : ''}
            </span>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th className="c-type">Type</th>
                <th className="c-sel">Selection</th>
                <th className="c-num">Conf</th>
                <th className="c-num">Value</th>
                <th className="c-odds">Odds</th>
                <th className="c-num">Target</th>
                <th className="c-num">Have</th>
                <th className="c-num">Place now</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => {
                const onPick = onPickOf(r);
                const restake = restakeOf(r);
                return (
                  <tr key={`${r.key}-${i}`}>
                    <td className="c-type">{r.pickType}</td>
                    <td className="c-sel">{selOf(r)}</td>
                    <td className="c-num">{r.confidence ? `${r.confidence}%` : '—'}</td>
                    <td className="c-num c-edge">{r.disconnect ? r.disconnect.label : edgeCell(r.edge)}</td>
                    <td className="c-odds">{formatOdds(r.price)}</td>
                    <td className="c-num">{r.stakeUnits > 0 ? `${r.stakeUnits.toFixed(2)}u` : '—'}</td>
                    <td className="c-num">{onPick > 0 ? `${onPick.toFixed(2)}u` : '—'}</td>
                    <td className="c-num">
                      {restake >= 0.5 ? (
                        <>
                          {restake.toFixed(2)}u · <UnitAmount units={restake} className="mono" />
                        </>
                      ) : onPick > 0 ? (
                        '✓ placed'
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <footer className="print-foot">
        Built on Ken Barkley&rsquo;s {season} NFL betting models · For entertainment purposes · Bet
        responsibly
      </footer>
    </div>
  );
}

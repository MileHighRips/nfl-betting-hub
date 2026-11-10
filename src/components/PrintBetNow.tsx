import { fmtKick } from '@/lib/format';
import { formatOdds } from '@/lib/odds';
import { reviewMatchesSnapshot } from '@/lib/handicap-review-schema';
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
      gameMap.set(r.matchup, {
        matchup: r.matchup,
        day: r.day ?? '',
        kickoff: r.kickoff,
        rows: [],
      });
    }
    gameMap.get(r.matchup)!.rows.push(r);
  }
  const games = [...gameMap.values()]
    .map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => b.edge - a.edge) }))
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  const totalDollars = rows.reduce((s, r) => s + (r.betDollars ?? 0), 0);
  const totalNetEv = rows.reduce((s, r) => s + (r.netEv ?? 0), 0);
  const onPickOf = (r: BetNowRow) => placed[r.key] ?? 0;
  const placedCount = rows.filter((r) => onPickOf(r) > 0).length;
  const edgeCell = (edge: number) => (edge > 0 ? `+${(edge * 100).toFixed(1)}%` : '—');
  const selOf = (r: BetNowRow) => r.description.replace(` (${r.matchup})`, '');
  const reviewStatus = (r: BetNowRow) => {
    if (r.locked) return 'Frozen';
    const current = reviewMatchesSnapshot(r.review, {
      key: r.key,
      gameId: r.gameId,
      selection: r.description,
      pickType: r.pickType,
      book: r.book,
      line: r.line,
      price: r.price,
      modelProb: r.modelProb,
      marketProb: r.marketProb,
      confidence: r.confidence,
      edge: r.edge,
      evPercent: r.evPercent,
      valuePercent: r.valuePercent,
      betDollars: r.betDollars,
      netEv: r.netEv,
    });
    if (!current) return 'Review required';
    return r.review?.decision === 'approve' ? 'Approved' : 'Passed';
  };

  return (
    <div className="print-doc">
      <header className="print-head">
        <div>
          <div className="print-brand">LOCKYLINES</div>
          <h1>
            Bet Now · Week {week} · {season}
          </h1>
          <p>
            Bet Now candidates with positive model-estimated value at listed odds. No separate
            transaction fee is assumed; historical returns do not establish a future edge.
          </p>
        </div>
        <div className="print-meta">
          NFL Betting Hub · {season}
          <br />
          $5 maximum suggested stake per pick
        </div>
      </header>

      <section className="print-summary">
        <div>
          <span>Best Bets</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Already Placed</span>
          <strong>{placedCount}</strong>
        </div>
        <div>
          <span>To Risk</span>
          <strong>${totalDollars.toFixed(0)}</strong>
        </div>
        <div>
          <span>Model EV (no fee assumed)</span>
          <strong>+${totalNetEv.toFixed(0)}</strong>
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
                <th className="c-num">Bet</th>
                <th className="c-num">Net EV</th>
                <th className="c-num">Review</th>
                <th className="c-num">Have</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => {
                const onPick = onPickOf(r);
                return (
                  <tr key={`${r.key}-${i}`}>
                    <td className="c-type">{r.pickType}</td>
                    <td className="c-sel">{selOf(r)}</td>
                    <td className="c-num">{r.confidence ? `${r.confidence}%` : '—'}</td>
                    <td className="c-num c-edge">
                      {r.disconnect ? r.disconnect.label : edgeCell(r.edge)}
                    </td>
                    <td className="c-odds">{formatOdds(r.price)}</td>
                    <td className="c-num">{r.betDollars ? `$${r.betDollars.toFixed(0)}` : '—'}</td>
                    <td className="c-num c-edge">
                      {r.netEv != null ? `+$${r.netEv.toFixed(2)}` : '—'}
                    </td>
                    <td className="c-num">{reviewStatus(r)}</td>
                    <td className="c-num">{onPick > 0 ? `${onPick.toFixed(2)}u` : '—'}</td>
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

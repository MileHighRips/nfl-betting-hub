import { fmtKick } from '@/lib/format';
import { formatOdds } from '@/lib/odds';
import { TEAMS } from '@/lib/teams';
import UnitAmount from './UnitAmount';
import { sgpForGame, type ParlaySuggestion } from '@/lib/parlays';
import type { GameAnalysis } from '@/lib/model';

interface Row {
  type: string;
  selection: string;
  confidence: number;
  edge: number;
  price: number;
  book: string;
  units: number;
}

// The slate stakes by conviction; legacy locks with no trueUnits keep flat.
const stake = (p: { units: number; trueUnits?: number }) => p.trueUnits ?? p.units;

function fromPick(type: string, p: GameAnalysis['spread']): Row {
  return {
    type,
    selection: p.selection,
    confidence: p.confidence,
    edge: p.edge,
    price: p.price,
    book: p.book,
    units: stake(p),
  };
}

function rowsFor(a: GameAnalysis): Row[] {
  const rows: Row[] = [
    fromPick('Spread', a.spread),
    fromPick('Total', a.total),
    fromPick('Moneyline', a.moneyline),
  ];
  if (a.upset) rows.push(fromPick('Upset', a.upset));
  for (const { pick, detail } of a.props) {
    rows.push({
      type: 'Prop',
      selection: `${detail.player} ${detail.side} ${detail.line} ${detail.market}`,
      confidence: detail.confidence,
      edge: pick.edge,
      price: detail.price,
      book: detail.book,
      units: stake(pick),
    });
  }
  for (const td of a.anytimeTds) {
    rows.push({
      type: 'Anytime TD',
      selection: `${td.player} Anytime TD`,
      confidence: Math.round(td.prob * 100),
      edge: td.edge,
      price: td.price,
      book: td.book,
      units: stake(td),
    });
  }
  return rows;
}

function ParlayBlock({ p, label }: { p: ParlaySuggestion; label: string }) {
  return (
    <div className="print-parlay">
      <div className="print-parlay-head">
        {label} · {formatOdds(p.americanOdds)} · +{(p.ev * 100).toFixed(0)}% EV · {p.units.toFixed(2)}
        u (<UnitAmount units={p.units} className="mono" />)
        {p.estimate ? ' · est., verify at book' : ''}
      </div>
      {p.legs.map((l, i) => (
        <div key={i} className="print-parlay-leg">
          {l.selection} · {l.matchup} · {formatOdds(l.price)}
        </div>
      ))}
    </div>
  );
}

/**
 * Print-only full-slate document (hidden on screen). Unlike the picks export,
 * this lists EVERY model pick per game — including no-value plays — so the whole
 * board can be reviewed on paper.
 */
export default function PrintSlate({
  analyses,
  week,
  season,
  provider,
  parlays,
}: {
  analyses: GameAnalysis[];
  week: number;
  season: number;
  provider: string;
  parlays: ParlaySuggestion[];
}) {
  const games = [...analyses]
    .sort((a, b) => new Date(a.game.kickoff).getTime() - new Date(b.game.kickoff).getTime())
    .map((a) => ({
      matchup: `${TEAMS[a.game.away].abbr} @ ${TEAMS[a.game.home].abbr}`,
      kickoff: a.game.kickoff,
      rows: rowsFor(a),
      sgp: week >= 3 ? sgpForGame(a) : undefined,
    }));

  const bets = games.reduce((s, g) => s + g.rows.filter((r) => r.units > 0).length, 0);
  const sgpCount = games.filter((g) => g.sgp).length;
  const edgeCell = (edge: number) => (edge > 0 ? `+${(edge * 100).toFixed(1)}%` : '—');

  return (
    <div className="print-doc">
      <header className="print-head">
        <div>
          <div className="print-brand">LOCKYLINES</div>
          <h1>
            Full Slate · Week {week} · {season}
          </h1>
          <p>Every model pick with its conviction stake — plus value parlays &amp; same-game parlays.</p>
        </div>
        <div className="print-meta">
          NFL Betting Hub · {season}
          <br />
          Odds source: {provider}
          <br />
          Unit size: <UnitAmount units={1} className="mono" />
        </div>
      </header>

      <section className="print-summary">
        <div>
          <span>Games</span>
          <strong>{games.length}</strong>
        </div>
        <div>
          <span>Value Bets</span>
          <strong>{bets}</strong>
        </div>
        <div>
          <span>Parlays</span>
          <strong>{parlays.length}</strong>
        </div>
        <div>
          <span>Same-Game Parlays</span>
          <strong>{sgpCount}</strong>
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
                <th className="c-num">To Bet</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={`${r.type}-${i}`}>
                  <td className="c-type">{r.type}</td>
                  <td className="c-sel">{r.selection}</td>
                  <td className="c-num">{r.confidence}%</td>
                  <td className="c-num c-edge">{edgeCell(r.edge)}</td>
                  <td className="c-odds">
                    {formatOdds(r.price)} · {r.book}
                  </td>
                  <td className="c-num">{r.units > 0 ? `${r.units.toFixed(2)}u` : '—'}</td>
                  <td className="c-num">
                    {r.units > 0 ? <UnitAmount units={r.units} className="mono" /> : 'No bet'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {g.sgp && <ParlayBlock p={g.sgp} label="Same-Game Parlay" />}
        </section>
      ))}

      {parlays.length > 0 && (
        <section className="print-game">
          <div className="print-game-head">
            <span className="print-game-title">Value Parlays</span>
          </div>
          {parlays.map((p) => (
            <ParlayBlock key={p.id} p={p} label={`${p.legs.length}-Leg Parlay`} />
          ))}
        </section>
      )}

      <footer className="print-foot">
        Built on Ken Barkley&rsquo;s {season} NFL betting models · For entertainment purposes · Bet
        responsibly
      </footer>
    </div>
  );
}

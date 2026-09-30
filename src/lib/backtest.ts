import { fetchEspnWeek, fetchEspnResults } from './espn';
import { getFormRatings } from './form';
import { analyzeGame } from './model';
import { americanToProfit } from './odds';
import { getCurrentWeek, SEASON } from './schedule';
import type { GameAnalysis } from './model';
import type { ModelPick } from './types';

/**
 * Walk-forward backtest. For each completed week it rebuilds the power ratings
 * from ONLY the prior weeks (no look-ahead), runs the model at that week's
 * closing lines, and grades spread / total / moneyline against the final score.
 * This is the model's scoreboard — it turns "I think this is sharper" into
 * measured record, ROI, and calibration (predicted win% vs. realized), which is
 * what we tune every other constant against. Read-only; never touches locks.
 */

export interface CalBucket {
  lo: number;
  hi: number;
  n: number;
  wins: number;
  realized: number; // wins / decided
  predicted: number; // mean model prob in bucket
}

export interface MarketStats {
  market: string;
  picks: number; // favored picks graded
  bettable: number; // subset the model would stake (units > 0)
  wins: number;
  losses: number;
  pushes: number;
  units: number; // flat-1u profit over the bettable subset
  roi: number; // units / bettable
  hitRate: number; // wins / (wins+losses) over bettable
  meanModelProb: number; // avg predicted prob (bettable)
  realizedProb: number; // realized win rate (bettable, decided)
  calibration: CalBucket[];
}

export interface BacktestReport {
  season: number;
  weeks: number[];
  markets: MarketStats[];
  softTotal: { n: number; wins: number; losses: number; units: number; roi: number; hitRate: number };
  skippedNoLine: number;
  note?: string;
  generatedAt: string;
}

type Outcome = 'win' | 'loss' | 'push';

function gradeSpread(pick: ModelPick, home: number, away: number): Outcome {
  const margin = pick.side === 'home_spread' ? home - away : away - home;
  const r = margin + pick.line;
  return r > 0 ? 'win' : r < 0 ? 'loss' : 'push';
}

function gradeTotal(pick: ModelPick, home: number, away: number): Outcome {
  const total = home + away;
  const r = pick.side === 'over' ? total - pick.line : pick.line - total;
  return r > 0 ? 'win' : r < 0 ? 'loss' : 'push';
}

function gradeMoneyline(pick: ModelPick, home: number, away: number): Outcome {
  if (home === away) return 'push';
  const homeWon = home > away;
  const tookHome = pick.side === 'home_ml';
  return tookHome === homeWon ? 'win' : 'loss';
}

const BUCKETS: [number, number][] = [
  [0.5, 0.55],
  [0.55, 0.6],
  [0.6, 0.65],
  [0.65, 0.7],
  [0.7, 1.01],
];

function emptyStats(market: string): MarketStats & { _probSum: number; _decided: number } {
  return {
    market,
    picks: 0,
    bettable: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    units: 0,
    roi: 0,
    hitRate: 0,
    meanModelProb: 0,
    realizedProb: 0,
    calibration: BUCKETS.map(([lo, hi]) => ({ lo, hi, n: 0, wins: 0, realized: 0, predicted: 0 })),
    _probSum: 0,
    _decided: 0,
  };
}

function record(s: ReturnType<typeof emptyStats>, pick: ModelPick, outcome: Outcome) {
  s.picks += 1;
  // Calibration uses every favored pick (staked or not).
  const bucket = s.calibration.find((b) => pick.modelProb >= b.lo && pick.modelProb < b.hi);
  if (bucket) {
    bucket.n += 1;
    bucket.predicted += pick.modelProb;
    if (outcome !== 'push') bucket.wins += outcome === 'win' ? 1 : 0;
  }
  if (pick.units <= 0) return; // ROI only on what the model would actually bet
  s.bettable += 1;
  s._probSum += pick.modelProb;
  if (outcome === 'push') {
    s.pushes += 1;
    return;
  }
  s._decided += 1;
  if (outcome === 'win') {
    s.wins += 1;
    s.units += americanToProfit(pick.price);
  } else {
    s.losses += 1;
    s.units -= 1;
  }
}

export async function runBacktest(season = SEASON): Promise<BacktestReport> {
  const current = getCurrentWeek();
  const weeks: number[] = [];
  const spread = emptyStats('Spread');
  const total = emptyStats('Total');
  const moneyline = emptyStats('Moneyline');
  const soft = { n: 0, wins: 0, losses: 0, units: 0 };
  let skippedNoLine = 0;

  for (let w = 1; w <= current; w++) {
    const [games, results, ratings] = await Promise.all([
      fetchEspnWeek(w, season).catch(() => []),
      fetchEspnResults(w, season).catch(() => []),
      getFormRatings(w, season),
    ]);
    if (!results.length) continue;
    const byKey = new Map(results.map((r) => [`${r.away}-${r.home}`, r]));
    let graded = 0;
    for (const game of games) {
      const res = byKey.get(`${game.away}-${game.home}`);
      if (!res) continue;
      // ESPN drops the odds block once a game completes, so raw past-week games
      // fall back to default lines (spread 0 / total 44.5). Grading against those
      // is meaningless — skip them and report the gap honestly.
      const b = game.books[0];
      if (!b || (b.spread === 0 && b.total === 44.5)) {
        skippedNoLine += 1;
        continue;
      }
      let a: GameAnalysis;
      try {
        a = analyzeGame(game, ratings, { ignoreHistorical: true });
      } catch {
        continue;
      }
      record(spread, a.spread, gradeSpread(a.spread, res.homeScore, res.awayScore));
      const totalOutcome = gradeTotal(a.total, res.homeScore, res.awayScore);
      record(total, a.total, totalOutcome);
      // Forward-test the validated situational-total spots on their own scoreboard.
      if (a.total.situational && totalOutcome !== 'push') {
        soft.n += 1;
        if (totalOutcome === 'win') {
          soft.wins += 1;
          soft.units += americanToProfit(a.total.price);
        } else {
          soft.losses += 1;
          soft.units -= 1;
        }
      }
      record(moneyline, a.moneyline, gradeMoneyline(a.moneyline, res.homeScore, res.awayScore));
      graded += 1;
    }
    if (graded) weeks.push(w);
  }

  const finalize = (s: ReturnType<typeof emptyStats>): MarketStats => {
    const decided = s.wins + s.losses;
    for (const b of s.calibration) {
      b.predicted = b.n ? b.predicted / b.n : 0;
      b.realized = b.n ? b.wins / b.n : 0;
    }
    return {
      market: s.market,
      picks: s.picks,
      bettable: s.bettable,
      wins: s.wins,
      losses: s.losses,
      pushes: s.pushes,
      units: Number(s.units.toFixed(2)),
      roi: s.bettable ? Number((s.units / s.bettable).toFixed(4)) : 0,
      hitRate: decided ? Number((s.wins / decided).toFixed(4)) : 0,
      meanModelProb: s.bettable ? Number((s._probSum / s.bettable).toFixed(4)) : 0,
      realizedProb: s._decided ? Number((s.wins / s._decided).toFixed(4)) : 0,
      calibration: s.calibration,
    };
  };

  return {
    season,
    weeks,
    markets: [finalize(spread), finalize(total), finalize(moneyline)],
    softTotal: {
      n: soft.n,
      wins: soft.wins,
      losses: soft.losses,
      units: Number(soft.units.toFixed(2)),
      roi: soft.n ? Number((soft.units / soft.n).toFixed(4)) : 0,
      hitRate: soft.n ? Number((soft.wins / soft.n).toFixed(4)) : 0,
    },
    skippedNoLine,
    note:
      skippedNoLine > 0
        ? `${skippedNoLine} completed games skipped — ESPN drops odds post-game, so real ` +
          `closing lines are unavailable here. Trust the 15-season nflverse backtest ` +
          `(ml/build_model.py) for line-based validation; use the bet tracker for live results.`
        : undefined,
    generatedAt: new Date().toISOString(),
  };
}

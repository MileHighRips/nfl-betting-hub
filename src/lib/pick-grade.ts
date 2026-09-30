import { fetchEspnResults, type CompletedResult, type PlayerGameStat } from './espn';
import { SEASON } from './schedule';
import { findStat } from './names';
import { memo } from './cache';
import type { GameAnalysis } from './model';

export type PickResult = 'won' | 'lost' | 'push';

export interface GameGrades {
  spread?: PickResult;
  total?: PickResult;
  moneyline?: PickResult;
  prop?: PickResult;
  upset?: PickResult;
  anytimeTd?: PickResult;
  anytimeTdLongshot?: PickResult;
}

function statValue(stat: PlayerGameStat | undefined, market: string): number | undefined {
  if (!stat) return undefined;
  const m = market.toLowerCase();
  if (m.includes('pass')) return stat.passYards;
  if (m.includes('rush')) return stat.rushYards;
  if (m.includes('reception') && !m.includes('yard')) return stat.receptions;
  return stat.receivingYards;
}

function scored(stat: PlayerGameStat | undefined): boolean {
  return ((stat?.rushTD ?? 0) + (stat?.recTD ?? 0)) > 0;
}

/** Grade every model pick for a game against its final result. */
export function gradeAnalysis(a: GameAnalysis, result: CompletedResult): GameGrades {
  const { homeScore, awayScore } = result;
  const g: GameGrades = {};

  const sMargin =
    a.spread.side === 'home_spread'
      ? homeScore - awayScore + a.spread.line
      : awayScore - homeScore + a.spread.line;
  g.spread = sMargin === 0 ? 'push' : sMargin > 0 ? 'won' : 'lost';

  const tMargin = homeScore + awayScore - a.total.line;
  g.total =
    tMargin === 0 ? 'push' : (a.total.side === 'over' ? tMargin > 0 : tMargin < 0) ? 'won' : 'lost';

  if (homeScore === awayScore) g.moneyline = 'push';
  else g.moneyline = (a.moneyline.side === 'home_ml') === homeScore > awayScore ? 'won' : 'lost';

  const stat = findStat(result.playerStats, a.propDetail.player);
  const val = statValue(stat, a.propDetail.market);
  if (val != null) {
    const margin = val - a.propDetail.line;
    g.prop =
      margin === 0 ? 'push' : (a.propDetail.side === 'Over' ? margin > 0 : margin < 0) ? 'won' : 'lost';
  }

  if (a.upset) {
    if (homeScore === awayScore) g.upset = 'push';
    else g.upset = (a.upset.side === 'home_ml') === homeScore > awayScore ? 'won' : 'lost';
  }

  if (a.anytimeTd) {
    const st = findStat(result.playerStats, a.anytimeTd.player);
    if (st) g.anytimeTd = scored(st) ? 'won' : 'lost';
    else if (result.playerStats.length > 0) g.anytimeTd = 'lost'; // no offensive touches — no TD
  }
  if (a.anytimeTdLongshot) {
    const st = findStat(result.playerStats, a.anytimeTdLongshot.player);
    if (st) g.anytimeTdLongshot = scored(st) ? 'won' : 'lost';
    else if (result.playerStats.length > 0) g.anytimeTdLongshot = 'lost';
  }

  return g;
}

/** Completed results for a week keyed by our game id. */
export function getResultsByGameId(week: number): Promise<Record<string, CompletedResult>> {
  return memo(`results-${week}`, 60_000, () => computeResultsByGameId(week));
}

async function computeResultsByGameId(
  week: number,
): Promise<Record<string, CompletedResult>> {
  const results = await fetchEspnResults(week).catch(() => []);
  const out: Record<string, CompletedResult> = {};
  for (const r of results) {
    out[`${SEASON}-w${week}-${r.away}-${r.home}`.toLowerCase()] = r;
  }
  return out;
}

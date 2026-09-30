import { TEAMS } from './teams';
import { FUTURES } from '@/data/futures';
import { MODEL_WEIGHT, type GameAnalysis } from './model';
import { sharpUnits } from './odds';
import { getGames } from './odds-source';
import { getFormRatings } from './form';
import { analyzeGamesWithLocks } from './pick-locks';
import { getResultsByGameId, gradeAnalysis, type GameGrades } from './pick-grade';
import { captureClosingLines, getClosingLines, clvForPick, type CloseLines } from './clv';
import type { ModelPick } from './types';
import type { FlatPick, PickGroup } from '@/components/AllPicks';

/** Blend model conviction with the vig-free market price, matching the model layer. */
const blend = (modelProb: number, marketProb: number) =>
  MODEL_WEIGHT * modelProb + (1 - MODEL_WEIGHT) * marketProb;

/**
 * Flatten every model + Ken pick for a week into the shared {@link FlatPick}
 * shape. `units` is the constrained house stake (flat-1u from Week 2, props
 * shrunk to market); `trueUnits` is the model's real conviction sizing with no
 * artificial cap — the two let the True Units page compare sizing strategies.
 */
export function buildFlatPicks(
  analyses: GameAnalysis[],
  gradesById: Record<string, GameGrades | undefined>,
  week: number,
  closeLines: CloseLines = {},
): FlatPick[] {
  const picks: FlatPick[] = [];

  const push = (
    a: GameAnalysis,
    pick: ModelPick,
    group: PickGroup,
    result?: FlatPick['result'],
  ) => {
    if (pick.units <= 0) return;
    const matchup = `${TEAMS[a.game.away].abbr} @ ${TEAMS[a.game.home].abbr}`;
    picks.push({
      id: `${a.game.id}-${group}`,
      group,
      matchup,
      kickoff: a.game.kickoff,
      gameId: a.game.id,
      pickType: pick.type,
      side: pick.side,
      line: pick.line,
      player: pick.type === 'Prop' ? a.propDetail.player : undefined,
      propMarket: pick.type === 'Prop' ? a.propDetail.market : undefined,
      selection: pick.selection,
      confidence: pick.confidence,
      edge: pick.edge,
      price: pick.price,
      book: pick.book,
      units: Number(pick.units.toFixed(2)),
      trueUnits: sharpUnits(blend(pick.modelProb, pick.marketProb), pick.price),
      week,
      clv: clvForPick(closeLines[a.game.id], group, pick.side, pick.marketProb),
      description: `${pick.selection} (${matchup})`,
      market: `Week ${week} · ${pick.type}`,
      result,
    });
  };

  for (const a of analyses) {
    const g = gradesById[a.game.id];
    push(a, a.spread, 'Spread', g?.spread);
    push(a, a.total, 'Total', g?.total);
    push(a, a.moneyline, 'Moneyline', g?.moneyline);
    // Always surface the best player prop so every game is represented.
    {
      const matchup = `${TEAMS[a.game.away].abbr} @ ${TEAMS[a.game.home].abbr}`;
      picks.push({
        id: `${a.game.id}-Prop`,
        group: 'Prop',
        matchup,
        kickoff: a.game.kickoff,
        gameId: a.game.id,
        pickType: a.prop.type,
        side: a.propDetail.side.toLowerCase(),
        line: a.prop.line,
        player: a.propDetail.player,
        propMarket: a.propDetail.market,
        selection: a.prop.selection,
        confidence: a.prop.confidence,
        edge: a.prop.edge,
        price: a.prop.price,
        book: a.prop.book,
        units: Number(a.prop.units.toFixed(2)),
        trueUnits: sharpUnits(blend(a.prop.modelProb, a.prop.marketProb), a.prop.price),
        week,
        description: `${a.prop.selection} (${matchup})`,
        market: `Week ${week} · Prop`,
        result: g?.prop,
      });
    }
    if (a.upset) push(a, a.upset, 'Upset', g?.upset);
    // One anytime-TD scorer per game — only when the model actually likes it.
    if (a.anytimeTd && a.anytimeTd.units > 0) {
      const matchup = `${TEAMS[a.game.away].abbr} @ ${TEAMS[a.game.home].abbr}`;
      const td = a.anytimeTd;
      picks.push({
        id: `${a.game.id}-ATD`,
        group: 'Anytime TD',
        matchup,
        kickoff: a.game.kickoff,
        selection: `${td.player} Anytime TD`,
        confidence: Math.round(td.prob * 100),
        edge: td.edge,
        price: td.price,
        book: 'DraftKings',
        units: Number(td.units.toFixed(2)),
        trueUnits: sharpUnits(td.prob, td.price),
        week,
        description: `${td.player} Anytime TD (${matchup})`,
        market: `Week ${week} · Anytime TD`,
        result: g?.anytimeTd,
      });
    }
    // A bigger-payout longshot TD when the model finds value further down the board.
    if (a.anytimeTdLongshot && a.anytimeTdLongshot.units > 0) {
      const matchup = `${TEAMS[a.game.away].abbr} @ ${TEAMS[a.game.home].abbr}`;
      const ls = a.anytimeTdLongshot;
      picks.push({
        id: `${a.game.id}-ATD-LS`,
        group: 'Anytime TD',
        matchup,
        kickoff: a.game.kickoff,
        selection: `${ls.player} Anytime TD (longshot)`,
        confidence: Math.round(ls.prob * 100),
        edge: ls.edge,
        price: ls.price,
        book: ls.book,
        units: Number(ls.units.toFixed(2)),
        trueUnits: sharpUnits(ls.prob, ls.price),
        week,
        description: `${ls.player} Anytime TD — longshot (${matchup})`,
        market: `Week ${week} · Anytime TD`,
        result: g?.anytimeTdLongshot,
      });
    }
  }

  // Ken's actual futures bets + any positive-edge futures.
  for (const f of FUTURES) {
    if (!f.kenPick && f.edge <= 0) continue;
    picks.push({
      id: `fut-${f.id}`,
      group: 'Futures',
      matchup: f.market,
      selection: f.selection,
      confidence: f.confidence,
      edge: f.edge,
      price: f.price,
      book: f.book === 'Consensus' || f.book === 'Kalshi' ? 'DraftKings' : f.book,
      units: Number((f.units || 0.5).toFixed(2)),
      trueUnits: sharpUnits(blend(f.modelProb, f.marketProb), f.price),
      description: `${f.selection} — ${f.market}`,
      market: `Futures · ${f.market}`,
      ken: f.kenPick,
    });
  }

  capCorrelatedStakes(picks);
  return picks;
}

// Spread, moneyline and upset in a game are the SAME side — one game script
// decides them together. Cap their combined conviction stake so a single
// outcome can't over-expose the bankroll. Applies to trueUnits (the real
// staking view); the flat All-Picks record is untouched.
const CORRELATED: ReadonlySet<PickGroup> = new Set(['Spread', 'Moneyline', 'Upset']);
const GAME_DIR_CAP = 2; // max combined true units on one game's directional side

function capCorrelatedStakes(picks: FlatPick[]): void {
  const byGame = new Map<string, FlatPick[]>();
  for (const p of picks) {
    if (!p.gameId || !CORRELATED.has(p.group)) continue;
    const list = byGame.get(p.gameId) ?? [];
    list.push(p);
    byGame.set(p.gameId, list);
  }
  for (const cluster of byGame.values()) {
    const sum = cluster.reduce((s, p) => s + p.trueUnits, 0);
    if (sum > GAME_DIR_CAP) {
      const factor = GAME_DIR_CAP / sum;
      for (const p of cluster) p.trueUnits = Number((p.trueUnits * factor).toFixed(2));
    }
  }
}

export interface WeekPicks {
  picks: FlatPick[];
  provider: string;
  week: number;
}

/** Run the full model pipeline for one week and flatten it to pick rows. */
export async function getWeekPicks(week: number): Promise<WeekPicks> {
  const [{ games, provider }, ratings] = await Promise.all([getGames(week), getFormRatings(week)]);
  await captureClosingLines(games);
  const [analyses, resultsById, closeLines] = await Promise.all([
    analyzeGamesWithLocks(games, ratings),
    getResultsByGameId(week),
    getClosingLines(),
  ]);
  const gradesById: Record<string, GameGrades | undefined> = {};
  for (const a of analyses) {
    const r = resultsById[a.game.id];
    gradesById[a.game.id] = r ? gradeAnalysis(a, r) : undefined;
  }
  return { picks: buildFlatPicks(analyses, gradesById, week, closeLines), provider, week };
}

/**
 * Every week's picks from Week 1 through {@link currentWeek}, concatenated for a
 * lifetime view. Season-long futures repeat across weeks, so they're de-duped by
 * id and kept once.
 */
export async function getLifetimePicks(currentWeek: number): Promise<WeekPicks> {
  const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const results = await Promise.all(weeks.map((w) => getWeekPicks(w)));
  const seen = new Set<string>();
  const picks: FlatPick[] = [];
  for (const r of results) {
    for (const p of r.picks) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      picks.push(p);
    }
  }
  return { picks, provider: results.at(-1)?.provider ?? 'Model', week: currentWeek };
}


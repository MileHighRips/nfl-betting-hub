import type { BetNowRow } from '@/components/BetNowBoard';
import { americanToProb, americanToProfit, noVigProb } from './odds';
import { spreadMovement, totalMovement } from './stale-line';
import { opposingPriceForPick } from './market-quote';
import { sgpForGame } from './parlays';
import { blendPickProbability, type GameAnalysis } from './model';
import { PLACEMENT_FEE_DOLLARS } from './betting-costs';

const UNIT_DOLLARS = 10;
const MIN_BET = 5;
const MAX_BET = 5;
const MIN_EXPECTED_PROFIT = 0;
export const LIVE_MODEL_VERSION = 'bet-now-v4-fee-adjusted';

export interface BetNowCandidate extends BetNowRow {
  decisionProb: number;
  betDollars: number;
  netEv: number;
  evPercent: number;
  valuePercent?: number;
  recommended: boolean;
  decisionReason: string;
  modelVersion: string;
}

function isBlendedMarket(
  market: string,
): market is 'Spread' | 'Moneyline' | 'Total' | 'Prop' | 'Alt Spread' | 'Alt Total' {
  return ['Spread', 'Moneyline', 'Total', 'Prop', 'Alt Spread', 'Alt Total'].includes(market);
}

function marketProbability(row: BetNowRow): number {
  if (row.pickType === 'Prop' && row.opposingPrice != null)
    return noVigProb(row.price, row.opposingPrice);
  return row.marketProb ?? americanToProb(row.price);
}

function decisionProbability(row: BetNowRow, marketProb: number): number {
  let probability =
    row.modelProb == null
      ? marketProb
      : isBlendedMarket(row.pickType)
        ? blendPickProbability(row.pickType, row.modelProb, marketProb)
        : row.modelProb;
  if (row.price >= 200) probability = Math.min(probability, americanToProb(row.price) * 1.25);
  return probability;
}

function evPerDollar(row: BetNowRow, marketProb: number): number {
  if (row.pickType === 'SGP') return row.edge;
  const probability = decisionProbability(row, marketProb);
  return probability * americanToProfit(row.price) - (1 - probability);
}

function sizeCandidate(row: BetNowRow, marketProb: number): { betDollars: number; netEv: number } {
  if (row.stakeUnits <= 0) return { betDollars: 0, netEv: 0 };
  const betDollars = Math.min(
    MAX_BET,
    Math.max(MIN_BET, Math.round(row.stakeUnits * UNIT_DOLLARS)),
  );
  return {
    betDollars,
    netEv: betDollars * evPerDollar(row, marketProb) - PLACEMENT_FEE_DOLLARS,
  };
}

function convictionReason(row: BetNowRow, netEv: number): string | undefined {
  if (row.pickType === 'Spread' || row.pickType === 'Moneyline' || row.pickType === 'Total') return;
  if (row.pickType === 'Alt Spread' || row.pickType === 'Alt Total') return;
  if (row.pickType !== 'Prop') return 'Market is not eligible for the Bet Now card.';
  if (row.price >= 250) return 'Longshot prop excluded to limit high-variance picks.';
  if (
    /under (0\.5|1\.5) receptions/i.test(row.description) ||
    /under 0\.5 pass tds/i.test(row.description)
  )
    return 'Degenerate low-line prop excluded.';
  return netEv > MIN_EXPECTED_PROFIT
    ? undefined
    : 'Prop does not have positive model-estimated value at the listed price.';
}

function marketGroup(pickType: string): string | undefined {
  if (pickType === 'Spread' || pickType === 'Moneyline' || pickType === 'Alt Spread') return 'side';
  if (pickType === 'Total' || pickType === 'Alt Total') return 'total';
  if (pickType === 'Prop') return 'prop';
  return undefined;
}

function collectRows(analysis: GameAnalysis, week: number): BetNowRow[] {
  const matchup = `${analysis.game.away} @ ${analysis.game.home}`;
  const kickoff = analysis.game.kickoff;
  const rows: BetNowRow[] = [];
  const stakeOf = (pick: { units: number; trueUnits?: number }) =>
    Number((pick.trueUnits ?? pick.units).toFixed(2));
  const addPick = (
    pickType: string,
    pick: {
      selection: string;
      price: number;
      edge: number;
      confidence: number;
      marketProb?: number;
      modelProb?: number;
      book?: BetNowRow['book'];
      units: number;
      trueUnits?: number;
      gameId?: string;
      side?: string;
      line?: number;
      player?: string;
      propMarket?: string;
      situational?: string;
      disconnect?: BetNowRow['disconnect'];
      note?: string;
      narrative?: boolean;
    },
  ) => {
    rows.push({
      key: `${analysis.game.id}-${pickType}-${pick.selection}`,
      matchup,
      kickoff,
      pickType,
      description: `${pick.selection} (${matchup})`,
      market: `Week ${week} · ${pickType}`,
      price: pick.price,
      stakeUnits: stakeOf(pick),
      edge: pick.edge,
      confidence: pick.confidence,
      marketProb: pick.marketProb,
      opposingPrice: opposingPriceForPick(analysis.game, { ...pick, pickType }),
      modelProb: pick.modelProb,
      book: pick.book,
      gameId: pick.gameId ?? analysis.game.id,
      side: pick.side,
      line: pick.line,
      player: pick.player,
      propMarket: pick.propMarket,
      situational: pick.situational,
      disconnect: pick.disconnect,
      signal: pick.note,
      narrative: pick.narrative,
    });
  };

  const book = analysis.game.books[0];
  addPick('Spread', analysis.spread);
  const spread = rows[rows.length - 1];
  const spreadMove = spreadMovement(
    book,
    analysis.spread.edge,
    analysis.spread.side as 'home_spread' | 'away_spread',
  );
  if (spreadMove) spread.move = spreadMove;
  addPick('Total', analysis.total);
  const total = rows[rows.length - 1];
  const totalMove = totalMovement(
    book,
    analysis.total.edge,
    analysis.total.side as 'over' | 'under',
  );
  if (totalMove) total.move = totalMove;
  addPick('Moneyline', analysis.moneyline);

  for (const { pick, detail } of analysis.props) {
    rows.push({
      key: `${analysis.game.id}-prop-${detail.player}-${detail.market}`,
      matchup,
      kickoff,
      pickType: 'Prop',
      description: `${detail.player} ${detail.alt ? `${detail.line}+ ${detail.market}` : `${detail.side} ${detail.line} ${detail.market}`} (${matchup})`,
      market: `Week ${week} · Prop`,
      price: pick.price,
      stakeUnits: stakeOf(pick),
      edge: pick.edge,
      confidence: pick.confidence,
      marketProb: pick.marketProb,
      opposingPrice: opposingPriceForPick(analysis.game, {
        pickType: 'Prop',
        side: detail.side.toLowerCase(),
        book: pick.book,
        price: pick.price,
        line: pick.line,
        player: detail.player,
        propMarket: detail.market,
      }),
      modelProb: pick.modelProb,
      book: pick.book,
      gameId: analysis.game.id,
      side: detail.side.toLowerCase(),
      line: pick.line,
      alternateLine: detail.alt,
      player: detail.player,
      propMarket: detail.market,
      disconnect: pick.disconnect,
      signal: pick.note,
      narrative: pick.narrative,
    });
  }

  for (const td of analysis.anytimeTds) {
    rows.push({
      key: `${analysis.game.id}-atd-${td.player}`,
      matchup,
      kickoff,
      pickType: 'Anytime TD',
      description: `${td.player} Anytime TD (${matchup})`,
      market: `Week ${week} · Anytime TD`,
      price: td.price,
      stakeUnits: stakeOf(td),
      edge: td.edge,
      confidence: Math.round(td.prob * 100),
      modelProb: td.prob,
      book: td.book,
      gameId: analysis.game.id,
      player: td.player,
      disconnect: td.disconnect,
      signal: td.note,
      narrative: td.narrative,
      floorExempt: true,
      longshot: td.price >= 600,
    });
  }
  const longshot = analysis.anytimeTdLongshot;
  if (longshot && !analysis.anytimeTds.some((pick) => pick.player === longshot.player)) {
    rows.push({
      key: `${analysis.game.id}-atd-ls-${longshot.player}`,
      matchup,
      kickoff,
      pickType: 'Anytime TD',
      description: `${longshot.player} Anytime TD (${matchup})`,
      market: `Week ${week} · Anytime TD`,
      price: longshot.price,
      stakeUnits: stakeOf(longshot),
      edge: longshot.edge,
      confidence: Math.round(longshot.prob * 100),
      modelProb: longshot.prob,
      book: longshot.book,
      gameId: analysis.game.id,
      player: longshot.player,
      disconnect: longshot.disconnect,
      signal: longshot.note,
      narrative: longshot.narrative,
      floorExempt: true,
      longshot: true,
    });
  }

  for (const alt of analysis.altPicks ?? []) {
    rows.push({
      key: `${analysis.game.id}-alt-${alt.side}-${alt.line}`,
      matchup,
      kickoff,
      pickType: alt.type,
      description: `${alt.selection} (${matchup})`,
      market: `Week ${week} · ${alt.type}`,
      price: alt.price,
      stakeUnits: stakeOf(alt),
      edge: alt.edge,
      confidence: Math.round(alt.modelProb * 100),
      marketProb: alt.marketProb,
      opposingPrice: opposingPriceForPick(analysis.game, {
        pickType: alt.type,
        side: alt.side,
        book: 'DraftKings',
        price: alt.price,
        line: alt.line,
      }),
      modelProb: alt.modelProb,
      book: 'DraftKings',
      gameId: analysis.game.id,
      side: alt.side,
      line: alt.line,
      situational: alt.reason,
      disconnect: alt.disconnect,
      floorExempt: true,
    });
  }

  const sgp = sgpForGame(analysis);
  if (sgp) {
    rows.push({
      key: `${analysis.game.id}-sgp`,
      matchup,
      kickoff,
      pickType: 'SGP',
      description: `SGP (${matchup}): ${sgp.legs.map((leg) => leg.selection).join(' + ')}`,
      market: `Week ${week} · SGP`,
      price: sgp.americanOdds,
      stakeUnits: Number(sgp.units.toFixed(2)),
      edge: sgp.ev,
      confidence: 0,
      gameId: analysis.game.id,
      floorExempt: true,
    });
  }
  return rows;
}

/** Shared selection logic keeps scheduled prospective captures identical to Bet Now. */
export function buildBetNowCandidates(
  analyses: GameAnalysis[],
  week: number,
): { candidates: BetNowCandidate[]; valued: BetNowCandidate[] } {
  const rows = analyses.flatMap((analysis) => collectRows(analysis, week));
  const evaluated = rows.map((row) => {
    const marketProb = marketProbability(row);
    const decisionProb = decisionProbability(row, marketProb);
    const { betDollars, netEv } = sizeCandidate(row, marketProb);
    const conviction = convictionReason(row, netEv);
    const valuePercent = row.modelProb == null ? undefined : row.modelProb - marketProb;
    return {
      ...row,
      marketProb,
      decisionProb,
      betDollars,
      netEv,
      evPercent:
        betDollars > 0
          ? netEv / betDollars
          : evPerDollar(row, marketProb) - PLACEMENT_FEE_DOLLARS / MIN_BET,
      valuePercent,
      recommended: false,
      decisionReason:
        row.stakeUnits <= 0
          ? 'Model did not assign a positive stake.'
          : netEv <= MIN_EXPECTED_PROFIT
            ? 'Model-estimated expected profit is not positive at the listed price.'
            : (conviction ?? ''),
      modelVersion: LIVE_MODEL_VERSION,
    };
  });
  const eligible = evaluated.filter(
    (candidate) =>
      candidate.stakeUnits > 0 &&
      candidate.netEv > MIN_EXPECTED_PROFIT &&
      marketGroup(candidate.pickType) !== undefined &&
      !convictionReason(candidate, candidate.netEv),
  );
  const eligibleKeys = new Set(eligible.map((candidate) => candidate.key));
  const bestByMarket = new Map<string, BetNowCandidate>();
  for (const candidate of eligible) {
    const group = marketGroup(candidate.pickType)!;
    const groupKey = `${candidate.gameId}|${group}`;
    const current = bestByMarket.get(groupKey);
    if (
      !current ||
      candidate.netEv > current.netEv ||
      (candidate.netEv === current.netEv &&
        (candidate.valuePercent ?? 0) > (current.valuePercent ?? 0))
    )
      bestByMarket.set(groupKey, candidate);
  }
  const selected = new Set([...bestByMarket.values()].map((candidate) => candidate.key));
  const candidates = evaluated.map((candidate) => {
    if (selected.has(candidate.key))
      return {
        ...candidate,
        recommended: true,
        decisionReason: `Selected as the highest model-estimated value in its game's ${marketGroup(candidate.pickType)} market group.`,
      };
    if (eligibleKeys.has(candidate.key) && !candidate.decisionReason) {
      const competing = bestByMarket.get(`${candidate.gameId}|${marketGroup(candidate.pickType)}`);
      return {
        ...candidate,
        decisionReason: competing
          ? `Passed: another ${marketGroup(candidate.pickType)} option in this game ranked higher (${competing.key}).`
          : 'Passed by the market-group selection filters.',
      };
    }
    return candidate;
  });
  const valued = candidates
    .filter((candidate) => candidate.recommended)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  return { candidates, valued };
}

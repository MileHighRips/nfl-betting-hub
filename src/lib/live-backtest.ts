import { americanToProfit } from './odds';
import { clvForBet, getClosingLines } from './clv';
import { playerPropValue } from './player-prop-grade';
import { fetchEspnResults, type CompletedResult } from './espn';
import type { PlacedBet } from './types';
import {
  getLivePickHistory,
  type LivePickSnapshot,
  type StoredLivePick,
} from './live-pick-history';

const UNIT_DOLLARS = 10;

export interface LiveCalibrationBucket {
  lo: number;
  hi: number;
  n: number;
  predicted: number;
  realized: number;
}

export interface LiveMarketStats {
  market: string;
  modelVersion: string;
  picks: number;
  graded: number;
  wins: number;
  losses: number;
  pushes: number;
  stakeUnits: number;
  netUnits: number;
  roi: number;
  hitRate: number;
  meanModelProb: number;
  modelBrier: number;
  marketBrier: number;
  decisionBrier: number;
  decisionLogLoss: number;
  realizedProb: number;
  meanDecisionProb: number;
  roiStdError: number;
  roi95Low: number;
  roi95High: number;
  clvCount: number;
  meanClv: number;
  calibration: LiveCalibrationBucket[];
}

export interface LiveCandidateValidation {
  market: string;
  modelVersion: string;
  gradedCandidates: number;
  recommended: number;
  passed: number;
  recommendedWins: number;
  passedWins: number;
  recommendedBrier: number;
  passedBrier: number;
}

export interface LiveBacktestReport {
  source: 'archived-bet-now-picks';
  season: number;
  gamesObserved: number;
  gamesGraded: number;
  picksGraded: number;
  picksMissingResults: number;
  markets: LiveMarketStats[];
  candidateValidation: LiveCandidateValidation[];
  note?: string;
  generatedAt: string;
}

type Outcome = 'win' | 'loss' | 'push';

const BUCKETS: [number, number][] = [
  [0.4, 0.5],
  [0.5, 0.55],
  [0.55, 0.6],
  [0.6, 0.65],
  [0.65, 0.7],
  [0.7, 1.01],
];

interface MutableStats {
  market: string;
  modelVersion: string;
  picks: number;
  graded: number;
  wins: number;
  losses: number;
  pushes: number;
  stakeUnits: number;
  netUnits: number;
  modelProbSum: number;
  modelProbCount: number;
  modelBrierSum: number;
  modelBrierCount: number;
  marketBrierSum: number;
  marketBrierCount: number;
  decisionBrierSum: number;
  decisionBrierCount: number;
  decisionLogLossSum: number;
  decisionLogLossCount: number;
  realizedProbSum: number;
  decisionProbSum: number;
  decisionProbCount: number;
  clvSum: number;
  clvCount: number;
  roiSampleSum: number;
  roiSampleSqSum: number;
  roiSampleCount: number;
  calibration: (LiveCalibrationBucket & { predictedSum: number; wins: number })[];
}

interface MutableCandidateValidation {
  market: string;
  modelVersion: string;
  gradedCandidates: number;
  recommended: number;
  passed: number;
  recommendedWins: number;
  passedWins: number;
  recommendedBrierSum: number;
  passedBrierSum: number;
  recommendedBrierCount: number;
  passedBrierCount: number;
}

function emptyStats(market: string, modelVersion: string): MutableStats {
  return {
    market,
    modelVersion,
    picks: 0,
    graded: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    stakeUnits: 0,
    netUnits: 0,
    modelProbSum: 0,
    modelProbCount: 0,
    modelBrierSum: 0,
    modelBrierCount: 0,
    marketBrierSum: 0,
    marketBrierCount: 0,
    decisionBrierSum: 0,
    decisionBrierCount: 0,
    decisionLogLossSum: 0,
    decisionLogLossCount: 0,
    realizedProbSum: 0,
    decisionProbSum: 0,
    decisionProbCount: 0,
    clvSum: 0,
    clvCount: 0,
    roiSampleSum: 0,
    roiSampleSqSum: 0,
    roiSampleCount: 0,
    calibration: BUCKETS.map(([lo, hi]) => ({
      lo,
      hi,
      n: 0,
      predicted: 0,
      realized: 0,
      predictedSum: 0,
      wins: 0,
    })),
  };
}

function chosenSnapshot(
  snapshots: LivePickSnapshot[],
  kickoff: string,
): LivePickSnapshot | undefined {
  const kickoffAt = Date.parse(kickoff);
  return snapshots
    .filter((snapshot) => Date.parse(snapshot.lastSeenAt) < kickoffAt)
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))[0];
}

function playerStatValue(result: CompletedResult, pick: StoredLivePick): number | undefined {
  if (!pick.player || !pick.propMarket) return undefined;
  return playerPropValue(result.playerStats, pick.player, pick.propMarket);
}

function grade(pick: StoredLivePick, result: CompletedResult): Outcome | undefined {
  const { homeScore, awayScore } = result;
  if (pick.pickType === 'Spread' || pick.pickType === 'Alt Spread') {
    if (pick.line == null) return undefined;
    const margin =
      pick.side === 'home_spread'
        ? homeScore - awayScore + pick.line
        : pick.side === 'away_spread'
          ? awayScore - homeScore + pick.line
          : undefined;
    return margin == null ? undefined : margin === 0 ? 'push' : margin > 0 ? 'win' : 'loss';
  }
  if (pick.pickType === 'Total' || pick.pickType === 'Alt Total') {
    if (pick.line == null) return undefined;
    const margin =
      pick.side === 'over'
        ? homeScore + awayScore - pick.line
        : pick.side === 'under'
          ? pick.line - homeScore - awayScore
          : undefined;
    return margin == null ? undefined : margin === 0 ? 'push' : margin > 0 ? 'win' : 'loss';
  }
  if (pick.pickType === 'Moneyline') {
    if (homeScore === awayScore) return 'push';
    if (pick.side !== 'home_ml' && pick.side !== 'away_ml') return undefined;
    const pickedHome = pick.side === 'home_ml';
    return pickedHome === homeScore > awayScore ? 'win' : 'loss';
  }
  if (pick.pickType === 'Prop') {
    if (pick.line == null) return undefined;
    const actual = playerStatValue(result, pick);
    if (actual == null) return undefined;
    if (pick.alternateLine && pick.side === 'over') return actual >= pick.line ? 'win' : 'loss';
    const margin = actual - pick.line;
    return margin === 0
      ? 'push'
      : pick.side === 'over'
        ? margin > 0
          ? 'win'
          : 'loss'
        : pick.side === 'under'
          ? margin < 0
            ? 'win'
            : 'loss'
          : undefined;
  }
  return undefined;
}

function asPlacedBet(pick: StoredLivePick, kickoff: string): PlacedBet {
  return {
    id: pick.key,
    placedAt: pick.observedAt,
    description: pick.description,
    market: pick.market,
    gameId: pick.gameId,
    pickType: pick.pickType as PlacedBet['pickType'],
    side: pick.side,
    line: pick.line,
    kickoff,
    marketProb: pick.marketProb,
    placementMarketProb: pick.marketProb,
    placementSurface: 'bet-now',
    book: pick.book as PlacedBet['book'],
    alternateLine: pick.alternateLine,
    player: pick.player,
    propMarket: pick.propMarket,
    price: pick.price,
    stakeUnits: pick.stakeUnits,
    unitSize: pick.betDollars / Math.max(pick.stakeUnits, 0.01),
    fee: pick.feeDollars,
    status: 'pending',
  };
}

function record(
  stats: MutableStats,
  pick: StoredLivePick,
  outcome: Outcome,
  closingClv: number | undefined,
): void {
  stats.graded += 1;
  const probability = pick.modelProb;
  if (probability != null && Number.isFinite(probability) && probability >= 0 && probability <= 1) {
    stats.modelProbSum += probability;
    stats.modelProbCount += 1;
  }
  const decisionProb = pick.decisionProb ?? probability;
  if (
    decisionProb != null &&
    Number.isFinite(decisionProb) &&
    decisionProb >= 0 &&
    decisionProb <= 1
  ) {
    stats.decisionProbSum += decisionProb;
    stats.decisionProbCount += 1;
  }
  if (
    outcome !== 'push' &&
    decisionProb != null &&
    Number.isFinite(decisionProb) &&
    decisionProb >= 0 &&
    decisionProb <= 1
  ) {
    const bucket = stats.calibration.find(
      (item) => decisionProb >= item.lo && decisionProb < item.hi,
    );
    if (bucket) {
      bucket.n += 1;
      bucket.predictedSum += decisionProb;
      if (outcome === 'win') bucket.wins += 1;
    }
  }
  if (outcome !== 'push') {
    const realized = outcome === 'win' ? 1 : 0;
    if (
      probability != null &&
      Number.isFinite(probability) &&
      probability >= 0 &&
      probability <= 1
    ) {
      stats.modelBrierSum += (probability - realized) ** 2;
      stats.modelBrierCount += 1;
    }
    if (
      pick.marketProb != null &&
      Number.isFinite(pick.marketProb) &&
      pick.marketProb >= 0 &&
      pick.marketProb <= 1
    ) {
      stats.marketBrierSum += (pick.marketProb - realized) ** 2;
      stats.marketBrierCount += 1;
    }
    if (
      decisionProb != null &&
      Number.isFinite(decisionProb) &&
      decisionProb >= 0 &&
      decisionProb <= 1
    ) {
      stats.decisionBrierSum += (decisionProb - realized) ** 2;
      stats.decisionBrierCount += 1;
      const bounded = Math.max(0.000001, Math.min(0.999999, decisionProb));
      stats.decisionLogLossSum += -(
        realized * Math.log(bounded) +
        (1 - realized) * Math.log(1 - bounded)
      );
      stats.decisionLogLossCount += 1;
    }
  }
  if (closingClv != null && Number.isFinite(closingClv)) {
    stats.clvSum += closingClv;
    stats.clvCount += 1;
  }
  const stake = pick.stakeUnits;
  stats.stakeUnits += stake;
  let netUnits = -pick.feeDollars / UNIT_DOLLARS;
  if (outcome === 'push') {
    stats.pushes += 1;
  } else if (outcome === 'win') {
    stats.realizedProbSum += 1;
    stats.wins += 1;
    netUnits += stake * americanToProfit(pick.price);
  } else {
    stats.realizedProbSum += 0;
    stats.losses += 1;
    netUnits -= stake;
  }
  stats.netUnits += netUnits;
  if (stake > 0) {
    const roiSample = netUnits / stake;
    stats.roiSampleSum += roiSample;
    stats.roiSampleSqSum += roiSample ** 2;
    stats.roiSampleCount += 1;
  }
}

function finalize(stats: MutableStats): LiveMarketStats {
  const decided = stats.wins + stats.losses;
  for (const bucket of stats.calibration) {
    bucket.predicted = bucket.n ? bucket.predictedSum / bucket.n : 0;
    bucket.realized = bucket.n ? bucket.wins / bucket.n : 0;
  }
  const roiVariance =
    stats.roiSampleCount > 1
      ? Math.max(
          0,
          (stats.roiSampleSqSum - stats.roiSampleSum ** 2 / stats.roiSampleCount) /
            (stats.roiSampleCount - 1),
        )
      : 0;
  const roiStdError = Math.sqrt(roiVariance / Math.max(1, stats.roiSampleCount));
  const roi = stats.stakeUnits ? stats.netUnits / stats.stakeUnits : 0;
  return {
    market: stats.market,
    modelVersion: stats.modelVersion,
    picks: stats.picks,
    graded: stats.graded,
    wins: stats.wins,
    losses: stats.losses,
    pushes: stats.pushes,
    stakeUnits: Number(stats.stakeUnits.toFixed(2)),
    netUnits: Number(stats.netUnits.toFixed(2)),
    roi: Number(roi.toFixed(4)),
    hitRate: decided ? Number((stats.wins / decided).toFixed(4)) : 0,
    meanModelProb: stats.modelProbCount
      ? Number((stats.modelProbSum / stats.modelProbCount).toFixed(4))
      : 0,
    modelBrier: stats.modelBrierCount
      ? Number((stats.modelBrierSum / stats.modelBrierCount).toFixed(4))
      : 0,
    marketBrier: stats.marketBrierCount
      ? Number((stats.marketBrierSum / stats.marketBrierCount).toFixed(4))
      : 0,
    decisionBrier: stats.decisionBrierCount
      ? Number((stats.decisionBrierSum / stats.decisionBrierCount).toFixed(4))
      : 0,
    decisionLogLoss: stats.decisionLogLossCount
      ? Number((stats.decisionLogLossSum / stats.decisionLogLossCount).toFixed(4))
      : 0,
    meanDecisionProb: stats.decisionProbCount
      ? Number((stats.decisionProbSum / stats.decisionProbCount).toFixed(4))
      : 0,
    realizedProb: decided ? Number((stats.realizedProbSum / decided).toFixed(4)) : 0,
    roiStdError: Number(roiStdError.toFixed(4)),
    roi95Low: Number((roi - 1.96 * roiStdError).toFixed(4)),
    roi95High: Number((roi + 1.96 * roiStdError).toFixed(4)),
    clvCount: stats.clvCount,
    meanClv: stats.clvCount ? Number((stats.clvSum / stats.clvCount).toFixed(4)) : 0,
    calibration: stats.calibration.map(({ lo, hi, n, predicted, realized }) => ({
      lo,
      hi,
      n,
      predicted,
      realized,
    })),
  };
}

/** Grades the latest pre-kickoff Bet Now recommendations actually archived by the app. */
export async function runLivePickBacktest(): Promise<LiveBacktestReport> {
  const history = await getLivePickHistory();
  const entries = Object.entries(history).map(([gameId, entry]) => ({ gameId, ...entry }));
  const selected = entries.flatMap((entry) => {
    const snapshot = chosenSnapshot(entry.snapshots, entry.kickoff);
    return snapshot ? [{ entry, snapshot }] : [];
  });
  const weeksBySeason = new Map<number, Set<number>>();
  for (const { entry } of selected) {
    const weeks = weeksBySeason.get(entry.season) ?? new Set<number>();
    weeks.add(entry.week);
    weeksBySeason.set(entry.season, weeks);
  }

  const resultsByGame = new Map<string, CompletedResult>();
  for (const [season, weeks] of weeksBySeason) {
    const resultsByWeek = await Promise.all(
      [...weeks].map(async (week) => ({
        week,
        results: await fetchEspnResults(week, season),
      })),
    );
    for (const { week, results } of resultsByWeek) {
      for (const result of results) {
        resultsByGame.set(`${season}-w${week}-${result.away}-${result.home}`.toLowerCase(), result);
      }
    }
  }

  const closingLines = await getClosingLines();
  const stats = new Map<string, MutableStats>();
  const candidateStats = new Map<string, MutableCandidateValidation>();
  let gamesGraded = 0;
  let picksGraded = 0;
  let picksMissingResults = 0;

  for (const { entry, snapshot } of selected) {
    const result = resultsByGame.get(entry.gameId.toLowerCase());
    if (!result) {
      picksMissingResults += snapshot.picks.length;
      continue;
    }
    gamesGraded += 1;
    const selectedKeys = new Set(snapshot.picks.map((pick) => pick.key));
    for (const candidate of snapshot.candidates ?? snapshot.picks) {
      if (
        !['Spread', 'Total', 'Moneyline', 'Prop', 'Alt Spread', 'Alt Total'].includes(
          candidate.pickType,
        )
      )
        continue;
      const outcome = grade(candidate, result);
      if (!outcome) continue;
      const market = candidate.pickType;
      const modelVersion = candidate.modelVersion ?? 'unversioned';
      const candidateKey = `${modelVersion}|${market}`;
      const candidateMarket = candidateStats.get(candidateKey) ?? {
        market,
        modelVersion,
        gradedCandidates: 0,
        recommended: 0,
        passed: 0,
        recommendedWins: 0,
        passedWins: 0,
        recommendedBrierSum: 0,
        passedBrierSum: 0,
        recommendedBrierCount: 0,
        passedBrierCount: 0,
      };
      candidateStats.set(candidateKey, candidateMarket);
      candidateMarket.gradedCandidates += 1;
      const recommended = candidate.recommended ?? selectedKeys.has(candidate.key);
      if (recommended) candidateMarket.recommended += 1;
      else candidateMarket.passed += 1;
      if (outcome === 'push') continue;
      const probability = candidate.decisionProb ?? candidate.modelProb;
      if (
        probability == null ||
        !Number.isFinite(probability) ||
        probability < 0 ||
        probability > 1
      )
        continue;
      const won = outcome === 'win';
      const brier = (probability - (won ? 1 : 0)) ** 2;
      if (recommended) {
        candidateMarket.recommendedWins += won ? 1 : 0;
        candidateMarket.recommendedBrierSum += brier;
        candidateMarket.recommendedBrierCount += 1;
      } else {
        candidateMarket.passedWins += won ? 1 : 0;
        candidateMarket.passedBrierSum += brier;
        candidateMarket.passedBrierCount += 1;
      }
    }
    for (const pick of snapshot.picks) {
      const market = pick.pickType;
      if (!['Spread', 'Total', 'Moneyline', 'Prop', 'Alt Spread', 'Alt Total'].includes(market))
        continue;
      const modelVersion = pick.modelVersion ?? 'unversioned';
      const marketKey = `${modelVersion}|${market}`;
      const marketStats = stats.get(marketKey) ?? emptyStats(market, modelVersion);
      stats.set(marketKey, marketStats);
      marketStats.picks += 1;
      const outcome = grade(pick, result);
      if (!outcome) continue;
      picksGraded += 1;
      const placedBet = asPlacedBet(pick, entry.kickoff);
      const clv = clvForBet(closingLines[entry.gameId], placedBet).clv;
      record(marketStats, pick, outcome, clv);
    }
  }

  const markets = [...stats.values()]
    .map(finalize)
    .sort((a, b) => a.market.localeCompare(b.market));
  const candidateValidation = [...candidateStats.values()]
    .map((item) => ({
      market: item.market,
      modelVersion: item.modelVersion,
      gradedCandidates: item.gradedCandidates,
      recommended: item.recommended,
      passed: item.passed,
      recommendedWins: item.recommendedWins,
      passedWins: item.passedWins,
      recommendedBrier: item.recommendedBrierCount
        ? Number((item.recommendedBrierSum / item.recommendedBrierCount).toFixed(4))
        : 0,
      passedBrier: item.passedBrierCount
        ? Number((item.passedBrierSum / item.passedBrierCount).toFixed(4))
        : 0,
    }))
    .sort((a, b) => a.market.localeCompare(b.market));
  const latestSeason = Math.max(0, ...entries.map((entry) => entry.season));
  return {
    source: 'archived-bet-now-picks',
    season: latestSeason,
    gamesObserved: entries.length,
    gamesGraded,
    picksGraded,
    picksMissingResults,
    markets,
    candidateValidation,
    note:
      entries.length === 0
        ? 'No live Bet Now snapshots have been archived yet. Keep the local server running and visit Bet Now before kickoff; snapshots begin accumulating now and cannot be reconstructed for past unrecorded slates.'
        : picksGraded === 0
          ? 'Archived picks are waiting for final results or usable player statistics.'
          : undefined,
    generatedAt: new Date().toISOString(),
  };
}

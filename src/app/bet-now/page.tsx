import { Zap } from 'lucide-react';
import { promises as fs } from 'fs';
import path from 'path';
import { getGames } from '@/lib/odds-source';
import { analyzeGamesWithLocks } from '@/lib/pick-locks';
import { getFormRatings, type Ratings } from '@/lib/form';
import { SEASON } from '@/lib/schedule';
import { fetchEspnResults, type CompletedResult, type PlayerGameStat } from '@/lib/espn';
import { getActiveWeek } from '@/lib/active-week';
import { hoursToKickoff } from '@/lib/kickoff';
import { spreadMovement, totalMovement, type LineMovement } from '@/lib/stale-line';
import { teamProfile } from '@/lib/ratings';
import { TEAMS } from '@/lib/teams';
import { opposingPriceForPick } from '@/lib/market-quote';
import { sgpForGame, buildParlays } from '@/lib/parlays';
import { captureClosingLines } from '@/lib/clv';
import { recordLivePickSnapshots } from '@/lib/live-pick-history';
import { getNflNews, getWire, relevantNews } from '@/lib/news';
import { readHandicapReviews } from '@/lib/handicap-review';
import type { HandicapReviewDraft } from '@/lib/handicap-review-schema';
import { buildBetNowCandidates, LIVE_MODEL_VERSION } from '@/lib/bet-now-candidates';
import { snapshotLiveModelInputs } from '@/lib/live-pick-capture';
import { SectionTitle, Chip } from '@/components/atoms';
import RefreshPicks from '@/components/RefreshPicks';
import WeekSelector from '@/components/WeekSelector';
import ExportPdfButton from '@/components/ExportPdfButton';
import PrintBetNow from '@/components/PrintBetNow';
import NewsWire from '@/components/NewsWire';
import ParlaysBoard from '@/components/ParlaysBoard';
import BetNowBoard, { type BetNowRow } from '@/components/BetNowBoard';
import type { GameAnalysis } from '@/lib/model';
import type { PlacedBet } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Cumulative units already placed per pick identity (prop-aware, ignores line),
// mirroring BetNowBoard so the PDF shows what's down + the remaining top-up.
async function readPlacedBets(): Promise<PlacedBet[]> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'data', 'store', 'bets.json'), 'utf-8');
    return JSON.parse(raw) as PlacedBet[];
  } catch {
    return [];
  }
}

function betIdentity(b: {
  gameId?: string;
  pickType?: string;
  side?: string;
  player?: string;
  propMarket?: string;
  description?: string;
}): string {
  if (!(b.gameId && b.pickType)) return b.description ?? '';
  if (b.pickType === 'Prop') {
    const dir = b.description && /\bunder\b/i.test(b.description) ? 'under' : 'over';
    return `${b.gameId}|Prop|${b.player ?? ''}|${b.propMarket ?? ''}|${dir}`;
  }
  return `${b.gameId}|${b.pickType}|${b.side ?? ''}|${b.player ?? ''}|${b.propMarket ?? ''}`;
}

function collectRows(a: GameAnalysis, week: number): BetNowRow[] {
  const matchup = `${a.game.away} @ ${a.game.home}`;
  const kickoff = a.game.kickoff;
  const rows: BetNowRow[] = [];
  const stakeOf = (p: { units: number; trueUnits?: number }) =>
    Number((p.trueUnits ?? p.units).toFixed(2));

  const addPick = (
    pickType: string,
    pick: {
      selection: string;
      price: number;
      edge: number;
      confidence: number;
      marketProb?: number;
      modelProb?: number;
      book?: PlacedBet['book'];
      units: number;
      trueUnits?: number;
      gameId?: string;
      side?: string;
      line?: number;
      player?: string;
      propMarket?: string;
      situational?: string;
      disconnect?: import('@/lib/disconnect').Disconnect;
      note?: string;
      narrative?: boolean;
    },
    move?: LineMovement,
  ) => {
    const stake = stakeOf(pick);
    if (stake <= 0) return;
    rows.push({
      key: `${a.game.id}-${pickType}-${pick.selection}`,
      matchup,
      kickoff,
      pickType,
      description: `${pick.selection} (${matchup})`,
      market: `Week ${week} · ${pickType}`,
      price: pick.price,
      stakeUnits: stake,
      edge: pick.edge,
      confidence: pick.confidence,
      marketProb: pick.marketProb,
      opposingPrice: opposingPriceForPick(a.game, { ...pick, pickType }),
      modelProb: pick.modelProb,
      book: pick.book,
      gameId: pick.gameId ?? a.game.id,
      side: pick.side,
      line: pick.line,
      player: pick.player,
      propMarket: pick.propMarket,
      situational: pick.situational,
      disconnect: pick.disconnect,
      signal: pick.note,
      narrative: pick.narrative,
      move,
    });
  };

  const book = a.game.books[0];
  addPick(
    'Spread',
    a.spread,
    spreadMovement(book, a.spread.edge, a.spread.side as 'home_spread' | 'away_spread'),
  );
  addPick('Total', a.total, totalMovement(book, a.total.edge, a.total.side as 'over' | 'under'));
  addPick('Moneyline', a.moneyline);
  // Upset is just an underdog ML — redundant with the Moneyline pick, so not surfaced.
  for (const { pick, detail } of a.props) {
    if (stakeOf(pick) <= 0) continue;
    rows.push({
      key: `${a.game.id}-prop-${detail.player}-${detail.market}`,
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
      opposingPrice: opposingPriceForPick(a.game, {
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
      gameId: a.game.id,
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

  for (const td of a.anytimeTds) {
    const stake = stakeOf(td);
    if (stake <= 0) continue;
    rows.push({
      key: `${a.game.id}-atd-${td.player}`,
      matchup,
      kickoff,
      pickType: 'Anytime TD',
      description: `${td.player} Anytime TD (${matchup})`,
      market: `Week ${week} · Anytime TD`,
      price: td.price,
      stakeUnits: stake,
      edge: td.edge,
      confidence: Math.round(td.prob * 100),
      modelProb: td.prob,
      book: td.book,
      gameId: a.game.id,
      player: td.player,
      disconnect: td.disconnect,
      signal: td.note,
      narrative: td.narrative,
      // ATD edges are tiny by nature — exempt from the sides/totals edge floor.
      floorExempt: true,
      longshot: td.price >= 600,
    });
  }
  // Dedicated big-payout longshot (best +EV scorer), surfaced even if thin-edge.
  const ls = a.anytimeTdLongshot;
  if (ls && !a.anytimeTds.some((t) => t.player === ls.player) && stakeOf(ls) > 0) {
    rows.push({
      key: `${a.game.id}-atd-ls-${ls.player}`,
      matchup,
      kickoff,
      pickType: 'Anytime TD',
      description: `${ls.player} Anytime TD (${matchup})`,
      market: `Week ${week} · Anytime TD`,
      price: ls.price,
      stakeUnits: stakeOf(ls),
      edge: ls.edge,
      confidence: Math.round(ls.prob * 100),
      modelProb: ls.prob,
      book: ls.book,
      gameId: a.game.id,
      player: ls.player,
      disconnect: ls.disconnect,
      signal: ls.note,
      narrative: ls.narrative,
      floorExempt: true,
      longshot: true,
    });
  }
  // Alternate lines (key-number spreads / strong-disconnect totals) that beat the
  // main-line EV. Already gated + small-capped by the engine, so floor-exempt.
  for (const alt of a.altPicks ?? []) {
    if (stakeOf(alt) <= 0) continue;
    rows.push({
      key: `${a.game.id}-alt-${alt.side}-${alt.line}`,
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
      opposingPrice: opposingPriceForPick(a.game, {
        pickType: alt.type,
        side: alt.side,
        book: 'DraftKings',
        price: alt.price,
        line: alt.line,
      }),
      modelProb: alt.modelProb,
      book: 'DraftKings',
      gameId: a.game.id,
      side: alt.side,
      line: alt.line,
      situational: alt.reason,
      disconnect: alt.disconnect,
      floorExempt: true,
    });
  }
  // Same-game parlay (correlated legs) from the live DK feed.
  const sgp = sgpForGame(a);
  if (sgp && sgp.units > 0) {
    rows.push({
      key: `${a.game.id}-sgp`,
      matchup,
      kickoff,
      pickType: 'SGP',
      description: `SGP (${matchup}): ${sgp.legs.map((l) => l.selection).join(' + ')}`,
      market: `Week ${week} · SGP`,
      price: sgp.americanOdds,
      stakeUnits: Number(sgp.units.toFixed(2)),
      edge: sgp.ev,
      confidence: 0,
      gameId: a.game.id,
      floorExempt: true,
    });
  }
  return rows;
}

function footballEvidence(a: GameAnalysis, row: BetNowRow): { label: string; detail: string }[] {
  const context = a.game.context;
  const factors = a.factors.map((factor) => `${factor.label}: ${factor.detail}`);
  const situation = [
    `Rest: ${a.game.away} ${context.awayRestDays} days, ${a.game.home} ${context.homeRestDays} days`,
    context.divisionGame ? 'Divisional matchup' : 'Non-divisional matchup',
    context.homeQbOut ? `${a.game.home} starting QB flagged out` : undefined,
    context.awayQbOut ? `${a.game.away} starting QB flagged out` : undefined,
    context.homeInjuryPenalty
      ? `${a.game.home} key-skill injury adjustment: ${context.homeInjuryPenalty.toFixed(1)} points`
      : undefined,
    context.awayInjuryPenalty
      ? `${a.game.away} key-skill injury adjustment: ${context.awayInjuryPenalty.toFixed(1)} points`
      : undefined,
    context.windMph != null ? `Forecast wind ${context.windMph} mph` : undefined,
    context.windDirectionDegrees != null
      ? `Wind direction ${context.windDirectionDegrees}°`
      : undefined,
    context.precip != null ? `Forecast precipitation ${context.precip} mm/hr` : undefined,
    context.tempF != null ? `Forecast temperature ${context.tempF}°F` : undefined,
    context.weatherForecastValidAt ? `Forecast hour ${context.weatherForecastValidAt}` : undefined,
    context.weatherForecastCapturedAt
      ? `Forecast retrieved ${context.weatherForecastCapturedAt}`
      : undefined,
    context.weather ? `Weather classification: ${context.weather}` : undefined,
    a.game.injuryReports?.length
      ? `ESPN injury reports: ${a.game.injuryReports
          .slice(0, 8)
          .map(
            (report) =>
              `${report.team} ${report.player}${report.position ? ` (${report.position})` : ''}: ${report.status}${report.sourceUpdatedAt ? ` as of ${report.sourceUpdatedAt}` : ''}`,
          )
          .join(
            ', ',
          )}${a.game.injuryReports.length > 8 ? `, +${a.game.injuryReports.length - 8} more` : ''}`
      : undefined,
  ].filter(Boolean);
  const model =
    row.modelProb == null
      ? 'No pick probability recorded'
      : `${(row.modelProb * 100).toFixed(1)}% model probability`;
  const market =
    row.marketProb == null
      ? 'No two-sided no-vig market probability available'
      : `${(row.marketProb * 100).toFixed(1)}% no-vig market probability`;

  return [
    {
      label: 'Quantitative matchup factors',
      detail: factors.length
        ? factors.join(' · ')
        : 'No game-level model factors are attached to this pick.',
    },
    {
      label: 'Situation and data actually supplied',
      detail:
        situation.join(' · ') || 'No additional rest, injury, or weather signal is available.',
    },
    {
      label: 'Exact market comparison',
      detail: `${model}; ${market}; ${row.book ?? 'book unavailable'} ${row.price > 0 ? '+' : ''}${row.price} at ${row.line ?? 'market line unavailable'}. Model edge ${((row.edge ?? 0) * 100).toFixed(1)}%.`,
    },
  ];
}

function recentPlayerStat(
  results: CompletedResult[],
  row: BetNowRow,
): { result: CompletedResult; stats: PlayerGameStat } | undefined {
  if (!row.player) return undefined;
  for (const result of results) {
    const stats = result.playerStats.find(
      (item) => item.player.toLowerCase() === row.player?.toLowerCase(),
    );
    if (stats) return { result, stats };
  }
  return undefined;
}

function playerStatSummary(stats: PlayerGameStat): string {
  const lines: string[] = [];
  if (stats.receptions != null || stats.receivingYards != null) {
    const receptions = stats.receptions ?? 0;
    lines.push(
      `${receptions} ${receptions === 1 ? 'reception' : 'receptions'} for ${stats.receivingYards ?? 0} receiving yards`,
    );
  }
  if (stats.rushYards != null) lines.push(`${stats.rushYards} rushing yards`);
  if (stats.passYards != null) lines.push(`${stats.passYards} passing yards`);
  if (stats.rushTD != null && stats.rushTD > 0) {
    lines.push(`${stats.rushTD} rushing TD${stats.rushTD === 1 ? '' : 's'}`);
  }
  if (stats.recTD != null && stats.recTD > 0) {
    lines.push(`${stats.recTD} receiving TD${stats.recTD === 1 ? '' : 's'}`);
  }
  return lines.join('; ');
}

function handicapResearchDraft(
  analysis: GameAnalysis,
  row: BetNowRow,
  priorResults: CompletedResult[],
  news: Awaited<ReturnType<typeof getWire>>,
  ratings: Ratings,
): HandicapReviewDraft {
  const context = analysis.game.context;
  const { home, away } = analysis.game;
  const homeTeam = TEAMS[home];
  const awayTeam = TEAMS[away];
  const homeProfile = teamProfile(home, ratings.off[home], ratings.def[home]);
  const awayProfile = teamProfile(away, ratings.off[away], ratings.def[away]);
  const latest = recentPlayerStat(priorResults, row);
  const playerName = row.player;
  const playerCandidate = playerName
    ? analysis.game.livePropCandidates?.find(
        (candidate) => candidate.player.toLowerCase() === playerName.toLowerCase(),
      )
    : undefined;
  const scorerCandidate = playerName
    ? analysis.game.anytimeTdCandidates?.find(
        (candidate) => candidate.player.toLowerCase() === playerName.toLowerCase(),
      )
    : undefined;
  const playerTeam = playerCandidate?.team ?? scorerCandidate?.team;
  const playerIsHome = playerTeam === home;
  const playerProfile = playerTeam ? (playerIsHome ? homeProfile : awayProfile) : undefined;
  const opponent = playerTeam ? (playerIsHome ? away : home) : undefined;
  const opponentProfile = playerTeam ? (playerIsHome ? awayProfile : homeProfile) : undefined;
  const playerProp = playerName
    ? analysis.props.find(({ detail }) => detail.player.toLowerCase() === playerName.toLowerCase())
        ?.detail
    : undefined;
  const now = Date.now();
  const recentCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const playerNews = playerName
    ? news
        .filter(
          (item) =>
            item.headline.toLowerCase().includes(playerName.toLowerCase()) &&
            item.link &&
            item.published &&
            Date.parse(item.published) >= recentCutoff &&
            Date.parse(item.published) <= now,
        )
        .slice(0, 3)
    : [];
  const teamNews = !playerName
    ? news
        .filter(
          (item) =>
            item.link &&
            item.published &&
            Date.parse(item.published) >= recentCutoff &&
            Date.parse(item.published) <= now &&
            item.teams.some((team) => team === analysis.game.home || team === analysis.game.away),
        )
        .slice(0, 3)
    : [];
  const sources = [
    ...(latest ? [`https://www.espn.com/nfl/game/_/gameId/${latest.result.eventId}`] : []),
    ...playerNews.map((item) => item.link!),
    ...teamNews.map((item) => item.link!),
  ].filter((source, index, all) => all.indexOf(source) === index);
  if (!sources.length) {
    sources.push(
      `https://www.espn.com/nfl/scoreboard/_/week/${analysis.game.week}/year/${analysis.game.season}`,
    );
  }

  const statLine = latest ? playerStatSummary(latest.stats) : '';
  const recentReport = playerNews.map((item) => {
    const date = item.published
      ? new Date(item.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'recent';
    return `${item.source ?? 'News'} (${date}): "${item.headline}"`;
  });
  const recentTeamReport = teamNews.map((item) => {
    const date = item.published
      ? new Date(item.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'recent';
    return `${item.source ?? 'News'} (${date}): "${item.headline}"`;
  });
  const latestEvidence =
    latest && statLine
      ? `${playerName}'s latest available ESPN box score (${latest.stats.team}, Week ${analysis.game.week - 1}) recorded ${statLine}. One game is a small sample, not a usage projection.`
      : latest
        ? `An ESPN box score was found for ${playerName}, but it did not include a usable stat for this summary.`
        : row.player
          ? `No matching player box score was available in the prior-week result feed for ${row.player}; do not infer recent usage from the prop line.`
          : 'No player box-score sample applies to this game-market pick.';
  const newsEvidence = recentReport.length
    ? `Recent player-specific reporting: ${recentReport.join(' ')}`
    : row.player
      ? `No player-specific report from the last seven days was found in the connected news feed for ${row.player}.`
      : recentTeamReport.length
        ? `Recent reporting for the teams in this matchup: ${recentTeamReport.join(' ')}`
        : 'No recent linked reporting for either team was found in the connected news feed.';
  const factorSummary = analysis.factors
    .map((factor) => `${factor.label}: ${factor.detail}`)
    .join('; ');
  const homeOffenseVsAwayDefense = homeProfile.offense + awayProfile.defense;
  const awayOffenseVsHomeDefense = awayProfile.offense + homeProfile.defense;
  const matchupGrade = (impact: number) =>
    impact >= 2 ? 'favorable' : impact <= -2 ? 'difficult' : 'near-neutral';
  const nearAverage = 'near-average';
  const script = analysis.script;
  const projectedLeader = analysis.projectedMargin >= 0 ? homeTeam.name : awayTeam.name;
  const projectedTrailer = analysis.projectedMargin >= 0 ? awayTeam.name : homeTeam.name;
  const scriptRead =
    Math.abs(analysis.projectedMargin) >= 6
      ? `The score model leans toward ${projectedLeader} controlling the game: ${homeTeam.name} ${analysis.projHome.toFixed(1)}–${awayTeam.name} ${analysis.projAway.toFixed(1)} (total ${analysis.projectedTotal.toFixed(1)}, margin ${Math.abs(analysis.projectedMargin).toFixed(1)}). If that lead develops, expect the leader to favor lower-risk early downs, clock-consuming runs and play-action, while ${projectedTrailer} has reason to raise dropback/tempo volume. That creates a real pass-volume path for the trailing side, but also more exposure to sacks, hurried throws and stalled drives.`
      : `The score model sees a competitive script: ${homeTeam.name} ${analysis.projHome.toFixed(1)}–${awayTeam.name} ${analysis.projAway.toFixed(1)} (total ${analysis.projectedTotal.toFixed(1)}, margin ${Math.abs(analysis.projectedMargin).toFixed(1)}). With no clear runaway lead, neither offense gets a strong model-based reason to abandon balance early; late pass/run volume will depend on who scores first and whether the game stays within one possession.`;
  const paceRead = `The sim expects about ${analysis.sim.drives.toFixed(1)} drives per team${script?.scoring === 'high' ? ', with a higher-scoring environment' : script?.scoring === 'low' ? ', with a lower-scoring environment' : ''}.`;
  const playerTeamMatchup =
    playerTeam && playerProfile && opponent && opponentProfile
      ? (() => {
          const offenseVsDefense = playerProfile.offense + opponentProfile.defense;
          const offenseLabel =
            playerProfile.offense >= 2
              ? 'above-average'
              : playerProfile.offense <= -2
                ? 'below-average'
                : nearAverage;
          const defenseLabel =
            opponentProfile.defense <= -2
              ? 'stingy'
              : opponentProfile.defense >= 2
                ? 'leaky'
                : 'near-average';
          return `${playerTeam}'s current offense profile is ${offenseLabel} (${playerProfile.offense >= 0 ? '+' : ''}${playerProfile.offense.toFixed(1)} points versus league average) against ${opponent}'s ${defenseLabel} overall defense profile (${opponentProfile.defense >= 0 ? '+' : ''}${opponentProfile.defense.toFixed(1)} points allowed versus average). The combined matchup points ${matchupGrade(offenseVsDefense)} for scoring (${offenseVsDefense >= 0 ? '+' : ''}${offenseVsDefense.toFixed(1)} points before game-specific factors). This is an efficiency matchup read, not a claim about a particular coverage shell or front.`;
        })()
      : '';
  const passDefenseContext =
    playerTeam && opponent && /pass|receiv|completion|interception|sack/i.test(row.propMarket ?? '')
      ? (() => {
          const rank = TEAMS[opponent].passDefRankPrev;
          const suffix =
            rank % 100 >= 11 && rank % 100 <= 13
              ? 'th'
              : rank % 10 === 1
                ? 'st'
                : rank % 10 === 2
                  ? 'nd'
                  : rank % 10 === 3
                    ? 'rd'
                    : 'th';
          return `${TEAMS[opponent].name} finished last season ranked ${rank}${suffix} in the app's prior-year pass-defense input; treat that as background, not a current coverage grade.`;
        })()
      : '';
  const propProjectionRead =
    playerProp && playerTeam
      ? (() => {
          const propLine = row.line ?? playerProp.line;
          const projectionGap = playerProp.projection - propLine;
          const projectionComparison =
            projectionGap === 0
              ? 'right on the line'
              : `${Math.abs(projectionGap).toFixed(1)} ${projectionGap > 0 ? 'above' : 'below'} the line`;
          return `The prop model projects ${playerProp.player} for ${playerProp.projection} ${playerProp.market} versus the ${propLine} line (${projectionComparison}). A projection sitting on the line is not a strong football reason to prefer either side; this bet needs the price/probability edge and role assumptions to hold.`;
        })()
      : '';
  const playerScriptRead =
    playerTeam && playerProfile
      ? (() => {
          const teamMargin = playerIsHome ? analysis.projectedMargin : -analysis.projectedMargin;
          const favored = teamMargin >= 3;
          const trailing = teamMargin <= -3;
          const market = (row.propMarket ?? '').toLowerCase();
          const isUnder = /\bunder\b/i.test(row.description);
          if (/rush yards|rush attempts/.test(market)) {
            return favored
              ? `${playerTeam} is projected to lead by about ${teamMargin.toFixed(1)}; that is a plausible carry/clock-control script for a rushing Over${isUnder ? ' and is a script headwind for this Under' : ''}, but the defense's overall efficiency and early-down success still determine whether those carries produce yards.`
              : trailing
                ? `${playerTeam} is projected to trail by about ${Math.abs(teamMargin).toFixed(1)}; that risks a second-half shift away from designed runs and can cap rushing volume, making a rushing Under more script-compatible${isUnder ? '' : ' and this Over more dependent on early efficiency or a closer-than-projected game'}.`
                : `The projected margin is close enough that this rushing prop does not get a strong run-volume boost or penalty from script alone.`;
          }
          if (/receptions|receiving|pass yards|pass attempts|completions|pass tds/.test(market)) {
            return trailing
              ? `${playerTeam} is projected to trail by about ${Math.abs(teamMargin).toFixed(1)}; a catch-up script can create extra dropbacks and target chances, supporting a volume Over${isUnder ? ' and making this Under script-counter' : ''}. It does not guarantee this player's share, catch rate, or yards after catch, so the individual role remains the key uncertainty.`
              : favored
                ? `${playerTeam} is projected to lead by about ${teamMargin.toFixed(1)}; that can reduce late dropbacks if the lead holds, a headwind for a passing-volume Over${isUnder ? ' and supportive of this Under' : ''}. Early efficiency, third-down success, and whether the opponent keeps scoring can reverse that script.`
                : `The projected margin is close, so there is no strong pass-volume script edge either way; this prop needs its player projection and role to beat the number.`;
          }
          if (/touchdown/.test(market) || row.pickType === 'Anytime TD') {
            return `The model gives ${playerTeam} about ${(playerIsHome ? analysis.projHome : analysis.projAway).toFixed(1)} expected points. More team scoring creates more red-zone chances, but the model does not identify this player's goal-line share; the TD case depends on role and conversion variance.`;
          }
          return `The player's team is projected for ${(playerIsHome ? analysis.projHome : analysis.projAway).toFixed(1)} points; the overall game script is ${script?.scoring ?? 'average'} scoring with a ${Math.abs(teamMargin).toFixed(1)}-point projected margin.`;
        })()
      : '';
  const gameMatchupRead = `${homeTeam.name} offense versus ${awayTeam.name} defense grades ${matchupGrade(homeOffenseVsAwayDefense)} (${homeOffenseVsAwayDefense >= 0 ? '+' : ''}${homeOffenseVsAwayDefense.toFixed(1)}); ${awayTeam.name} offense versus ${homeTeam.name} defense grades ${matchupGrade(awayOffenseVsHomeDefense)} (${awayOffenseVsHomeDefense >= 0 ? '+' : ''}${awayOffenseVsHomeDefense.toFixed(1)}).`;
  const gameLineScriptRead =
    row.line != null && /total/i.test(row.pickType)
      ? (() => {
          const distance = analysis.projectedTotal - row.line!;
          const aligns =
            (distance > 0 && /\bover\b/i.test(row.description)) ||
            (distance < 0 && /\bunder\b/i.test(row.description));
          const comparison =
            distance === 0
              ? 'matches'
              : `${Math.abs(distance).toFixed(1)} points ${distance > 0 ? 'above' : 'below'}`;
          return `The simulated total ${comparison} this line; that ${aligns ? 'aligns with' : 'does not align with'} the recommendation's direction. This is a mean projection, not a guarantee of the pace or final score.`;
        })()
      : row.line != null &&
          /spread/i.test(row.pickType) &&
          (row.side?.startsWith('home_') || row.side?.startsWith('away_'))
        ? (() => {
            const selectedHome = row.side?.startsWith('home_') ?? false;
            const selectedTeam = selectedHome ? homeTeam.name : awayTeam.name;
            const teamMargin = selectedHome ? analysis.projectedMargin : -analysis.projectedMargin;
            const coverMargin = teamMargin + row.line!;
            return `The score projection has ${selectedTeam} ${Math.abs(coverMargin).toFixed(1)} points ${coverMargin >= 0 ? 'ahead of' : 'short of'} this spread after accounting for the listed handicap. That is the game-script margin behind the side, not a separate guarantee of a cover.`;
          })()
        : '';
  const signals = row.player ? analysis.game.playerSignals?.[row.player.toLowerCase()] : undefined;
  const statusCaution =
    signals?.status === 'reported-out'
      ? `Recent news reports ${row.player} out (${signals.reason}); this is not an authoritative inactive designation. Verify the official Week ${analysis.game.week} report before betting.`
      : signals?.status === 'questionable'
        ? `Recent news mentions ${row.player} as questionable (${signals.reason}); verify the official inactive report and expected role before betting.`
        : 'No current injury/status flag is attached to this player in the structured game data.';
  const matchupNote = [
    latestEvidence,
    gameMatchupRead,
    playerTeamMatchup,
    passDefenseContext,
    propProjectionRead,
    factorSummary ? `Game-level model factors: ${factorSummary}.` : '',
    'Football read: this is an offense-versus-defense efficiency and game-plan inference, not a verified man/zone, blitz, personnel-grouping, or trench scouting report.',
  ]
    .filter(Boolean)
    .join(' ');
  const situationNote = [
    scriptRead,
    paceRead,
    playerScriptRead,
    gameLineScriptRead,
    `Rest: ${analysis.game.away} ${context.awayRestDays} days; ${analysis.game.home} ${context.homeRestDays} days. ${context.weather ? `Venue/weather flag: ${context.weather}.` : ''}`,
    newsEvidence,
    statusCaution,
    `Counterevidence/risk: ${latest ? "the latest box-score sample may not represent this week's role or game script." : 'recent role and usage were not verified in the available box-score feed.'}`,
  ].join(' ');
  const priceProb =
    row.price > 0 ? 100 * (100 / (row.price + 100)) : 100 * (-row.price / (-row.price + 100));
  const benchmark =
    row.marketProb == null
      ? `listed-price break-even probability ${priceProb.toFixed(1)}%`
      : row.pickType === 'Prop'
        ? `listed-price break-even probability ${priceProb.toFixed(1)}%`
        : `no-vig market probability ${(row.marketProb * 100).toFixed(1)}%`;
  const lineNote = [
    `Exact current quote: ${row.description.replace(` (${row.matchup})`, '')}, ${row.book ?? 'book unavailable'} ${row.price > 0 ? '+' : ''}${row.price}${row.line != null ? ` at line ${row.line}` : ''}.`,
    row.modelProb != null
      ? `Model probability ${(row.modelProb * 100).toFixed(1)}%; ${benchmark}; displayed edge ${(row.edge * 100).toFixed(1)}%.`
      : `Listed-price break-even probability ${priceProb.toFixed(1)}%; no pick-specific model probability is recorded.`,
    'This is a model-versus-price comparison, not proof of an exploitable edge. Recheck the same sportsbook line and price at placement; pass if the quote has moved or availability/role is uncertain.',
  ].join(' ');

  return { matchupNote, situationNote, lineNote, sources };
}

export default async function BetNowPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const activeWeek = await getActiveWeek();

  // Default view auto-rolls to the next slate that still has pre-kickoff value.
  let defaultWeek = activeWeek;
  let defaultUpcoming: GameAnalysis[] = [];
  let defaultSignalsReady: boolean | undefined;
  let defaultRatings: Ratings | undefined;
  let defaultSource: 'live' | 'seed' = 'seed';
  for (let w = activeWeek; w <= Math.min(18, activeWeek + 2); w++) {
    const { games, signalsReady, source } = await getGames(w);
    const ratings = await getFormRatings(w);
    const analyses = await analyzeGamesWithLocks(games, ratings);
    const up = analyses.filter((a) => hoursToKickoff(a.game.kickoff) > 0);
    if (up.length) {
      defaultWeek = w;
      defaultUpcoming = up;
      defaultSignalsReady = signalsReady;
      defaultRatings = ratings;
      defaultSource = source;
      break;
    }
  }

  // An explicit ?week= lets you scout future weeks/lines from the same board.
  const explicit = sp.week ? Math.max(1, Math.min(18, Number(sp.week) || defaultWeek)) : undefined;
  const week = explicit ?? defaultWeek;
  const isDefaultView = week === defaultWeek;

  let upcoming: GameAnalysis[];
  let signalsReady = defaultSignalsReady;
  let selectedRatings = defaultRatings;
  let selectedSource = defaultSource;
  if (isDefaultView) {
    upcoming = defaultUpcoming;
  } else {
    const res = await getGames(week);
    selectedSource = res.source;
    const ratings = await getFormRatings(week);
    selectedRatings = ratings;
    const analyses = await analyzeGamesWithLocks(res.games, ratings);
    upcoming = analyses.filter((a) => hoursToKickoff(a.game.kickoff) > 0);
    signalsReady = res.signalsReady;
  }
  const ratingsForResearch = selectedRatings ?? (await getFormRatings(week));

  // Every unlocked (pre-kickoff) game for the week, ordered by kickoff.
  const sorted = [...upcoming].sort(
    (a, b) => new Date(a.game.kickoff).getTime() - new Date(b.game.kickoff).getTime(),
  );
  // Snapshot the current market as the closing line (frozen at kickoff) so CLV is
  // tracked automatically from this daily page — never touches locked snapshots.
  // Only from the live default view: scouting a future week must not freeze a
  // premature "closing" line for games days/weeks from kickoff.
  if (isDefaultView && selectedSource === 'live')
    await captureClosingLines(sorted.map((a) => a.game));
  const dayLabelOf = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
  const pageRows = sorted.flatMap((a) =>
    collectRows(a, week).map((r) => ({ ...r, day: dayLabelOf(a.game.kickoff) })),
  );
  const pageRowsByKey = new Map(pageRows.map((row) => [row.key, row]));
  const { candidates: archivedCandidates, valued: selected } = buildBetNowCandidates(sorted, week);
  const valued = selected.map((candidate) => ({
    ...candidate,
    move: pageRowsByKey.get(candidate.key)?.move,
    day: dayLabelOf(candidate.kickoff),
  }));
  if (isDefaultView && selectedSource === 'live') {
    const archivedPicks = valued.map((pick) => ({
      ...pick,
      recommended: true,
      decisionReason: 'Selected by the live Bet Now page.',
      modelVersion: LIVE_MODEL_VERSION,
    }));
    await recordLivePickSnapshots(
      sorted.map((analysis) => analysis.game),
      archivedPicks,
      archivedCandidates,
      snapshotLiveModelInputs(sorted, ratingsForResearch),
    );
  }

  // Beat-writer wire (per-team Google News + national feeds), soonest teams first.
  const newsTeams = [...new Set(sorted.slice(0, 6).flatMap((a) => [a.game.home, a.game.away]))];
  const wireRaw = await getWire(newsTeams);
  const wire = wireRaw.length
    ? wireRaw.slice(0, 16)
    : relevantNews(await getNflNews(), new Set(newsTeams));
  let priorResults: CompletedResult[] = [];
  if (week > 1 && valued.some((row) => row.pickType === 'Prop')) {
    try {
      priorResults = await fetchEspnResults(week - 1, SEASON);
    } catch (error) {
      console.error(`Failed to retrieve Week ${week - 1} box scores for handicap research`, error);
    }
  }
  const savedReviews = await readHandicapReviews();
  const analysisByGame = new Map(sorted.map((analysis) => [analysis.game.id, analysis]));
  const reviewedRows: BetNowRow[] = valued.map((row) => {
    const analysis = analysisByGame.get(row.gameId);
    const matchupTeams = analysis ? [analysis.game.home, analysis.game.away] : [];
    return {
      ...row,
      locked: analysis?.locked ?? false,
      review: savedReviews[row.key],
      footballEvidence: analysis ? footballEvidence(analysis, row) : [],
      researchDraft: analysis
        ? handicapResearchDraft(analysis, row, priorResults, wire, ratingsForResearch)
        : undefined,
      newsSources: wire
        .filter((item) => item.link && item.teams.some((team) => matchupTeams.includes(team)))
        .slice(0, 4)
        .map((item) => ({
          headline: item.headline,
          href: item.link!,
          source: item.source,
        })),
    };
  });
  const breakingTeams = [...new Set(wire.filter((n) => n.breaking).flatMap((n) => n.teams))];
  // Signals feed timed out on this (cold) load — news-driven picks may not be here
  // yet. Flag it so a first load isn't mistaken for the final slate.
  const warming = signalsReady === false;

  const liveSource = selectedSource === 'live';
  const dayCount = liveSource ? new Set(valued.map((r) => r.day)).size : 0;
  const totalDollars = liveSource ? valued.reduce((s, r) => s + (r.betDollars ?? 0), 0) : 0;
  const totalNetEv = liveSource ? valued.reduce((s, r) => s + (r.netEv ?? 0), 0) : 0;

  // Cross-game value parlays (independent legs, strictly +EV). Forward feature,
  // week 3 on only — same as the slate. Same-game parlays surface as SGP rows above.
  const parlays = week >= 3 ? buildParlays(sorted) : [];

  const displayedRows = liveSource ? reviewedRows : reviewedRows.filter((row) => row.locked);

  // Units already placed per pick (server-side bankroll store) for the PDF.
  const placedBets = await readPlacedBets();
  const placedByIdentity = new Map<string, number>();
  for (const b of placedBets) {
    const k = betIdentity(b);
    if (k) placedByIdentity.set(k, (placedByIdentity.get(k) ?? 0) + (b.stakeUnits ?? 0));
  }
  const placedForRow: Record<string, number> = {};
  for (const r of displayedRows) placedForRow[r.key] = placedByIdentity.get(betIdentity(r)) ?? 0;

  return (
    <>
      <PrintBetNow rows={displayedRows} week={week} season={SEASON} placed={placedForRow} />
      <div className="screen-only space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle
            title="Bet Now"
            subtitle={
              selectedSource !== 'live'
                ? 'Live odds unavailable — recommendations are suppressed'
                : displayedRows.length
                  ? `${displayedRows.length} model-positive candidates · ${sorted.length} games across ${dayCount} day${dayCount > 1 ? 's' : ''} · $${totalDollars.toFixed(0)} suggested risk · ~$${totalNetEv.toFixed(0)} model-estimated profit`
                  : 'No current candidates have positive model-estimated value'
            }
            icon={<Zap size={18} />}
          />
          <div className="flex items-center gap-2">
            {!isDefaultView && <Chip variant="fade">Scouting future week</Chip>}
            <WeekSelector week={week} currentWeek={defaultWeek} basePath="/bet-now" />
            {displayedRows.length > 0 && (
              <ExportPdfButton label="Export PDF" title="Export the Bet Now value bets as a PDF" />
            )}
            <RefreshPicks />
          </div>
        </div>

        {selectedSource !== 'live' && (
          <div
            role="alert"
            className="card border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-200"
          >
            Live odds are unavailable. Seed fallback recommendations, parlays, and exports for new
            picks are disabled and no offline recommendations are archived. Any existing locked
            picks remain unchanged. Refresh after the live feed returns.
          </div>
        )}

        {warming && (
          <div className="card flex items-center gap-2 border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <span>
              <span className="font-semibold">Board still warming</span> — the news &amp; injury
              feed is loading, so news-driven picks may not all be here yet. Give it ~30s and
              refresh before treating this as the final slate.
            </span>
          </div>
        )}

        <div className="card p-3 text-xs text-zinc-400">
          Candidates use model-estimated positive expected value at current listed odds, with at
          most one side, total, and player-prop selection per game. Each suggested stake is capped
          at $5; the $0.50 placement fee is deducted from estimated value. These probabilities have
          not established a profitable edge: use this as a tracking slate, not a promise of winning
          picks. The optional football handicap review can be opened before betting; it does not
          block placement. Locked pick snapshots remain unchanged.
        </div>

        {displayedRows.length === 0 ? (
          <div className="card p-6 text-sm text-zinc-400">
            {selectedSource !== 'live'
              ? 'No new live recommendations are available while the odds feed is offline. Frozen locked picks remain unchanged.'
              : 'No unlocked game currently has a model-positive candidate at the listed odds. More candidates may appear as lines and player markets update; a positive model estimate is not proof of an edge.'}
          </div>
        ) : (
          <>
            {breakingTeams.length > 0 && (
              <div className="card border-red-500/40 bg-red-500/5 p-3 text-xs text-red-300">
                <span className="font-semibold">⚠ Breaking status news</span> — verify inactives
                before betting: {breakingTeams.join(', ')}. The model uses the structured injury
                feed and may lag last-minute reports.
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <BetNowBoard rows={displayedRows} season={SEASON} news={wire} />
              <NewsWire items={wire} />
            </div>
            {selectedSource === 'live' && parlays.length > 0 && (
              <ParlaysBoard parlays={parlays} week={week} />
            )}
          </>
        )}
      </div>
    </>
  );
}

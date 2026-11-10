import { getActiveWeek } from './active-week';
import { buildBetNowCandidates } from './bet-now-candidates';
import { getFormRatings } from './form';
import { hoursToKickoff } from './kickoff';
import { analyzeGamesWithLocks } from './pick-locks';
import { getGames } from './odds-source';
import { recordLivePickSnapshots, type LiveModelInputDraft } from './live-pick-history';
import type { GameAnalysis } from './model';
import type { Ratings } from './form';
import { LIVE_MODEL_VERSION } from './bet-now-candidates';

export interface LivePickCaptureResult {
  status: 'captured' | 'offline' | 'no-upcoming-games';
  week?: number;
  games?: number;
  picks?: number;
  candidates?: number;
}

export function snapshotLiveModelInputs(
  analyses: GameAnalysis[],
  ratings: Ratings,
): Record<string, LiveModelInputDraft> {
  return Object.fromEntries(
    analyses
      .filter((analysis) => !analysis.locked)
      .map((analysis) => {
        const { game } = analysis;
        return [
          game.id,
          {
            modelVersion: LIVE_MODEL_VERSION,
            gameContext: game.context,
            books: game.books,
            outPlayers: game.outPlayers,
            injuryReports: game.injuryReports,
            livePropCandidates: game.livePropCandidates,
            livePropLines: game.livePropLines,
            anytimeTdCandidates: game.anytimeTdCandidates,
            factors: analysis.factors,
            projections: {
              home: analysis.projHome,
              away: analysis.projAway,
              margin: analysis.projectedMargin,
              total: analysis.projectedTotal,
              homeWinProb: analysis.homeWinProb,
              marginSd: analysis.sim.marginSd,
            },
            teamRatings: {
              home: {
                net: ratings.net[game.home],
                offense: ratings.off[game.home],
                defense: ratings.def[game.home],
                elo: ratings.elo[game.home],
              },
              away: {
                net: ratings.net[game.away],
                offense: ratings.off[game.away],
                defense: ratings.def[game.away],
                elo: ratings.elo[game.away],
              },
            },
          },
        ];
      }),
  );
}

/** Rebuild the default Bet Now slate and archive it only when the feed is live. */
export async function captureLiveBetNowBoard(): Promise<LivePickCaptureResult> {
  const activeWeek = await getActiveWeek();
  for (let week = activeWeek; week <= Math.min(18, activeWeek + 2); week++) {
    const result = await getGames(week);
    const ratings = await getFormRatings(week);
    const analyses = await analyzeGamesWithLocks(result.games, ratings);
    const upcoming = analyses.filter((analysis) => hoursToKickoff(analysis.game.kickoff) > 0);
    if (!upcoming.length) continue;
    if (result.source !== 'live') return { status: 'offline', week };

    const { candidates, valued } = buildBetNowCandidates(upcoming, week);
    await recordLivePickSnapshots(
      upcoming.map((analysis) => analysis.game),
      valued,
      candidates,
      snapshotLiveModelInputs(upcoming, ratings),
    );
    return {
      status: 'captured',
      week,
      games: upcoming.length,
      picks: valued.length,
      candidates: candidates.length,
    };
  }
  return { status: 'no-upcoming-games' };
}

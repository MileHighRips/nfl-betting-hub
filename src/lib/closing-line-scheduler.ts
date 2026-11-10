import { getActiveWeek } from './active-week';
import { captureClosingLines, getWeeksWithUpcomingBets } from './clv';
import { getGames } from './odds-source';
import { captureLiveBetNowBoard } from './live-pick-capture';

const INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 10 * 1000;

export async function captureScheduledResearch(): Promise<{
  status: 'captured' | 'offline';
  weeksCaptured: number[];
  weeksSkipped: number[];
  betNow: Awaited<ReturnType<typeof captureLiveBetNowBoard>>;
}> {
  const [activeWeek, betWeeks] = await Promise.all([getActiveWeek(), getWeeksWithUpcomingBets()]);
  const weeks = new Set([activeWeek, ...betWeeks]);
  const results = await Promise.all([...weeks].map((week) => getGames(week)));
  const liveResults = results.filter((result) => result.source === 'live');
  if (liveResults.length) {
    await captureClosingLines(liveResults.flatMap((result) => result.games));
  }
  const betNow = await captureLiveBetNowBoard();
  return {
    status: liveResults.length ? 'captured' : 'offline',
    weeksCaptured: liveResults.map((result) => result.week),
    weeksSkipped: results.filter((result) => result.source !== 'live').map((result) => result.week),
    betNow,
  };
}

export function startClosingLineScheduler(): void {
  const runtime = globalThis as typeof globalThis & {
    __closingLineSchedulerStarted?: boolean;
  };
  if (runtime.__closingLineSchedulerStarted) return;
  runtime.__closingLineSchedulerStarted = true;

  let running = false;
  const capture = async () => {
    if (running) return;
    running = true;
    try {
      const result = await captureScheduledResearch();
      for (const week of result.weeksSkipped)
        console.warn(`[closing-line-scheduler] Skipped Week ${week}: live odds unavailable.`);
      if (result.betNow.status === 'offline')
        console.warn(
          `[bet-now-archive] Skipped Week ${result.betNow.week}: live odds unavailable.`,
        );
    } catch (error) {
      console.error('[closing-line-scheduler] Capture failed:', error);
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => void capture(), INTERVAL_MS);
  interval.unref();
  const startup = setTimeout(() => void capture(), STARTUP_DELAY_MS);
  startup.unref();
}

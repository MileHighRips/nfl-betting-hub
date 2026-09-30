import { getCurrentWeek, TOTAL_WEEKS } from './schedule';
import { getGameStatuses } from './live-status';
import { memo } from './cache';

async function isWeekComplete(week: number): Promise<boolean> {
  const statuses = Object.values(await getGameStatuses(week));
  return statuses.length > 0 && statuses.every((s) => s.state === 'post');
}

/**
 * The week the app treats as "current". Identical to the date-based week, but
 * advances to the next week the moment the current slate is fully final — i.e.
 * right after the Monday night game ends — instead of waiting for the Tuesday
 * rollover. Falls back to the date-based week if statuses can't be read.
 */
export async function getActiveWeek(now: Date = new Date()): Promise<number> {
  const base = getCurrentWeek(now);
  if (base >= TOTAL_WEEKS) return base;
  try {
    const complete = await memo(`week-complete-${base}`, 30_000, () => isWeekComplete(base));
    return complete ? base + 1 : base;
  } catch {
    return base;
  }
}

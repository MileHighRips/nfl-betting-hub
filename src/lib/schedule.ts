/**
 * Season schedule logic. Drives the "current week" automatically from the date
 * so the hub auto-advances as the season progresses. NFL weeks run Thursday →
 * the following Wednesday; we anchor each week to the Tuesday before kickoff so
 * Tue/Wed sit at the boundary between weeks.
 */

export const SEASON = 2026;
export const TOTAL_WEEKS = 18;

// Week 1 Thursday night kickoff (ET). Anchor = the Tuesday 2 days prior.
const WEEK1_THURSDAY = new Date('2026-09-10T20:00:00-04:00');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ANCHOR = new Date(WEEK1_THURSDAY.getTime() - 2 * 24 * 60 * 60 * 1000);

function clampWeek(w: number): number {
  return Math.max(1, Math.min(TOTAL_WEEKS, w));
}

/** NFL week number that a given date falls into (1–18). */
export function weekOf(date: Date = new Date()): number {
  const diff = date.getTime() - ANCHOR.getTime();
  if (diff < 0) return 1; // preseason / before opener
  return clampWeek(Math.floor(diff / WEEK_MS) + 1);
}

/** The current week based on today. */
export function getCurrentWeek(now: Date = new Date()): number {
  return weekOf(now);
}

/** Inclusive start / exclusive end of a week's window. */
export function weekWindow(week: number): { start: Date; end: Date } {
  const start = new Date(ANCHOR.getTime() + (clampWeek(week) - 1) * WEEK_MS);
  const end = new Date(start.getTime() + WEEK_MS);
  return { start, end };
}

export function weekLabel(week: number): string {
  return `Week ${clampWeek(week)}`;
}

export function allWeeks(): number[] {
  return Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);
}

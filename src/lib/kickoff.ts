/**
 * Time-to-kickoff model. Lines are softest early in the week (low limits, little
 * sharp action) and converge to an efficient CLOSING number by kickoff. So a
 * genuine model edge is most capturable early — bet then to beat the close
 * (positive CLV). This turns "how big is the edge" and "how long until kickoff"
 * into a concrete bet-timing recommendation on the Bet Now page.
 */

export type TimingStage = 'bet-now' | 'lean' | 'monitor' | 'closing';

export interface TimingAdvice {
  stage: TimingStage;
  label: string;
  detail: string;
}

/** Hours until kickoff (negative once started). */
export function hoursToKickoff(kickoffIso: string, now: Date = new Date()): number {
  return (new Date(kickoffIso).getTime() - now.getTime()) / 3_600_000;
}

/** ET calendar day key (YYYY-MM-DD) for grouping a slate by day. */
export function etDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Human countdown, e.g. "2d 4h", "6h 10m", "45m". */
export function untilLabel(hours: number): string {
  if (hours <= 0) return 'now';
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  const m = Math.round((hours - Math.floor(hours)) * 60);
  if (d >= 1) return `${d}d ${h}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Recommend when to bet, from the model edge (vig-free prob − market prob) and
 * how far out kickoff is. Big edge + early = strongest "bet now" (best CLV).
 */
export function timingAdvice(edge: number, hours: number): TimingAdvice {
  if (hours <= 2) {
    return {
      stage: 'closing',
      label: 'Near close',
      detail: 'This is ~the closing number — bet if you still like the price.',
    };
  }
  if (edge >= 0.04) {
    return {
      stage: 'bet-now',
      label: 'Bet now',
      detail:
        hours >= 24
          ? 'Strong edge on an early number — bet now to beat the close (positive CLV).'
          : 'Strong edge — bet now before the line tightens into kickoff.',
    };
  }
  if (edge >= 0.02) {
    return {
      stage: 'lean',
      label: 'Playable',
      detail: 'Real edge — fine to bet; the number may still improve slightly.',
    };
  }
  return {
    stage: 'monitor',
    label: 'Monitor',
    detail: 'Thin edge — wait for the line to move toward the model before betting.',
  };
}

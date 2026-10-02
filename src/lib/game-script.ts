import type { GameSim } from './simulation';
import type { TeamAbbr } from './types';

/**
 * Game-script narrative derived from the sim the model already runs — NOT a new
 * signal (that would double-count the total/margin the sim produces). It just
 * makes the projected script legible (high/low scoring, likely blowout, who is
 * chasing) and drives the bounded blowout usage tilt for scorers.
 */
export interface GameScript {
  scoring: 'high' | 'low' | 'avg';
  blowout: boolean;
  leader?: TeamAbbr;
  trailer?: TeamAbbr;
  tags: string[];
}

const LEAGUE_TOTAL = 44.5;

export function computeGameScript(sim: GameSim, home: TeamAbbr, away: TeamAbbr): GameScript {
  const total = sim.totalMean;
  const margin = sim.marginMean; // home − away
  const blowout = Math.abs(margin) >= 10;
  const leader = margin > 0 ? home : away;
  const trailer = margin > 0 ? away : home;
  const scoring: GameScript['scoring'] =
    total >= LEAGUE_TOTAL + 4 ? 'high' : total <= LEAGUE_TOTAL - 4 ? 'low' : 'avg';

  const tags: string[] = [];
  if (scoring === 'high') tags.push(`High-scoring (proj ${total.toFixed(0)})`);
  if (scoring === 'low') tags.push(`Low-scoring (proj ${total.toFixed(0)})`);
  if (blowout) tags.push(`Likely blowout \u2014 ${leader} control, ${trailer} chasing`);

  return {
    scoring,
    blowout,
    leader: blowout ? leader : undefined,
    trailer: blowout ? trailer : undefined,
    tags,
  };
}

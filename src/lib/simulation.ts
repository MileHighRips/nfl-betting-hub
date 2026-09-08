import type { Game, ModelFactor } from './types';
import { TEAMS } from './teams';
import { LEAGUE_AVG_PPG, homeFieldEdge, teamProfile } from './ratings';
import { QB_DROPOFF, DEFAULT_QB_DROPOFF } from '@/data/ratings2026';
import { travelEffect } from './geo';
import type { Ratings } from './form';
import type { TeamAbbr } from './types';

/**
 * ============================================================================
 *  DRIVE-LEVEL MONTE-CARLO SIMULATION ENGINE
 * ============================================================================
 *  Each game is played out thousands of times, drive by drive. Team scoring is
 *  built from first principles — offensive efficiency vs the opponent's defense,
 *  scaled by pace (possessions/game) — so the projected TOTAL comes from the
 *  model itself, not the market. Every drive resolves to a touchdown, field
 *  goal, or no score, which reproduces realistic football scores clustered on
 *  3s and 7s and makes key-number push probabilities fall out naturally.
 *
 *  Factor stack feeding expected points:
 *    offense/defense matchup · team-specific home field · rest/bye · travel &
 *    body clock · weather (scoring + kicking) · QB availability (team-specific
 *    backup dropoff) · divisional tightening · pace (totals lever).
 * ============================================================================
 */

export const SIM_CONFIG = {
  n: 12000,
  basePaceDrives: 11.3,
  driveCountSd: 1.0,
  restPtPerDay: 0.12,
  restCap: 2.0,
  divisionTighten: 0.93,
  fgBaseRate: 0.155,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface GameSim {
  n: number;
  homeExp: number;
  awayExp: number;
  projHome: number;
  projAway: number;
  homeWinProb: number;
  marginMean: number;
  marginSd: number;
  totalMean: number;
  drives: number;
  margins: Float32Array;
  totals: Float32Array;
  factors: ModelFactor[];
}

/** Weather multipliers on scoring and field-goal success. */
function weatherFactors(w: Game['context']['weather']): { scoring: number; fg: number } {
  switch (w) {
    case 'dome':
      return { scoring: 1.01, fg: 1.02 };
    case 'wind':
      return { scoring: 0.92, fg: 0.8 };
    case 'rain':
      return { scoring: 0.95, fg: 0.9 };
    case 'snow':
      return { scoring: 0.88, fg: 0.7 };
    case 'cold':
      return { scoring: 0.98, fg: 0.92 };
    default:
      return { scoring: 1.0, fg: 1.0 };
  }
}

function kickoffHourEt(iso: string): number {
  const d = new Date(iso);
  return (d.getUTCHours() + 24 - 4) % 24;
}

function qbDrop(team: TeamAbbr): number {
  return QB_DROPOFF[team] ?? DEFAULT_QB_DROPOFF;
}

export function simulateGame(game: Game, ratings?: Ratings): GameSim {
  const home = game.home;
  const away = game.away;
  const c = game.context;
  const factors: ModelFactor[] = [];

  // In-season form as a net delta from the preseason anchor.
  const formHome = ratings ? ratings[home] - TEAMS[home].rating : 0;
  const formAway = ratings ? ratings[away] - TEAMS[away].rating : 0;
  const pH = teamProfile(home, formHome);
  const pA = teamProfile(away, formAway);

  // Expected points from the efficiency matchup.
  let homeExp = LEAGUE_AVG_PPG + pH.offense + pA.defense;
  let awayExp = LEAGUE_AVG_PPG + pA.offense + pH.defense;
  factors.push({
    label: 'Efficiency Matchup',
    detail: `${TEAMS[home].name} net ${pH.net.toFixed(1)} vs ${TEAMS[away].name} net ${pA.net.toFixed(1)}`,
    impact: pH.net - pA.net,
  });

  // Team-specific home field (weighted toward the home offense).
  const hfa = c.neutralSite ? 0 : homeFieldEdge(home);
  homeExp += hfa * 0.55;
  awayExp -= hfa * 0.45;
  if (hfa)
    factors.push({ label: 'Home Field', detail: `${TEAMS[home].name} (${hfa} pts)`, impact: hfa });

  // Rest / bye.
  const restAdj = Math.max(
    -SIM_CONFIG.restCap,
    Math.min(SIM_CONFIG.restCap, (c.homeRestDays - c.awayRestDays) * SIM_CONFIG.restPtPerDay),
  );
  if (Math.abs(restAdj) >= 0.1) {
    homeExp += restAdj / 2;
    awayExp -= restAdj / 2;
    factors.push({
      label: 'Rest',
      detail: `${c.homeRestDays}d vs ${c.awayRestDays}d`,
      impact: restAdj,
    });
  }

  // Travel & body clock (away team).
  const travel = travelEffect(home, away, kickoffHourEt(game.kickoff));
  if (travel.awayPenalty >= 0.05) {
    awayExp -= travel.awayPenalty;
    factors.push({ label: 'Travel', detail: travel.detail, impact: travel.awayPenalty });
  }

  // Quarterback availability (team-specific backup dropoff).
  if (c.homeQbOut) {
    const d = qbDrop(home);
    homeExp -= d;
    factors.push({
      label: 'QB Out (Home)',
      detail: `${TEAMS[home].name} backup (−${d})`,
      impact: -d,
    });
  }
  if (c.awayQbOut) {
    const d = qbDrop(away);
    awayExp -= d;
    factors.push({
      label: 'QB Out (Away)',
      detail: `${TEAMS[away].name} backup (−${d})`,
      impact: d,
    });
  }

  // Divisional familiarity tightens the margin.
  if (c.divisionGame) {
    const mid = (homeExp + awayExp) / 2;
    homeExp = mid + (homeExp - mid) * SIM_CONFIG.divisionTighten;
    awayExp = mid + (awayExp - mid) * SIM_CONFIG.divisionTighten;
    factors.push({ label: 'Division', detail: 'Rivalry tightens margin', impact: 0 });
  }

  // Weather suppresses scoring (and kicking, below).
  const wf = weatherFactors(c.weather);
  if (wf.scoring !== 1) {
    const before = homeExp + awayExp;
    homeExp *= wf.scoring;
    awayExp *= wf.scoring;
    if (wf.scoring < 1)
      factors.push({
        label: 'Weather',
        detail: String(c.weather),
        impact: homeExp + awayExp - before,
      });
  }

  // Pace scales the TOTAL (more possessions → more points) without moving margin.
  const paceFactor = (pH.pace + pA.pace) / 2;
  {
    const total = homeExp + awayExp;
    const margin = homeExp - awayExp;
    const scaled = total * paceFactor;
    homeExp = (scaled + margin) / 2;
    awayExp = (scaled - margin) / 2;
    if (Math.abs(paceFactor - 1) > 0.005) {
      factors.push({
        label: 'Pace',
        detail: `${paceFactor.toFixed(2)}× tempo`,
        impact: total * (paceFactor - 1),
      });
    }
  }

  homeExp = Math.max(3, homeExp);
  awayExp = Math.max(3, awayExp);

  // ---- Drive-level simulation ----
  const n = SIM_CONFIG.n;
  const drivesMean = SIM_CONFIG.basePaceDrives * paceFactor;
  const fgRate = SIM_CONFIG.fgBaseRate * wf.fg;

  const ppdHome = homeExp / drivesMean;
  const ppdAway = awayExp / drivesMean;
  const pTdHome = Math.max(0.02, Math.min(0.72, (ppdHome - 3 * fgRate) / 6.96));
  const pTdAway = Math.max(0.02, Math.min(0.72, (ppdAway - 3 * fgRate) / 6.96));
  const pScoreHome = pTdHome + fgRate;
  const pScoreAway = pTdAway + fgRate;

  const rand = mulberry32(hashSeed(game.id));
  const margins = new Float32Array(n);
  const totals = new Float32Array(n);
  let homeWins = 0;
  let sumHome = 0;
  let sumAway = 0;
  let sumMargin = 0;
  let sumMargin2 = 0;
  let sumDrives = 0;

  for (let i = 0; i < n; i++) {
    const u1 = Math.max(1e-9, rand());
    const u2 = rand();
    const zDrives = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const d = Math.max(8, Math.min(15, Math.round(drivesMean + zDrives * SIM_CONFIG.driveCountSd)));
    sumDrives += d;

    let h = 0;
    let a = 0;
    for (let k = 0; k < d; k++) {
      const rh = rand();
      if (rh < pTdHome) h += 7;
      else if (rh < pScoreHome) h += 3;
      const ra = rand();
      if (ra < pTdAway) a += 7;
      else if (ra < pScoreAway) a += 3;
    }

    const m = h - a;
    margins[i] = m;
    totals[i] = h + a;
    sumHome += h;
    sumAway += a;
    sumMargin += m;
    sumMargin2 += m * m;
    if (m > 0) homeWins += 1;
    else if (m === 0) homeWins += 0.5;
  }

  const marginMean = sumMargin / n;
  const marginSd = Math.sqrt(Math.max(0, sumMargin2 / n - marginMean * marginMean));

  return {
    n,
    homeExp,
    awayExp,
    projHome: sumHome / n,
    projAway: sumAway / n,
    homeWinProb: homeWins / n,
    marginMean,
    marginSd,
    totalMean: (sumHome + sumAway) / n,
    drives: sumDrives / n,
    margins,
    totals,
    factors,
  };
}

/** Probability the home team covers a home spread (push-aware). */
export function homeCoverProb(sim: GameSim, homeSpread: number): number {
  const need = -homeSpread;
  let win = 0;
  let push = 0;
  for (let i = 0; i < sim.n; i++) {
    const m = sim.margins[i];
    if (m > need) win++;
    else if (m === need) push++;
  }
  const decided = sim.n - push;
  return decided > 0 ? win / decided : 0.5;
}

/** Probability the total goes over a number (push-aware). */
export function overProb(sim: GameSim, line: number): number {
  let over = 0;
  let push = 0;
  for (let i = 0; i < sim.n; i++) {
    const t = sim.totals[i];
    if (t > line) over++;
    else if (t === line) push++;
  }
  const decided = sim.n - push;
  return decided > 0 ? over / decided : 0.5;
}

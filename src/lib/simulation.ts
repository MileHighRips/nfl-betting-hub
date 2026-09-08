import type { Game, ModelFactor, TeamAbbr } from './types';
import { TEAMS } from './teams';
import { LEAGUE_AVG_TOTAL, homeFieldEdge } from './ratings';
import { travelEffect } from './geo';
import type { Ratings } from './form';

/**
 * ============================================================================
 *  MONTE-CARLO GAME SIMULATION ENGINE
 * ============================================================================
 *  Rather than a single closed-form margin, the model builds each team's
 *  expected points from an offense/defense matchup and a full stack of
 *  situational factors, then simulates the game thousands of times as a pair of
 *  correlated scoring outcomes. Every market — spread (push-aware on key
 *  numbers), moneyline, total, team totals — is read off the same simulated
 *  distribution, which keeps them internally consistent.
 * ============================================================================
 */

export const SIM_CONFIG = {
  n: 20000,
  teamScoreSd: 9.9, // NFL single-team points standard deviation
  scoreCorrelation: 0.08, // shared game environment
  restPtPerDay: 0.12,
  restCap: 2.0,
  qbOutSwing: 6.5,
  divisionTighten: 0.9, // rivals play ~10% closer than raw ratings
};

// Deterministic RNG so a given matchup renders identically every time.
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
  margins: Float32Array; // home - away, per sim
  totals: Float32Array;
  factors: ModelFactor[];
}

function weatherPoints(w: Game['context']['weather']): number {
  switch (w) {
    case 'dome':
      return 0.4;
    case 'wind':
      return -1.2;
    case 'rain':
      return -0.8;
    case 'snow':
      return -1.5;
    case 'cold':
      return -0.4;
    default:
      return 0;
  }
}

function kickoffHourEt(iso: string): number {
  // ESPN times are UTC; ET ≈ UTC-4 in September.
  const d = new Date(iso);
  return (d.getUTCHours() + 24 - 4) % 24;
}

export function simulateGame(game: Game, ratings?: Ratings): GameSim {
  const home = game.home;
  const away = game.away;
  const netHome = ratings?.[home] ?? TEAMS[home].rating;
  const netAway = ratings?.[away] ?? TEAMS[away].rating;
  const c = game.context;
  const factors: ModelFactor[] = [];

  // Market total anchors the scoring environment (pace, pass tendencies, most
  // weather are already priced in). Our ratings drive the MARGIN; we only take
  // a light independent lean on the total for adverse weather.
  const marketTotal =
    game.books.reduce((s, b) => s + b.total, 0) / (game.books.length || 1) || LEAGUE_AVG_TOTAL;

  // ---- Expected margin (home perspective) ----
  let margin = netHome - netAway;
  factors.push({
    label: 'Power Ratings',
    detail: `${TEAMS[home].name} ${netHome.toFixed(1)} vs ${TEAMS[away].name} ${netAway.toFixed(1)}`,
    impact: netHome - netAway,
  });

  const hfa = c.neutralSite ? 0 : homeFieldEdge(home);
  margin += hfa;
  if (hfa)
    factors.push({ label: 'Home Field', detail: `${TEAMS[home].name} (${hfa} pts)`, impact: hfa });

  const restAdj = Math.max(
    -SIM_CONFIG.restCap,
    Math.min(SIM_CONFIG.restCap, (c.homeRestDays - c.awayRestDays) * SIM_CONFIG.restPtPerDay),
  );
  if (Math.abs(restAdj) >= 0.1) {
    margin += restAdj;
    factors.push({
      label: 'Rest',
      detail: `${c.homeRestDays}d vs ${c.awayRestDays}d`,
      impact: restAdj,
    });
  }

  const travel = travelEffect(home, away, kickoffHourEt(game.kickoff));
  if (travel.awayPenalty >= 0.05) {
    margin += travel.awayPenalty; // away penalized → home margin up
    factors.push({ label: 'Travel', detail: travel.detail, impact: travel.awayPenalty });
  }

  if (c.homeQbOut) {
    margin -= SIM_CONFIG.qbOutSwing;
    factors.push({
      label: 'QB Out (Home)',
      detail: `${TEAMS[home].name} starter out`,
      impact: -SIM_CONFIG.qbOutSwing,
    });
  }
  if (c.awayQbOut) {
    margin += SIM_CONFIG.qbOutSwing;
    factors.push({
      label: 'QB Out (Away)',
      detail: `${TEAMS[away].name} starter out`,
      impact: SIM_CONFIG.qbOutSwing,
    });
  }

  if (c.divisionGame) {
    margin *= SIM_CONFIG.divisionTighten;
    factors.push({ label: 'Division', detail: 'Rivalry tightens margin', impact: 0 });
  }

  // ---- Expected total (market-anchored, light weather lean) ----
  const wx = weatherPoints(c.weather);
  const wxLean = wx < 0 ? wx * 0.5 : 0; // only adverse weather nudges our total
  const totalExp = marketTotal + wxLean;
  if (wxLean) factors.push({ label: 'Weather', detail: String(c.weather), impact: wxLean });

  // Decompose into team expectations (preserves both margin and total).
  let homeExp = (totalExp + margin) / 2;
  let awayExp = (totalExp - margin) / 2;
  homeExp = Math.max(3, homeExp);
  awayExp = Math.max(3, awayExp);

  // ---- Simulate ----
  const n = SIM_CONFIG.n;
  const sd = SIM_CONFIG.teamScoreSd;
  const rho = SIM_CONFIG.scoreCorrelation;
  const rhoComp = Math.sqrt(1 - rho * rho);
  const rand = mulberry32(hashSeed(game.id));

  const margins = new Float32Array(n);
  const totals = new Float32Array(n);
  let homeWins = 0;
  let sumHome = 0;
  let sumAway = 0;
  let sumMargin = 0;
  let sumMargin2 = 0;

  for (let i = 0; i < n; i++) {
    // Box-Muller for two independent standard normals.
    const u1 = Math.max(1e-9, rand());
    const u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1));
    const z1 = r * Math.cos(2 * Math.PI * u2);
    const z2 = r * Math.sin(2 * Math.PI * u2);

    let h = homeExp + sd * z1;
    let a = awayExp + sd * (rho * z1 + rhoComp * z2);
    h = Math.max(0, Math.round(h));
    a = Math.max(0, Math.round(a));

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
    margins,
    totals,
    factors,
  };
}

/** Probability the home team covers a given home spread (push-aware). */
export function homeCoverProb(sim: GameSim, homeSpread: number): number {
  // Home covers when margin + homeSpread > 0. Split pushes.
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

/** Probability the total goes over a given number (push-aware). */
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

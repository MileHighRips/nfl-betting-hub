import { TEAMS } from './teams';
import { staticDefense } from './ratings';
import { type PropCandidate, type PropMarket } from '@/data/props';
import { americanToProb, confidenceScore, normalCdf } from './odds';
import { getPropResidualSds } from './props-model';
import type { BookLine, Game, LivePropMap, LivePropAltMap, PlayerProp, TeamAbbr } from './types';

/**
 * ============================================================================
 *  PLAYER PROP MODEL
 * ============================================================================
 *  Projects every candidate in a game from the simulated game environment —
 *  each team's simulated points (implied total), game script (margin), and the
 *  opponent's defensive strength — then picks the single best Over OR Under
 *  across the whole field by model edge. When a live prop feed is connected the
 *  real posted line and prices replace the neutral baselines.
 * ============================================================================
 */

const MARKET_SIGMA: Record<PropMarket, number> = {
  'Pass Yards': 46,
  'Rush Yards': 28,
  'Receiving Yards': 27,
  Receptions: 1.9,
  'Pass TDs': 1.05,
  'Pass Attempts': 6.5,
  Completions: 5.0,
  'Rush Attempts': 4.3,
  Interceptions: 0.8,
  'Rush + Rec Yards': 34,
  Sacks: 0.85,
};

/** Real 15-season residual SD when available, else the seed constant. */
function marketSigma(market: PropMarket, ctx?: { isQb?: boolean; isRb?: boolean; line?: number }): number {
  const base = getPropResidualSds()[market] ?? MARKET_SIGMA[market];
  const line = ctx?.line ?? 20;
  // The rush SD (~34) is RB-dominated. QB rushing has far lower variance, so scale
  // it to the QB's own volume — otherwise immobile QBs get false "N+" alt-rush edges.
  if (ctx?.isQb && (market === 'Rush Yards' || market === 'Rush + Rec Yards')) {
    return Math.min(base, Math.max(9, 0.7 * line + 4));
  }
  // The receiving SD (~33) is WR-dominated. A RB's receiving yards swing far less,
  // so scale to volume — otherwise backs get false "40+ receiving" longshot edges.
  if (ctx?.isRb && (market === 'Receiving Yards' || market === 'Rush + Rec Yards')) {
    return Math.min(base, Math.max(12, 0.8 * line + 6));
  }
  return base;
}

/** Players DK posts a passing market for — i.e. the starting QBs in this game. */
function qbNames(game: Game): Set<string> {
  const s = new Set<string>();
  for (const c of game.livePropCandidates ?? []) {
    if (
      c.market === 'Pass Yards' ||
      c.market === 'Pass Attempts' ||
      c.market === 'Completions' ||
      c.market === 'Pass TDs'
    )
      s.add(c.player.toLowerCase());
  }
  return s;
}

/** Rushers who aren't QBs — i.e. the running backs (for receiving-variance scaling). */
function rbNames(game: Game): Set<string> {
  const qbs = qbNames(game);
  const s = new Set<string>();
  for (const c of game.livePropCandidates ?? []) {
    const k = c.player.toLowerCase();
    if ((c.market === 'Rush Yards' || c.market === 'Rush Attempts') && !qbs.has(k)) s.add(k);
  }
  return s;
}

export function propKey(player: string, market: PropMarket): string {
  return `${player.toLowerCase()}|${market}`;
}

interface Env {
  teamMargin: number; // expected margin for the player's team (+ = favored)
  total: number; // game total
  teamImplied: number; // implied points for the player's team
  oppDefense: number; // opponent defensive rating (points; + = stingier)
}

/** Project a candidate's stat line from the game environment + matchup. */
export function projectProp(c: PropCandidate, env: Env): number {
  const tf = env.total / 45; // pace/scoring factor
  const m = env.teamMargin;
  const d = env.oppDefense; // opponent stinginess (points above avg)
  let proj: number;
  switch (c.market) {
    // Trailing teams throw more; scoring lifts volume; tough pass D suppresses.
    case 'Pass Yards':
      proj = c.baseline * (0.82 + 0.18 * tf) * (1 - 0.004 * m) * (1 - 0.02 * d);
      break;
    // Favorites run more (positive script, clock control).
    case 'Rush Yards':
      proj = c.baseline * (0.9 + 0.1 * tf) * (1 + 0.011 * m) * (1 - 0.012 * d);
      break;
    // Volume up in shootouts; slight lift when trailing (garbage-time targets).
    case 'Receiving Yards':
      proj = c.baseline * (0.82 + 0.18 * tf) * (1 - 0.003 * m) * (1 - 0.02 * d);
      break;
    case 'Receptions':
      proj = c.baseline * (0.9 + 0.1 * tf) * (1 - 0.002 * m) * (1 - 0.012 * d);
      break;
    // Trailing teams drop back more → more attempts/completions; tough pass D trims.
    case 'Pass Attempts':
      proj = c.baseline * (0.9 + 0.1 * tf) * (1 - 0.006 * m);
      break;
    case 'Completions':
      proj = c.baseline * (0.9 + 0.1 * tf) * (1 - 0.005 * m) * (1 - 0.01 * d);
      break;
    // Passing TDs rise with scoring and a positive script (more red-zone trips).
    case 'Pass TDs':
      proj = c.baseline * (0.8 + 0.2 * tf) * (1 + 0.004 * m) * (1 - 0.015 * d);
      break;
    // Favorites run more (clock control); interceptions tick up when chasing points.
    case 'Rush Attempts':
      proj = c.baseline * (0.92 + 0.08 * tf) * (1 + 0.012 * m);
      break;
    case 'Interceptions':
      proj = c.baseline * (1 - 0.01 * m);
      break;
    case 'Rush + Rec Yards':
      proj = c.baseline * (0.88 + 0.12 * tf) * (1 - 0.001 * m) * (1 - 0.015 * d);
      break;
    // Pass rush eats when the opponent is trailing and must drop back.
    case 'Sacks':
      proj = c.baseline * (1 + 0.02 * m) * (0.92 + 0.08 * tf);
      break;
    default:
      proj = c.baseline;
  }
  return proj;
}

export interface EvaluatedProp {
  prop: PlayerProp;
  prob: number;
  edge: number;
  z: number;
}

function scriptWord(m: number): string {
  if (m >= 3.5) return 'favored';
  if (m <= -3.5) return 'underdog';
  return 'neutral';
}

function evaluate(
  c: PropCandidate,
  team: TeamAbbr,
  env: Env,
  live: LivePropMap | undefined,
  qbs?: Set<string>,
  rbs?: Set<string>,
): EvaluatedProp {
  const proj = projectProp(c, env);
  const liveLine = live?.[propKey(c.player, c.market)];
  const line = liveLine ? liveLine.line : c.baseline;
  const k = c.player.toLowerCase();
  const sigma = marketSigma(c.market, { isQb: qbs?.has(k), isRb: rbs?.has(k), line });
  const overPrice = liveLine ? liveLine.overPrice : -114;
  const underPrice = liveLine ? liveLine.underPrice : -114;
  const book: PlayerProp['book'] = liveLine ? liveLine.book : 'DraftKings';

  const z = (proj - line) / sigma;
  const probOver = normalCdf(z);
  const takeOver = probOver >= 0.5;
  const prob = takeOver ? probOver : 1 - probOver;
  const price = takeOver ? overPrice : underPrice;
  const edge = prob - americanToProb(price);

  const word = scriptWord(env.teamMargin);
  const dir = takeOver ? 'Over' : 'Under';
  const rationale =
    `Model projects ${proj.toFixed(1)} vs a ${line} line (${Math.round(prob * 100)}% ${dir}). ` +
    `${TEAMS[team].name} implied ~${env.teamImplied.toFixed(0)} pts — a ${word} script ` +
    `${takeOver ? 'supports the Over' : 'points to the Under'}.`;

  return {
    prop: {
      player: c.player,
      team,
      market: c.market,
      line,
      side: takeOver ? 'Over' : 'Under',
      price,
      book,
      projection: Number(proj.toFixed(1)),
      confidence: confidenceScore(prob, edge),
      rationale,
    },
    prob,
    edge,
    z,
  };
}

function consensus(books: BookLine[]) {
  const n = books.length || 1;
  return {
    spread: books.reduce((s, b) => s + b.spread, 0) / n,
    total: books.reduce((s, b) => s + b.total, 0) / n,
  };
}

/** Simulated environment passed from the game engine to anchor prop projections. */
export interface PropSimEnv {
  projHome: number;
  projAway: number;
  marginMean: number;
  totalMean: number;
}

/** Pick the single best prop (Over or Under) across both teams for a game. */
export function bestProp(game: Game, live?: LivePropMap, sim?: PropSimEnv): PlayerProp {
  const candidates = evaluateGameProps(game, live, sim);
  if (!candidates.length) {
    return {
      player: `${TEAMS[game.home].name} skill`,
      team: game.home,
      market: 'Receiving Yards',
      line: 55.5,
      side: 'Over',
      price: -114,
      book: 'DraftKings',
      projection: 55.5,
      confidence: 50,
      rationale: 'No live prop market posted for this game yet.',
    };
  }
  candidates.sort((a, b) => b.prop.confidence - a.prop.confidence || Math.abs(b.z) - Math.abs(a.z));
  return candidates[0].prop;
}

/**
 * Every genuinely +EV prop in a game (edge over the market), highest edge first,
 * one per player. Feeds the "multiple props when there's value" slate.
 */
export function bestProps(
  game: Game,
  live?: LivePropMap,
  sim?: PropSimEnv,
  opts: { minEdge?: number; limit?: number } = {},
): EvaluatedProp[] {
  const { minEdge = 0.02, limit = 4 } = opts;
  const evald = evaluateGameProps(game, live, sim)
    .filter((e) => e.edge >= minEdge)
    .sort((a, b) => b.edge - a.edge);
  const seen = new Set<string>();
  const out: EvaluatedProp[] = [];
  for (const e of evald) {
    const key = e.prop.player.toLowerCase();
    if (seen.has(key)) continue; // one prop per player
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/** Per-team game environment (implied points, script, opponent defense). */
function teamEnvs(game: Game, sim?: PropSimEnv): Map<TeamAbbr, Env> {
  let homeImplied: number, awayImplied: number, homeMargin: number, total: number;
  if (sim) {
    homeImplied = sim.projHome;
    awayImplied = sim.projAway;
    homeMargin = sim.marginMean;
    total = sim.totalMean;
  } else {
    const con = consensus(game.books);
    homeMargin = -con.spread;
    total = con.total;
    homeImplied = (total + homeMargin) / 2;
    awayImplied = (total - homeMargin) / 2;
  }
  return new Map<TeamAbbr, Env>([
    [game.home, { teamMargin: homeMargin, total, teamImplied: homeImplied, oppDefense: staticDefense(game.away) }],
    [game.away, { teamMargin: -homeMargin, total, teamImplied: awayImplied, oppDefense: staticDefense(game.home) }],
  ]);
}

/**
 * Value on available sportsbook alternate ("N+") prop ladders. We anchor each player's
 * projection to their MAIN posted line (so the read is the same disciplined
 * model), then price every real alt rung against it: a rung hits when stat >= N,
 * so its model prob is P(stat > N-0.5). Only rungs that beat the posted price by
 * a real margin survive — genuine book value, never a fabricated number.
 */
export function bestPropAlts(
  game: Game,
  alts: LivePropAltMap | undefined,
  live?: LivePropMap,
  sim?: PropSimEnv,
  opts: { minEdge?: number; limit?: number } = {},
): EvaluatedProp[] {
  if (!alts || !game.livePropCandidates?.length) return [];
  const { minEdge = 0.05, limit = 2 } = opts;
  const envs = teamEnvs(game, sim);
  const out = new Set((game.outPlayers ?? []).map((p) => p.toLowerCase()));
  const qbs = qbNames(game);
  const rbs = rbNames(game);

  // Best rung per player (highest edge), across all markets.
  const bestByPlayer = new Map<string, EvaluatedProp>();
  for (const c of game.livePropCandidates) {
    if (out.has(c.player.toLowerCase())) continue;
    const market = c.market as PropMarket;
    const rungs = alts[propKey(c.player, market)];
    if (!rungs?.length) continue;
    const env = envs.get(c.team);
    if (!env) continue;
    const mainLine = live?.[propKey(c.player, market)]?.line ?? c.line;
    const proj = projectProp({ player: c.player, market, baseline: mainLine }, env);
    const k = c.player.toLowerCase();
    const sigma = marketSigma(market, { isQb: qbs.has(k), isRb: rbs.has(k), line: mainLine });
    for (const rung of rungs) {
      // "N+" means stat >= N; with a half-point continuity correction.
      const prob = normalCdf((proj - (rung.line - 0.5)) / sigma);
      const edge = prob - americanToProb(rung.price);
      if (edge < minEdge || prob >= 0.97 || prob <= 0.05) continue;
      const key = c.player.toLowerCase();
      const prev = bestByPlayer.get(key);
      if (prev && prev.edge >= edge) continue;
      bestByPlayer.set(key, {
        prop: {
          player: c.player,
          team: c.team,
          market,
          line: rung.line,
          side: 'Over',
          price: rung.price,
          book: rung.book ?? 'DraftKings',
          projection: Number(proj.toFixed(1)),
          confidence: confidenceScore(prob, edge),
          rationale: `Model projects ${proj.toFixed(1)} vs the ${rung.line}+ alt rung (${Math.round(prob * 100)}% to hit) at ${rung.price > 0 ? '+' : ''}${rung.price} (${rung.book ?? 'DraftKings'}).`,
          alt: true,
        },
        prob,
        edge,
        z: (proj - (rung.line - 0.5)) / sigma,
      });
    }
  }
  return [...bestByPlayer.values()].sort((a, b) => b.edge - a.edge).slice(0, limit);
}

/** Evaluate every prop candidate in a game against the simulated environment. */
function evaluateGameProps(game: Game, live?: LivePropMap, sim?: PropSimEnv): EvaluatedProp[] {
  const candidates: EvaluatedProp[] = [];

  let homeImplied: number;
  let awayImplied: number;
  let homeMargin: number;
  let total: number;
  if (sim) {
    homeImplied = sim.projHome;
    awayImplied = sim.projAway;
    homeMargin = sim.marginMean;
    total = sim.totalMean;
  } else {
    const con = consensus(game.books);
    homeMargin = -con.spread;
    total = con.total;
    homeImplied = (total + homeMargin) / 2;
    awayImplied = (total - homeMargin) / 2;
  }

  const perTeam: [TeamAbbr, number, number, TeamAbbr][] = [
    [game.home, homeMargin, homeImplied, game.away],
    [game.away, -homeMargin, awayImplied, game.home],
  ];

  const out = new Set((game.outPlayers ?? []).map((p) => p.toLowerCase()));
  const qbs = qbNames(game);
  const rbs = rbNames(game);

  // Only the live DK player pool (current rosters). No stale seed fallback — a
  // missing feed means no prop, never a wrong-team player.
  const liveCands = game.livePropCandidates?.length ? game.livePropCandidates : undefined;

  for (const [team, margin, implied, opp] of perTeam) {
    const env: Env = {
      teamMargin: margin,
      total,
      teamImplied: implied,
      oppDefense: staticDefense(opp),
    };
    const teamCands: PropCandidate[] = liveCands
      ? liveCands
          .filter((c) => c.team === team)
          .map((c) => ({ player: c.player, market: c.market as PropMarket, baseline: c.line }))
      : [];
    for (const c of teamCands) {
      if (out.has(c.player.toLowerCase())) continue; // ruled out — never recommend
      candidates.push(evaluate(c, team, env, live, qbs, rbs));
    }
  }

  return candidates;
}

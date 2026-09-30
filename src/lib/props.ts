import { TEAMS } from './teams';
import { staticDefense } from './ratings';
import { type PropCandidate, type PropMarket } from '@/data/props';
import { americanToProb, confidenceScore, normalCdf } from './odds';
import { getPropResidualSds } from './props-model';
import type { BookLine, Game, LivePropMap, PlayerProp, TeamAbbr } from './types';

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
  Sacks: 0.85,
};

/** Real 15-season residual SD when available, else the seed constant. */
function marketSigma(market: PropMarket): number {
  return getPropResidualSds()[market] ?? MARKET_SIGMA[market];
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
): EvaluatedProp {
  const sigma = marketSigma(c.market);
  const proj = projectProp(c, env);
  const liveLine = live?.[propKey(c.player, c.market)];
  const line = liveLine ? liveLine.line : c.baseline;
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
      candidates.push(evaluate(c, team, env, live));
    }
  }

  return candidates;
}

import type { AltLadder, AltRung, TeamAbbr } from '@/lib/types';

/**
 * Manual alternate-line pins. Use this to paste a book's real posted alternate
 * spread/total ladder for a game without a paid Odds API key — the same pattern
 * as `liveProps.ts`. A connected live feed (ODDS_API_KEY) overrides these.
 *
 * These are REAL book prices you enter; the engine never fabricates a ladder, so
 * if a game has no pin and no live feed, it simply produces no alt pick.
 *
 * `spreadHome`/`spreadAway` rungs are [line, price] on each team's own spread
 * axis (home −2.5 → [-2.5, price]; away +9.5 → [9.5, price]). `over`/`under` are
 * [totalLine, price].
 */
interface ManualAlt {
  away: TeamAbbr;
  home: TeamAbbr;
  spreadHome?: [number, number][];
  spreadAway?: [number, number][];
  over?: [number, number][];
  under?: [number, number][];
}

const MANUAL: ManualAlt[] = [];

const rungs = (pairs?: [number, number][]): AltRung[] | undefined =>
  pairs?.map(([line, price]) => ({ line, price }));

export function manualAltFor(away: TeamAbbr, home: TeamAbbr): AltLadder | undefined {
  const m = MANUAL.find((x) => x.away === away && x.home === home);
  if (!m) return undefined;
  const ladder: AltLadder = {
    spreadHome: rungs(m.spreadHome),
    spreadAway: rungs(m.spreadAway),
    over: rungs(m.over),
    under: rungs(m.under),
  };
  return ladder;
}

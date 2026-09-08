import type { TeamAbbr } from '@/lib/types';

/**
 * Primary prop target per team. Used to synthesize the single highest-confidence
 * prop for LIVE games (weeks with API odds but no seed prop). Baseline is a
 * neutral game line; the model adjusts the projection/side from team strength
 * and game script. Update as depth charts change through the season.
 */
export interface StarProp {
  player: string;
  market: string;
  baseline: number; // neutral over/under line
}

export const STAR_PROPS: Record<TeamAbbr, StarProp> = {
  ARI: { player: 'Marvin Harrison Jr.', market: 'Receiving Yards', baseline: 66.5 },
  ATL: { player: 'Bijan Robinson', market: 'Rush Yards', baseline: 84.5 },
  BAL: { player: 'Lamar Jackson', market: 'Rush Yards', baseline: 47.5 },
  BUF: { player: 'Josh Allen', market: 'Pass Yards', baseline: 244.5 },
  CAR: { player: 'Chuba Hubbard', market: 'Rush Yards', baseline: 62.5 },
  CHI: { player: 'Caleb Williams', market: 'Pass Yards', baseline: 224.5 },
  CIN: { player: "Ja'Marr Chase", market: 'Receiving Yards', baseline: 84.5 },
  CLE: { player: 'Jerry Jeudy', market: 'Receiving Yards', baseline: 58.5 },
  DAL: { player: 'CeeDee Lamb', market: 'Receiving Yards', baseline: 82.5 },
  DEN: { player: 'Courtland Sutton', market: 'Receiving Yards', baseline: 62.5 },
  DET: { player: 'Jahmyr Gibbs', market: 'Rush Yards', baseline: 78.5 },
  GB: { player: 'Josh Jacobs', market: 'Rush Yards', baseline: 74.5 },
  HOU: { player: 'Nico Collins', market: 'Receiving Yards', baseline: 72.5 },
  IND: { player: 'Jonathan Taylor', market: 'Rush Yards', baseline: 82.5 },
  JAX: { player: 'Brian Thomas Jr.', market: 'Receiving Yards', baseline: 72.5 },
  KC: { player: 'Patrick Mahomes', market: 'Pass Yards', baseline: 262.5 },
  LV: { player: 'Brock Bowers', market: 'Receiving Yards', baseline: 64.5 },
  LAC: { player: 'Justin Herbert', market: 'Pass Yards', baseline: 238.5 },
  LAR: { player: 'Puka Nacua', market: 'Receiving Yards', baseline: 86.5 },
  MIA: { player: 'Tyreek Hill', market: 'Receiving Yards', baseline: 74.5 },
  MIN: { player: 'Justin Jefferson', market: 'Receiving Yards', baseline: 84.5 },
  NE: { player: 'Drake Maye', market: 'Pass Yards', baseline: 224.5 },
  NO: { player: 'Chris Olave', market: 'Receiving Yards', baseline: 66.5 },
  NYG: { player: 'Malik Nabers', market: 'Receiving Yards', baseline: 74.5 },
  NYJ: { player: 'Garrett Wilson', market: 'Receiving Yards', baseline: 68.5 },
  PHI: { player: 'Saquon Barkley', market: 'Rush Yards', baseline: 88.5 },
  PIT: { player: 'T.J. Watt', market: 'Sacks', baseline: 0.5 },
  SF: { player: 'Christian McCaffrey', market: 'Rush Yards', baseline: 80.5 },
  SEA: { player: 'Jaxon Smith-Njigba', market: 'Receiving Yards', baseline: 78.5 },
  TB: { player: 'Mike Evans', market: 'Receiving Yards', baseline: 64.5 },
  TEN: { player: 'Calvin Ridley', market: 'Receiving Yards', baseline: 60.5 },
  WAS: { player: 'Jayden Daniels', market: 'Rush Yards', baseline: 44.5 },
};

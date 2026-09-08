import type { TeamAbbr } from '@/lib/types';

/**
 * Player-prop candidate pool. The prop model projects each candidate from the
 * live game environment (implied team total + game script) and picks the best
 * Over OR Under across every candidate in a game. Baselines are neutral
 * per-game expectations; when a live prop feed is connected the real posted
 * line replaces the baseline. Update starters/roles through the season.
 */

export type PropMarket = 'Pass Yards' | 'Rush Yards' | 'Receiving Yards' | 'Receptions' | 'Sacks';

export interface PropCandidate {
  player: string;
  market: PropMarket;
  baseline: number;
}

// 3–4 candidates per team: QB pass, lead RB rush, top WR/TE receiving,
// plus rushing QBs and a marquee pass rusher where relevant.
export const TEAM_PROPS: Record<TeamAbbr, PropCandidate[]> = {
  ARI: [
    { player: 'Kyler Murray', market: 'Pass Yards', baseline: 233.5 },
    { player: 'James Conner', market: 'Rush Yards', baseline: 65.5 },
    { player: 'Marvin Harrison Jr.', market: 'Receiving Yards', baseline: 66.5 },
  ],
  ATL: [
    { player: 'Michael Penix Jr.', market: 'Pass Yards', baseline: 224.5 },
    { player: 'Bijan Robinson', market: 'Rush Yards', baseline: 84.5 },
    { player: 'Drake London', market: 'Receiving Yards', baseline: 72.5 },
  ],
  BAL: [
    { player: 'Lamar Jackson', market: 'Pass Yards', baseline: 218.5 },
    { player: 'Lamar Jackson', market: 'Rush Yards', baseline: 47.5 },
    { player: 'Derrick Henry', market: 'Rush Yards', baseline: 88.5 },
    { player: 'Zay Flowers', market: 'Receiving Yards', baseline: 66.5 },
  ],
  BUF: [
    { player: 'Josh Allen', market: 'Pass Yards', baseline: 244.5 },
    { player: 'Josh Allen', market: 'Rush Yards', baseline: 39.5 },
    { player: 'James Cook', market: 'Rush Yards', baseline: 66.5 },
    { player: 'Khalil Shakir', market: 'Receiving Yards', baseline: 55.5 },
  ],
  CAR: [
    { player: 'Bryce Young', market: 'Pass Yards', baseline: 205.5 },
    { player: 'Chuba Hubbard', market: 'Rush Yards', baseline: 62.5 },
    { player: 'Tetairoa McMillan', market: 'Receiving Yards', baseline: 58.5 },
  ],
  CHI: [
    { player: 'Caleb Williams', market: 'Pass Yards', baseline: 224.5 },
    { player: "D'Andre Swift", market: 'Rush Yards', baseline: 58.5 },
    { player: 'DJ Moore', market: 'Receiving Yards', baseline: 62.5 },
  ],
  CIN: [
    { player: 'Joe Burrow', market: 'Pass Yards', baseline: 264.5 },
    { player: 'Chase Brown', market: 'Rush Yards', baseline: 60.5 },
    { player: "Ja'Marr Chase", market: 'Receiving Yards', baseline: 88.5 },
  ],
  CLE: [
    { player: 'Shedeur Sanders', market: 'Pass Yards', baseline: 202.5 },
    { player: 'Quinshon Judkins', market: 'Rush Yards', baseline: 55.5 },
    { player: 'Jerry Jeudy', market: 'Receiving Yards', baseline: 62.5 },
  ],
  DAL: [
    { player: 'Dak Prescott', market: 'Pass Yards', baseline: 255.5 },
    { player: 'Javonte Williams', market: 'Rush Yards', baseline: 55.5 },
    { player: 'CeeDee Lamb', market: 'Receiving Yards', baseline: 84.5 },
  ],
  DEN: [
    { player: 'Bo Nix', market: 'Pass Yards', baseline: 224.5 },
    { player: 'RJ Harvey', market: 'Rush Yards', baseline: 55.5 },
    { player: 'Courtland Sutton', market: 'Receiving Yards', baseline: 64.5 },
  ],
  DET: [
    { player: 'Jared Goff', market: 'Pass Yards', baseline: 244.5 },
    { player: 'Jahmyr Gibbs', market: 'Rush Yards', baseline: 82.5 },
    { player: 'Amon-Ra St. Brown', market: 'Receiving Yards', baseline: 86.5 },
  ],
  GB: [
    { player: 'Jordan Love', market: 'Pass Yards', baseline: 234.5 },
    { player: 'Josh Jacobs', market: 'Rush Yards', baseline: 74.5 },
    { player: 'Jayden Reed', market: 'Receiving Yards', baseline: 56.5 },
  ],
  HOU: [
    { player: 'C.J. Stroud', market: 'Pass Yards', baseline: 239.5 },
    { player: 'Joe Mixon', market: 'Rush Yards', baseline: 62.5 },
    { player: 'Nico Collins', market: 'Receiving Yards', baseline: 74.5 },
  ],
  IND: [
    { player: 'Daniel Jones', market: 'Pass Yards', baseline: 214.5 },
    { player: 'Jonathan Taylor', market: 'Rush Yards', baseline: 84.5 },
    { player: 'Michael Pittman Jr.', market: 'Receiving Yards', baseline: 62.5 },
  ],
  JAX: [
    { player: 'Trevor Lawrence', market: 'Pass Yards', baseline: 234.5 },
    { player: 'Travis Etienne Jr.', market: 'Rush Yards', baseline: 60.5 },
    { player: 'Brian Thomas Jr.', market: 'Receiving Yards', baseline: 76.5 },
  ],
  KC: [
    { player: 'Patrick Mahomes', market: 'Pass Yards', baseline: 264.5 },
    { player: 'Isiah Pacheco', market: 'Rush Yards', baseline: 60.5 },
    { player: 'Rashee Rice', market: 'Receiving Yards', baseline: 66.5 },
    { player: 'Travis Kelce', market: 'Receiving Yards', baseline: 55.5 },
  ],
  LV: [
    { player: 'Geno Smith', market: 'Pass Yards', baseline: 239.5 },
    { player: 'Ashton Jeanty', market: 'Rush Yards', baseline: 78.5 },
    { player: 'Brock Bowers', market: 'Receiving Yards', baseline: 66.5 },
  ],
  LAC: [
    { player: 'Justin Herbert', market: 'Pass Yards', baseline: 239.5 },
    { player: 'Omarion Hampton', market: 'Rush Yards', baseline: 60.5 },
    { player: 'Ladd McConkey', market: 'Receiving Yards', baseline: 66.5 },
  ],
  LAR: [
    { player: 'Matthew Stafford', market: 'Pass Yards', baseline: 244.5 },
    { player: 'Kyren Williams', market: 'Rush Yards', baseline: 72.5 },
    { player: 'Puka Nacua', market: 'Receiving Yards', baseline: 86.5 },
    { player: 'Davante Adams', market: 'Receiving Yards', baseline: 70.5 },
  ],
  MIA: [
    { player: 'Tua Tagovailoa', market: 'Pass Yards', baseline: 234.5 },
    { player: "De'Von Achane", market: 'Rush Yards', baseline: 66.5 },
    { player: 'Tyreek Hill', market: 'Receiving Yards', baseline: 74.5 },
  ],
  MIN: [
    { player: 'J.J. McCarthy', market: 'Pass Yards', baseline: 214.5 },
    { player: 'Aaron Jones', market: 'Rush Yards', baseline: 58.5 },
    { player: 'Justin Jefferson', market: 'Receiving Yards', baseline: 84.5 },
  ],
  NE: [
    { player: 'Drake Maye', market: 'Pass Yards', baseline: 224.5 },
    { player: 'TreVeyon Henderson', market: 'Rush Yards', baseline: 55.5 },
    { player: 'Stefon Diggs', market: 'Receiving Yards', baseline: 62.5 },
  ],
  NO: [
    { player: 'Tyler Shough', market: 'Pass Yards', baseline: 210.5 },
    { player: 'Alvin Kamara', market: 'Rush Yards', baseline: 62.5 },
    { player: 'Chris Olave', market: 'Receiving Yards', baseline: 66.5 },
  ],
  NYG: [
    { player: 'Russell Wilson', market: 'Pass Yards', baseline: 218.5 },
    { player: 'Cam Skattebo', market: 'Rush Yards', baseline: 55.5 },
    { player: 'Malik Nabers', market: 'Receiving Yards', baseline: 78.5 },
  ],
  NYJ: [
    { player: 'Justin Fields', market: 'Pass Yards', baseline: 200.5 },
    { player: 'Justin Fields', market: 'Rush Yards', baseline: 45.5 },
    { player: 'Breece Hall', market: 'Rush Yards', baseline: 64.5 },
    { player: 'Garrett Wilson', market: 'Receiving Yards', baseline: 68.5 },
  ],
  PHI: [
    { player: 'Jalen Hurts', market: 'Pass Yards', baseline: 218.5 },
    { player: 'Jalen Hurts', market: 'Rush Yards', baseline: 40.5 },
    { player: 'Saquon Barkley', market: 'Rush Yards', baseline: 88.5 },
    { player: 'A.J. Brown', market: 'Receiving Yards', baseline: 72.5 },
  ],
  PIT: [
    { player: 'Aaron Rodgers', market: 'Pass Yards', baseline: 224.5 },
    { player: 'Jaylen Warren', market: 'Rush Yards', baseline: 55.5 },
    { player: 'DK Metcalf', market: 'Receiving Yards', baseline: 66.5 },
    { player: 'T.J. Watt', market: 'Sacks', baseline: 0.6 },
  ],
  SF: [
    { player: 'Brock Purdy', market: 'Pass Yards', baseline: 239.5 },
    { player: 'Christian McCaffrey', market: 'Rush Yards', baseline: 80.5 },
    { player: 'George Kittle', market: 'Receiving Yards', baseline: 58.5 },
  ],
  SEA: [
    { player: 'Sam Darnold', market: 'Pass Yards', baseline: 224.5 },
    { player: 'Kenneth Walker III', market: 'Rush Yards', baseline: 66.5 },
    { player: 'Jaxon Smith-Njigba', market: 'Receiving Yards', baseline: 84.5 },
  ],
  TB: [
    { player: 'Baker Mayfield', market: 'Pass Yards', baseline: 239.5 },
    { player: 'Bucky Irving', market: 'Rush Yards', baseline: 68.5 },
    { player: 'Mike Evans', market: 'Receiving Yards', baseline: 64.5 },
  ],
  TEN: [
    { player: 'Cam Ward', market: 'Pass Yards', baseline: 214.5 },
    { player: 'Tony Pollard', market: 'Rush Yards', baseline: 58.5 },
    { player: 'Calvin Ridley', market: 'Receiving Yards', baseline: 60.5 },
  ],
  WAS: [
    { player: 'Jayden Daniels', market: 'Pass Yards', baseline: 224.5 },
    { player: 'Jayden Daniels', market: 'Rush Yards', baseline: 44.5 },
    { player: 'Jacory Croskey-Merritt', market: 'Rush Yards', baseline: 52.5 },
    { player: 'Terry McLaurin', market: 'Receiving Yards', baseline: 68.5 },
  ],
};

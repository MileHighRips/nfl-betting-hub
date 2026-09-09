import type { FuturesBet, FuturesMarket, TeamAbbr } from '../lib/types';
import { americanToProb, kellyUnits } from '../lib/odds';

interface RawFuture {
  market: FuturesMarket;
  selection: string;
  team?: TeamAbbr;
  book: FuturesBet['book'];
  price: number;
  modelProb: number; // our fair probability
  kenPick?: boolean;
  kenPrediction?: boolean;
  rationale: string;
  tags: string[];
}

const RAW: RawFuture[] = [
  // ---------------- SUPER BOWL ----------------
  {
    market: 'Super Bowl',
    selection: 'Buffalo Bills',
    team: 'BUF',
    book: 'Consensus',
    price: 1000,
    modelProb: 0.12,
    kenPick: true,
    kenPrediction: true,
    rationale:
      "Ken's preseason Super Bowl pick. Best-player-in-football in Josh Allen, new locker-room voices, only slightly off the ideal roster profile. Small now, add on dips.",
    tags: ['Ken Pick', 'Short List'],
  },
  {
    market: 'Super Bowl',
    selection: 'Jacksonville Jaguars',
    team: 'JAX',
    book: 'Consensus',
    price: 3000,
    modelProb: 0.045,
    kenPick: true,
    rationale:
      "Ken's first SB click. The only fringe team whose roster/QB/prior-year profile doesn't match a 30/1 price — should win >2-3% of the time.",
    tags: ['Ken Pick', 'Value', 'Longshot'],
  },
  {
    market: 'Super Bowl',
    selection: 'Los Angeles Rams',
    team: 'LAR',
    book: 'DraftKings',
    price: 500,
    modelProb: 0.16,
    rationale:
      'Most likely winner by roster (most returning good players + Garrett/McDuffie) but priced heavy — little equity to gain from here. Ken is waiting.',
    tags: ['Model Favorite', 'No Bet'],
  },
  {
    market: 'Super Bowl',
    selection: 'Baltimore Ravens',
    team: 'BAL',
    book: 'DraftKings',
    price: 650,
    modelProb: 0.11,
    rationale:
      'Lamar + easy schedule, but historically atypical profile (new coach, roster gaps). Priced low for a prove-it team.',
    tags: ['Fringe'],
  },
  {
    market: 'Super Bowl',
    selection: 'Philadelphia Eagles',
    team: 'PHI',
    book: 'DraftKings',
    price: 750,
    modelProb: 0.1,
    rationale: 'Clean-ish fit with a proven SB-winning QB in Hurts. Fair price, monitor.',
    tags: ['Short List'],
  },
  {
    market: 'Super Bowl',
    selection: 'Seattle Seahawks',
    team: 'SEA',
    book: 'DraftKings',
    price: 1200,
    modelProb: 0.06,
    rationale:
      'Defending champ — repeats are historically rare; reluctant to bet a title team before games.',
    tags: ['Repeat Fade'],
  },
  {
    market: 'Super Bowl',
    selection: 'Kansas City Chiefs',
    team: 'KC',
    book: 'DraftKings',
    price: 900,
    modelProb: 0.08,
    rationale: 'Mahomes back from injury; always live but the AFC gauntlet is real.',
    tags: ['Monitor'],
  },

  // ---------------- MVP ----------------
  {
    market: 'MVP',
    selection: 'Matthew Stafford',
    team: 'LAR',
    book: 'DraftKings',
    price: 1400,
    modelProb: 0.11,
    kenPick: true,
    kenPrediction: true,
    rationale:
      "Ken's MVP bet & prediction. Best team, most likely to win the 1-seed, produced MVP numbers within 12 months. Market mispriced him behind lesser QBs.",
    tags: ['Ken Pick', 'Value'],
  },
  {
    market: 'MVP',
    selection: 'Josh Allen',
    team: 'BUF',
    book: 'DraftKings',
    price: 550,
    modelProb: 0.14,
    rationale:
      'Only QB on Stafford tier to open the year; younger, weak division helps the win-total path.',
    tags: ['Co-Top'],
  },
  {
    market: 'MVP',
    selection: 'Lamar Jackson',
    team: 'BAL',
    book: 'DraftKings',
    price: 700,
    modelProb: 0.11,
    rationale: "The one QB Ken can't argue against — third on his board.",
    tags: ['Short List'],
  },
  {
    market: 'MVP',
    selection: 'Dak Prescott',
    team: 'DAL',
    book: 'DraftKings',
    price: 2500,
    modelProb: 0.045,
    rationale:
      "Ken's stated 2nd-favorite price after Stafford; tier gap vs Herbert/Burrow looks off.",
    tags: ['Value Watch'],
  },
  {
    market: 'MVP',
    selection: 'Joe Burrow',
    team: 'CIN',
    book: 'DraftKings',
    price: 1000,
    modelProb: 0.05,
    rationale: 'Great numbers likely, but no defense caps the win threshold needed for MVP.',
    tags: ['Stat-Only'],
  },
  {
    market: 'MVP',
    selection: 'Patrick Mahomes',
    team: 'KC',
    book: 'DraftKings',
    price: 750,
    modelProb: 0.09,
    rationale: 'Coming off injury; pedigree keeps him top-of-board but not a value.',
    tags: ['Monitor'],
  },

  // ---------------- OFFENSIVE PLAYER OF THE YEAR ----------------
  {
    market: 'Offensive Player of the Year',
    selection: 'Chris Olave',
    team: 'NO',
    book: 'Consensus',
    price: 10000,
    modelProb: 0.02,
    kenPick: true,
    rationale:
      "Ken's 100/1 flier. Outrageous production, mid-QB (Shough won't steal credit), and near 1-to-1 correlation with Saints making a surprise playoff push.",
    tags: ['Ken Pick', 'Longshot', 'Mid-QB'],
  },
  {
    market: 'Offensive Player of the Year',
    selection: 'Bijan Robinson',
    team: 'ATL',
    book: 'DraftKings',
    price: 900,
    modelProb: 0.12,
    kenPrediction: true,
    rationale:
      "Ken's OPOY prediction. Bell-cow usage + mid QB room = all the credit flows to Bijan. Fits the lead-the-league-in-yards template.",
    tags: ['Ken Prediction', 'Mid-QB'],
  },
  {
    market: 'Offensive Player of the Year',
    selection: "Ja'Marr Chase",
    team: 'CIN',
    book: 'DraftKings',
    price: 550,
    modelProb: 0.14,
    rationale:
      'Can lead the league in receiving, but Burrow is a credit-vacuum QB (Mid-QB asterisk).',
    tags: ['Elite Usage', 'QB Asterisk'],
  },
  {
    market: 'Offensive Player of the Year',
    selection: 'Jahmyr Gibbs',
    team: 'DET',
    book: 'DraftKings',
    price: 800,
    modelProb: 0.09,
    rationale: 'Explosive, but time-share risk and Goff can share credit.',
    tags: ['Watch'],
  },
  {
    market: 'Offensive Player of the Year',
    selection: 'Puka Nacua',
    team: 'LAR',
    book: 'DraftKings',
    price: 1200,
    modelProb: 0.07,
    rationale:
      'Massive target volume, but Stafford MVP case eats credit (Mid-QB theory works against him).',
    tags: ['QB Asterisk'],
  },

  // ---------------- DEFENSIVE PLAYER OF THE YEAR ----------------
  {
    market: 'Defensive Player of the Year',
    selection: 'Will Anderson Jr.',
    team: 'HOU',
    book: 'DraftKings',
    price: 750,
    modelProb: 0.18,
    kenPick: true,
    kenPrediction: true,
    rationale:
      "Ken's DPOY bet & prediction. Most likely of the big-4 to hit every phase: sacks, top-5 defense, 10+ wins, mid-QB (Stroud). Opens vs Allen & Burrow — spotlight games.",
    tags: ['Ken Pick', 'Value', 'Pedigree'],
  },
  {
    market: 'Defensive Player of the Year',
    selection: 'T.J. Watt',
    team: 'PIT',
    book: 'DraftKings',
    price: 3000,
    modelProb: 0.06,
    kenPick: true,
    rationale:
      "Ken's contrarian buy — Watt's 'stock' is at an all-time low with real upside. Fresh scheme voice, still elite pedigree. Buy the trough.",
    tags: ['Ken Pick', 'Value Trough'],
  },
  {
    market: 'Defensive Player of the Year',
    selection: 'Myles Garrett',
    team: 'LAR',
    book: 'DraftKings',
    price: 450,
    modelProb: 0.07,
    rationale:
      "Ken's fade. Priced at a career spike (record + trade). Joins a #1 pass offense / MVP-QB team — Mid-QB theory says little oxygen for a defender.",
    tags: ['Fade', 'Spike'],
  },
  {
    market: 'Defensive Player of the Year',
    selection: 'Aidan Hutchinson',
    team: 'DET',
    book: 'DraftKings',
    price: 650,
    modelProb: 0.12,
    rationale: 'Sack machine, but risk of piling stats on a mediocre defense that just misses.',
    tags: ['Short List'],
  },
  {
    market: 'Defensive Player of the Year',
    selection: 'Nik Bonitto',
    team: 'DEN',
    book: 'DraftKings',
    price: 1400,
    modelProb: 0.08,
    rationale:
      'Denver is an ideal DPOY home; 4th on Ken\u2019s big board but a viable 20-sack winner.',
    tags: ['Short List'],
  },

  // ---------------- OFFENSIVE ROOKIE OF THE YEAR ----------------
  {
    market: 'Offensive Rookie of the Year',
    selection: 'Carnell Tate',
    book: 'DraftKings',
    price: 1200,
    modelProb: 0.09,
    kenPrediction: true,
    rationale:
      "Ken's OROY prediction (with a shrug) — high pick expected to play immediate heavy snaps, which is the whole ballgame for this award.",
    tags: ['Ken Prediction', 'Role'],
  },
  {
    market: 'Offensive Rookie of the Year',
    selection: 'Jeremiyah Love',
    book: 'DraftKings',
    price: 900,
    modelProb: 0.05,
    rationale:
      'Ken stayaway — RB on a projected bad team + high-ankle sprain. Usage & game-script both work against him.',
    tags: ['Fade', 'Injury'],
  },
  {
    market: 'Offensive Rookie of the Year',
    selection: 'Jordyn Tyson',
    team: 'NO',
    book: 'DraftKings',
    price: 1400,
    modelProb: 0.06,
    rationale:
      'Part of the Saints Shough/Olave connection that defines their ceiling; wait for a role signal.',
    tags: ['Watch'],
  },
  {
    market: 'Offensive Rookie of the Year',
    selection: 'Cam Ward',
    team: 'TEN',
    book: 'DraftKings',
    price: 1000,
    modelProb: 0.07,
    rationale:
      'QBs win OROY when they start all year and the team over-performs — monitor Titans script.',
    tags: ['Watch'],
  },

  // ---------------- DEFENSIVE ROOKIE OF THE YEAR ----------------
  {
    market: 'Defensive Rookie of the Year',
    selection: 'David Bailey',
    book: 'DraftKings',
    price: 1200,
    modelProb: 0.1,
    kenPrediction: true,
    rationale:
      "Ken's DROY prediction. Edge rushers who get snaps rack up the counting stat (sacks) voters reward.",
    tags: ['Ken Prediction', 'Counting Stat'],
  },
  {
    market: 'Defensive Rookie of the Year',
    selection: 'Abdul Carter',
    team: 'NYG',
    book: 'DraftKings',
    price: 700,
    modelProb: 0.12,
    rationale: 'Premium pass-rush pedigree; sacks travel in this market.',
    tags: ['Favorite'],
  },

  // ---------------- COACH OF THE YEAR ----------------
  {
    market: 'Coach of the Year',
    selection: 'Aaron Glenn',
    team: 'NYJ',
    book: 'DraftKings',
    price: 2500,
    modelProb: 0.09,
    kenPick: true,
    kenPrediction: true,
    rationale:
      "Ken's COY bet & prediction. Priced as near a 'Jets make playoffs' proxy (25/1 vs ~8/1 playoff). Longest drought in the four majors — the story wins tiebreakers.",
    tags: ['Ken Pick', 'Story', 'Playoff Proxy'],
  },
  {
    market: 'Coach of the Year',
    selection: 'John Harbaugh',
    team: 'BAL',
    book: 'DraftKings',
    price: 650,
    modelProb: 0.07,
    rationale:
      'Market favorite — but +650 preseason is short and expectations are being priced in, raising his bar.',
    tags: ['Fade', 'Expectations'],
  },
  {
    market: 'Coach of the Year',
    selection: 'Kevin Stefanski',
    team: 'ATL',
    book: 'DraftKings',
    price: 1400,
    modelProb: 0.08,
    rationale:
      'Low expectations (7.5 total), talented roster, a QB that clicks would make him a 3-time winner. Short list.',
    tags: ['Short List'],
  },
  {
    market: 'Coach of the Year',
    selection: 'Kellen Moore',
    team: 'NO',
    book: 'DraftKings',
    price: 2000,
    modelProb: 0.06,
    rationale: '10+ wins with a mid QB = tons of credit; a real surprise-team candidate.',
    tags: ['Short List'],
  },
  {
    market: 'Coach of the Year',
    selection: 'Robert Saleh',
    team: 'TEN',
    book: 'DraftKings',
    price: 1600,
    modelProb: 0.06,
    rationale:
      'Following the Callahan failure, "next guy" bump + a bad prior pass D that should regress up.',
    tags: ['Short List', 'Pass-D Regression'],
  },

  // ---------------- COMEBACK PLAYER OF THE YEAR ----------------
  {
    market: 'Comeback Player of the Year',
    selection: 'Patrick Mahomes',
    team: 'KC',
    book: 'DraftKings',
    price: 250,
    modelProb: 0.3,
    kenPrediction: true,
    rationale:
      "Ken's prediction, but with a caveat: he must actually be great AND the Chiefs (only -185 to make playoffs) must get in. Not the free money it looks like.",
    tags: ['Ken Prediction', 'Caveat'],
  },
  {
    market: 'Comeback Player of the Year',
    selection: 'Jayden Daniels',
    team: 'WAS',
    book: 'DraftKings',
    price: 450,
    modelProb: 0.16,
    rationale: 'Loud comeback story off a lost season; needs big stats + a playoff push.',
    tags: ['Short List'],
  },
  {
    market: 'Comeback Player of the Year',
    selection: 'Kyler Murray',
    team: 'ARI',
    book: 'DraftKings',
    price: 800,
    modelProb: 0.09,
    rationale:
      'Missed 12 games; quieter story since Arizona struggled, but a legit 1-2-3 market opener.',
    tags: ['Short List'],
  },

  // ---------------- WIN TOTALS ----------------
  {
    market: 'Win Total',
    selection: 'New York Jets OVER 5.5',
    team: 'NYJ',
    book: 'DraftKings',
    price: -110,
    modelProb: 0.6,
    kenPick: true,
    rationale:
      "Ken's bet. Worst pass D in NFL history regresses hard; QB upgrade Fields→Geno; market rates them like an abomination. Ken's surprise team.",
    tags: ['Ken Pick', 'Pass-D Regression'],
  },
  {
    market: 'Win Total',
    selection: 'Tennessee Titans OVER 6.5',
    team: 'TEN',
    book: 'DraftKings',
    price: -105,
    modelProb: 0.57,
    kenPick: true,
    rationale:
      "Ken's bet. 30th pass D regresses up; Callahan failure removed, Daboll competent OC. Bottom-quartile pass-D over angle (65% hit rate ex-rookie QBs).",
    tags: ['Ken Pick', 'Pass-D Regression'],
  },
  {
    market: 'Win Total',
    selection: 'Cincinnati Bengals UNDER 9.5',
    team: 'CIN',
    book: 'DraftKings',
    price: -110,
    modelProb: 0.58,
    rationale:
      'Ken has ridden this under for years — no defensive investment (Golden as DC), market perennially overrates them. Under 3 straight seasons.',
    tags: ['Trend', 'Under'],
  },
  {
    market: 'Win Total',
    selection: 'New England Patriots UNDER 9.5',
    team: 'NE',
    book: 'DraftKings',
    price: -112,
    modelProb: 0.55,
    rationale:
      'Ken generally fades the Super Bowl loser (avg ~3.5 fewer wins). 9.5 is a big number given the Vrabel-era uncertainty.',
    tags: ['SB Loser Fade'],
  },

  // ---------------- DIVISION ----------------
  {
    market: 'Division',
    selection: 'Buffalo Bills (AFC East)',
    team: 'BUF',
    book: 'DraftKings',
    price: -200,
    modelProb: 0.68,
    rationale: 'Class of a weak division; correlates with the SB and MVP positions.',
    tags: ['Correlated'],
  },
  {
    market: 'Division',
    selection: 'Los Angeles Rams (NFC West)',
    team: 'LAR',
    book: 'DraftKings',
    price: 120,
    modelProb: 0.48,
    rationale:
      'Best roster but must beat the defending-champ Seahawks in-division — plus money is fair.',
    tags: ['Value'],
  },
];

export const FUTURES: FuturesBet[] = RAW.map((r, i) => {
  const marketProb = americanToProb(r.price);
  const edge = r.modelProb - marketProb;
  const units = kellyUnits(r.modelProb, r.price);
  const confidence = Math.max(1, Math.min(99, Math.round(r.modelProb * 100)));
  return {
    id: `fut-${i}-${r.market}-${r.selection}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    market: r.market,
    selection: r.selection,
    team: r.team,
    book: r.book,
    price: r.price,
    marketProb,
    modelProb: r.modelProb,
    edge,
    confidence,
    units,
    kenPick: !!r.kenPick,
    kenPrediction: !!r.kenPrediction,
    rationale: r.rationale,
    tags: r.tags,
  };
});

export const FUTURES_MARKETS: FuturesMarket[] = [
  'Super Bowl',
  'MVP',
  'Offensive Player of the Year',
  'Defensive Player of the Year',
  'Offensive Rookie of the Year',
  'Defensive Rookie of the Year',
  'Coach of the Year',
  'Comeback Player of the Year',
  'Win Total',
  'Division',
];

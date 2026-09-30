// Core domain types for the NFL Betting Hub.

export type TeamAbbr =
  | 'ARI'
  | 'ATL'
  | 'BAL'
  | 'BUF'
  | 'CAR'
  | 'CHI'
  | 'CIN'
  | 'CLE'
  | 'DAL'
  | 'DEN'
  | 'DET'
  | 'GB'
  | 'HOU'
  | 'IND'
  | 'JAX'
  | 'KC'
  | 'LV'
  | 'LAC'
  | 'LAR'
  | 'MIA'
  | 'MIN'
  | 'NE'
  | 'NO'
  | 'NYG'
  | 'NYJ'
  | 'PHI'
  | 'PIT'
  | 'SF'
  | 'SEA'
  | 'TB'
  | 'TEN'
  | 'WAS';

export interface Team {
  abbr: TeamAbbr;
  city: string;
  name: string;
  conference: 'AFC' | 'NFC';
  division: 'East' | 'North' | 'South' | 'West';
  gameId?: string;
  pickType?: PickType;
  side?: string;
  line?: number;
  player?: string;
  propMarket?: string;
  primary: string;
  secondary: string;
  /** Preseason/in-season power rating on a points scale (neutral field). */
  rating: number;
  /** 2026 market win total (Ken guide + market). */
  winTotal: number;
  /** Previous-year pass defense rank (1 = best). Feeds Ken's regression angle. */
  passDefRankPrev: number;
  /** Previous-year DVOA rank (1 = best). */
  dvoaRankPrev: number;
  /** Whether the starting QB has a top-10 PFF passing season in his history. */
  qbHasEliteSeason: boolean;
  /** "Mid QB" flag per Ken's Mid-QB Theory (not a big-name/elite credit vacuum). */
  midQb: boolean;
  /** First-time full-season starting QB in 2026. */
  rookieQb: boolean;
}

export interface BookLine {
  book: 'DraftKings' | 'FanDuel';
  spread: number; // home team spread, e.g. -3.5
  spreadPriceHome: number; // american odds
  spreadPriceAway: number;
  total: number;
  overPrice: number;
  underPrice: number;
  moneylineHome: number;
  moneylineAway: number;
  openSpread?: number; // opening home spread (for line-movement / stale detection)
  openTotal?: number; // opening total
}

export interface PlayerProp {
  player: string;
  team: TeamAbbr;
  market: string; // e.g. "Passing Yards"
  line: number;
  side: 'Over' | 'Under';
  price: number; // american odds
  book: 'DraftKings' | 'FanDuel';
  projection: number; // model projection
  confidence: number; // 0-100
  rationale: string;
}

export interface LivePropLine {
  line: number;
  overPrice: number;
  underPrice: number;
  book: 'DraftKings' | 'FanDuel';
}
/** Live posted prop lines, keyed by `${playerLower}|${market}`. */
export type LivePropMap = Record<string, LivePropLine>;

export interface Game {
  id: string;
  week: number;
  season: number;
  kickoff: string; // ISO
  home: TeamAbbr;
  away: TeamAbbr;
  books: BookLine[];
  prop: PlayerProp;
  /** Contextual factors used by the model. */
  context: GameContext;
  /** Live game state (from ESPN). */
  status?: 'pre' | 'in' | 'post';
  statusDetail?: string;
  homeScore?: number;
  awayScore?: number;
  /** Live posted prop lines when a prop feed is connected (transient). */
  livePropLines?: LivePropMap;
  /** Real per-game player pool from the live DK feed (current rosters). */
  livePropCandidates?: { player: string; market: string; team: TeamAbbr; line: number }[];
  /** Live DraftKings anytime-TD scorer odds for this game. */
  anytimeTdCandidates?: { player: string; team: TeamAbbr; price: number }[];
  /** Names of players ruled out (from the injuries proxy) — excluded from props. */
  outPlayers?: string[];
}

export interface GameContext {
  homeRestDays: number;
  awayRestDays: number;
  homeQbOut?: boolean;
  awayQbOut?: boolean;
  /** Expected-points penalty from key non-QB injuries (WR1/RB1 out, etc.). */
  homeInjuryPenalty?: number;
  awayInjuryPenalty?: number;
  divisionGame: boolean;
  neutralSite?: boolean;
  weather?: 'dome' | 'clear' | 'wind' | 'rain' | 'snow' | 'cold';
  /** Live forecast (Open-Meteo) for outdoor games. */
  windMph?: number;
  precip?: number; // mm/hr at kickoff
  tempF?: number;
  notes?: string;
}

export type PickType = 'Spread' | 'Moneyline' | 'Total' | 'Prop';

export interface ModelPick {
  gameId: string;
  type: PickType;
  selection: string; // human readable, e.g. "LAR -3.5"
  side: string; // machine key
  book: 'DraftKings' | 'FanDuel';
  price: number;
  line: number;
  marketProb: number; // vig-removed implied prob
  modelProb: number; // model probability
  edge: number; // modelProb - marketProb
  confidence: number; // 0-100 display confidence
  units: number; // recommended stake in units
  trueUnits?: number; // conviction stake (uncapped quarter-Kelly), for the slate
  player?: string;
  propMarket?: string;
  isUnderdogUpset?: boolean;
  situational?: string; // validated situational edge tag (e.g. rest/blowout total)
  factors: ModelFactor[];
}

export interface ModelFactor {
  label: string;
  detail: string;
  impact: number; // signed contribution (points or prob)
}

export type FuturesMarket =
  | 'Super Bowl'
  | 'MVP'
  | 'Offensive Player of the Year'
  | 'Defensive Player of the Year'
  | 'Offensive Rookie of the Year'
  | 'Defensive Rookie of the Year'
  | 'Coach of the Year'
  | 'Comeback Player of the Year'
  | 'Win Total'
  | 'Division';

export interface FuturesBet {
  id: string;
  market: FuturesMarket;
  selection: string;
  team?: TeamAbbr;
  book: 'DraftKings' | 'FanDuel' | 'Consensus' | 'Kalshi';
  price: number; // american odds
  marketProb: number;
  modelProb: number;
  edge: number;
  confidence: number;
  units: number;
  kenPick: boolean; // Ken Barkley actually bet this
  kenPrediction?: boolean; // Ken's preseason prediction (not necessarily a bet)
  rationale: string;
  tags: string[]; // e.g. ["Mid-QB", "Pass-D Regression", "Value Spike Fade"]
}

export interface PlacedBet {
  id: string;
  placedAt: string; // ISO
  description: string;
  market: string; // "Week 1 · Spread", "Futures · MVP", etc.
  gameId?: string;
  pickType?: PickType;
  side?: string;
  line?: number;
  player?: string;
  propMarket?: string;
  price: number; // american odds
  stakeUnits: number;
  unitSize: number; // dollars per unit at time of bet
  status: 'pending' | 'won' | 'lost' | 'push';
  /** True when the user hand-set the outcome — auto-grading must not override it. */
  manualStatus?: boolean;
  confidence?: number;
  source?: 'model' | 'ken' | 'manual';
}

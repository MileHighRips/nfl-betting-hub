import type { PickType, TeamAbbr } from '@/lib/types';

export interface HistoricalPickOverride {
  type: PickType;
  selection: string;
  side: string;
  line: number;
  price: number;
  modelProb: number;
  marketProb: number;
  edge: number;
  confidence: number;
  units: number;
  player?: string;
  team?: TeamAbbr;
  market?: string;
  propSide?: 'Over' | 'Under';
  projection?: number;
  rationale?: string;
  isUnderdogUpset?: boolean;
}

export interface HistoricalGamePicks {
  away: TeamAbbr;
  home: TeamAbbr;
  suppressMoneyline?: boolean;
  picks: HistoricalPickOverride[];
}

export const WEEK1_HISTORICAL_PICKS: HistoricalGamePicks[] = [
  {
    away: 'NE',
    home: 'SEA',
    picks: [
      {
        type: 'Spread',
        selection: 'Seahawks -3.0',
        side: 'home_spread',
        line: -3,
        price: -118,
        modelProb: 0.6,
        marketProb: 0.514,
        edge: 0.086,
        confidence: 60,
        units: 1,
      },
      {
        type: 'Moneyline',
        selection: 'Seahawks ML',
        side: 'home_ml',
        line: 0,
        price: -170,
        modelProb: 0.66,
        marketProb: 0.58,
        edge: 0.08,
        confidence: 66,
        units: 1,
      },
      {
        type: 'Prop',
        selection: 'Sam Darnold Under 224.5 Pass Yards',
        side: 'prop',
        line: 224.5,
        price: -114,
        modelProb: 0.61,
        marketProb: 0.537,
        edge: 0.077,
        confidence: 61,
        units: 1,
        player: 'Sam Darnold',
        team: 'SEA',
        market: 'Pass Yards',
        propSide: 'Under',
        projection: 203.5,
        rationale: 'Historical Week 1 snapshot from Locky Lines Week 1 Bets.pdf.',
      },
    ],
  },
  {
    away: 'SF',
    home: 'LAR',
    suppressMoneyline: true,
    picks: [
      {
        type: 'Spread',
        selection: '49ers +3.5',
        side: 'away_spread',
        line: 3.5,
        price: -102,
        modelProb: 0.53,
        marketProb: 0.487,
        edge: 0.043,
        confidence: 53,
        units: 0.33,
      },
      {
        type: 'Moneyline',
        selection: '49ers ML (upset)',
        side: 'away_ml',
        line: 0,
        price: 170,
        modelProb: 0.47,
        marketProb: 0.403,
        edge: 0.067,
        confidence: 47,
        units: 0.85,
        isUnderdogUpset: true,
      },
    ],
  },
];

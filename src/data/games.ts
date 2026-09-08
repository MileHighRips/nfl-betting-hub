import type { BookLine, Game, PlayerProp, TeamAbbr } from '../lib/types';

/**
 * Week 1 2026 seed slate (fallback layer). All 32 teams appear once.
 * Lines approximate opener markets; when a free odds API key is present the
 * live feed overrides these numbers. Props are the single highest-confidence
 * look per game per the model.
 */

interface Seed {
  away: TeamAbbr;
  home: TeamAbbr;
  kickoff: string;
  spread: number; // home spread (DK)
  total: number;
  mlHome: number;
  mlAway: number;
  division: boolean;
  weather?: Game['context']['weather'];
  prop: Omit<PlayerProp, 'book'>;
  notes?: string;
}

const SEEDS: Seed[] = [
  {
    away: 'DAL',
    home: 'PHI',
    kickoff: '2026-09-10T20:20:00-04:00',
    spread: -6.5,
    total: 45.5,
    mlHome: -275,
    mlAway: 220,
    division: true,
    prop: {
      player: 'Saquon Barkley',
      team: 'PHI',
      market: 'Rush Yards',
      line: 92.5,
      side: 'Over',
      price: -114,
      projection: 104,
      confidence: 71,
      rationale:
        'Elite prior usage (250+ carry pedigree). Ken OPOY usage template — heavy early-down volume vs a Cowboys front that ranked bottom-third vs the run.',
    },
    notes: 'Thursday NFL Kickoff.',
  },
  {
    away: 'KC',
    home: 'LAC',
    kickoff: '2026-09-13T16:25:00-04:00',
    spread: 1.5,
    total: 46.0,
    mlHome: 105,
    mlAway: -125,
    division: true,
    prop: {
      player: 'Justin Herbert',
      team: 'LAC',
      market: 'Pass Yards',
      line: 244.5,
      side: 'Over',
      price: -112,
      projection: 263,
      confidence: 64,
      rationale:
        'Herbert has a top-10 PFF passing season on file; game script as a home dog vs KC leans pass-heavy.',
    },
  },
  {
    away: 'BAL',
    home: 'BUF',
    kickoff: '2026-09-13T20:20:00-04:00',
    spread: -2.5,
    total: 48.5,
    mlHome: -145,
    mlAway: 122,
    division: false,
    prop: {
      player: 'Lamar Jackson',
      team: 'BAL',
      market: 'Rush Yards',
      line: 48.5,
      side: 'Over',
      price: -118,
      projection: 61,
      confidence: 68,
      rationale:
        'Two MVP-caliber duals; Lamar rushing floor is stable and Buffalo funnels QBs to the ground.',
    },
    notes: 'Marquee AFC heavyweight.',
  },
  {
    away: 'CIN',
    home: 'CLE',
    kickoff: '2026-09-13T13:00:00-04:00',
    spread: 4.0,
    total: 42.5,
    mlHome: 158,
    mlAway: -190,
    division: true,
    prop: {
      player: "Ja'Marr Chase",
      team: 'CIN',
      market: 'Receiving Yards',
      line: 88.5,
      side: 'Over',
      price: -115,
      projection: 101,
      confidence: 70,
      rationale:
        'Target monster with a 134+ target profile; Browns secondary regresses off an unsustainable prior year.',
    },
  },
  {
    away: 'TB',
    home: 'ATL',
    kickoff: '2026-09-13T13:00:00-04:00',
    spread: 1.0,
    total: 45.5,
    mlHome: -102,
    mlAway: -118,
    division: true,
    prop: {
      player: 'Bijan Robinson',
      team: 'ATL',
      market: 'Rush Yards',
      line: 92.5,
      side: 'Over',
      price: -116,
      projection: 106,
      confidence: 72,
      rationale:
        "Ken's OPOY preseason prediction. Bell-cow usage, mid-QB room means the offense runs through Bijan.",
    },
  },
  {
    away: 'HOU',
    home: 'IND',
    kickoff: '2026-09-13T13:00:00-04:00',
    spread: 1.0,
    total: 44.0,
    mlHome: -104,
    mlAway: -116,
    division: true,
    prop: {
      player: 'Jonathan Taylor',
      team: 'IND',
      market: 'Rush Yards',
      line: 88.5,
      side: 'Over',
      price: -113,
      projection: 99,
      confidence: 66,
      rationale:
        'Colts lean run-first with a mid QB; Taylor volume is league-leading caliber when healthy.',
    },
  },
  {
    away: 'NYJ',
    home: 'NE',
    kickoff: '2026-09-13T13:00:00-04:00',
    spread: -6.0,
    total: 42.5,
    mlHome: -255,
    mlAway: 205,
    division: true,
    prop: {
      player: 'Drake Maye',
      team: 'NE',
      market: 'Pass Yards',
      line: 228.5,
      side: 'Over',
      price: -114,
      projection: 244,
      confidence: 63,
      rationale:
        'Maye earned a top-4 PFF passing grade last year vs the worst pass defense in NFL history (Jets, 0 INTs).',
    },
  },
  {
    away: 'LV',
    home: 'DEN',
    kickoff: '2026-09-13T16:05:00-04:00',
    spread: -7.5,
    total: 43.5,
    mlHome: -340,
    mlAway: 270,
    division: true,
    prop: {
      player: 'Courtland Sutton',
      team: 'DEN',
      market: 'Receiving Yards',
      line: 64.5,
      side: 'Over',
      price: -115,
      projection: 74,
      confidence: 62,
      rationale:
        'Denver defense sets up short fields; Sutton is the clear alpha target in a get-right home spot.',
    },
  },
  {
    away: 'ARI',
    home: 'SF',
    kickoff: '2026-09-13T16:25:00-04:00',
    spread: -7.0,
    total: 45.5,
    mlHome: -300,
    mlAway: 240,
    division: true,
    prop: {
      player: 'Christian McCaffrey',
      team: 'SF',
      market: 'Rush Yards',
      line: 82.5,
      side: 'Over',
      price: -118,
      projection: 94,
      confidence: 67,
      rationale: 'Shanahan feeds CMC as a home favorite; positive script maximizes carries.',
    },
  },
  {
    away: 'TEN',
    home: 'JAX',
    kickoff: '2026-09-13T13:00:00-04:00',
    spread: -6.5,
    total: 43.0,
    mlHome: -275,
    mlAway: 220,
    division: true,
    prop: {
      player: 'Brian Thomas Jr.',
      team: 'JAX',
      market: 'Receiving Yards',
      line: 74.5,
      side: 'Over',
      price: -114,
      projection: 85,
      confidence: 65,
      rationale:
        "Ken's Jaguars 30/1 SB flier hinges on this offense clicking; BTJ is the ascending focal point vs a bottom-tier Titans pass D.",
    },
  },
  {
    away: 'NO',
    home: 'CAR',
    kickoff: '2026-09-13T13:00:00-04:00',
    spread: -3.0,
    total: 42.0,
    mlHome: -155,
    mlAway: 130,
    division: true,
    prop: {
      player: 'Chris Olave',
      team: 'NO',
      market: 'Receiving Yards',
      line: 68.5,
      side: 'Over',
      price: -113,
      projection: 79,
      confidence: 66,
      rationale:
        "Ken's 100/1 OPOY flier. Olave production is outrageous and 1-to-1 correlated with Saints success.",
    },
  },
  {
    away: 'NYG',
    home: 'WAS',
    kickoff: '2026-09-13T13:00:00-04:00',
    spread: -6.0,
    total: 45.5,
    mlHome: -255,
    mlAway: 205,
    division: true,
    prop: {
      player: 'Jayden Daniels',
      team: 'WAS',
      market: 'Rush Yards',
      line: 45.5,
      side: 'Over',
      price: -120,
      projection: 57,
      confidence: 69,
      rationale:
        'Daniels rushing floor is elite; designed runs vs a rebuilding Giants front give a stable Over.',
    },
  },
  {
    away: 'GB',
    home: 'CHI',
    kickoff: '2026-09-14T20:15:00-04:00',
    spread: 2.0,
    total: 45.5,
    mlHome: 108,
    mlAway: -128,
    division: true,
    prop: {
      player: 'Josh Jacobs',
      team: 'GB',
      market: 'Rush Yards',
      line: 78.5,
      side: 'Over',
      price: -114,
      projection: 89,
      confidence: 64,
      rationale: 'Packers lean on Jacobs to control a road divisional MNF opener.',
    },
    notes: 'Monday Night Football.',
  },
  {
    away: 'MIA',
    home: 'PIT',
    kickoff: '2026-09-13T13:00:00-04:00',
    spread: -4.0,
    total: 44.0,
    mlHome: -190,
    mlAway: 158,
    division: false,
    prop: {
      player: 'T.J. Watt',
      team: 'PIT',
      market: 'Sacks',
      line: 0.5,
      side: 'Over',
      price: -160,
      projection: 0.9,
      confidence: 66,
      rationale:
        "Ken's DPOY value fade-the-narrative buy at +3000. Watt vs a shaky Miami tackle situation at home is a strong sack spot.",
    },
  },
  {
    away: 'DET',
    home: 'MIN',
    kickoff: '2026-09-13T13:00:00-04:00',
    spread: 2.5,
    total: 47.5,
    mlHome: 118,
    mlAway: -140,
    division: true,
    prop: {
      player: 'Jahmyr Gibbs',
      team: 'DET',
      market: 'Rush Yards',
      line: 88.5,
      side: 'Over',
      price: -115,
      projection: 100,
      confidence: 68,
      rationale:
        'Gibbs explosiveness and expanded early-down role vs a Vikings run D that leaks chunk plays.',
    },
  },
  {
    away: 'SEA',
    home: 'LAR',
    kickoff: '2026-09-13T16:25:00-04:00',
    spread: -4.5,
    total: 46.5,
    mlHome: -210,
    mlAway: 175,
    division: true,
    prop: {
      player: 'Puka Nacua',
      team: 'LAR',
      market: 'Receiving Yards',
      line: 92.5,
      side: 'Over',
      price: -116,
      projection: 105,
      confidence: 73,
      rationale:
        'Stafford-to-Nacua is the leagues most reliable volume connection; MVP-level offense at home.',
    },
  },
];

function makeBooks(s: Seed): BookLine[] {
  const dk: BookLine = {
    book: 'DraftKings',
    spread: s.spread,
    spreadPriceHome: -110,
    spreadPriceAway: -110,
    total: s.total,
    overPrice: -110,
    underPrice: -110,
    moneylineHome: s.mlHome,
    moneylineAway: s.mlAway,
  };
  // FanDuel: slightly shaded alt to create real line-shopping opportunities.
  const fd: BookLine = {
    book: 'FanDuel',
    spread: s.spread,
    spreadPriceHome: -108,
    spreadPriceAway: -112,
    total: s.total + 0.5,
    overPrice: -114,
    underPrice: -106,
    moneylineHome: Math.round(s.mlHome + (s.mlHome < 0 ? 6 : -6)),
    moneylineAway: Math.round(s.mlAway + (s.mlAway < 0 ? -6 : 8)),
  };
  return [dk, fd];
}

export const WEEK1_GAMES: Game[] = SEEDS.map((s, i) => ({
  id: `2026-w1-${s.away}-${s.home}`.toLowerCase(),
  week: 1,
  season: 2026,
  kickoff: s.kickoff,
  home: s.home,
  away: s.away,
  books: makeBooks(s),
  prop: { ...s.prop, book: 'DraftKings' },
  context: {
    homeRestDays: 7,
    awayRestDays: 7,
    divisionGame: s.division,
    weather:
      s.weather ??
      (['DET', 'MIN', 'NO', 'ATL', 'LV', 'IND', 'ARI', 'HOU', 'DAL'].includes(s.home)
        ? 'dome'
        : 'clear'),
    notes: s.notes,
  },
}));

import type { TeamAbbr } from './types';

/**
 * Stadium geography for the travel model: latitude/longitude and timezone
 * offset from Eastern (0 = ET, -1 CT, -2 MT, -3 PT). Used to penalize long
 * road trips and body-clock disadvantages (e.g., a West Coast team kicking off
 * at 1pm ET is playing at 10am body time).
 */

interface Geo {
  lat: number;
  lon: number;
  tz: number; // hours from ET
}

export const STADIUMS: Record<TeamAbbr, Geo> = {
  ARI: { lat: 33.5277, lon: -112.2626, tz: -2 },
  ATL: { lat: 33.7554, lon: -84.4008, tz: 0 },
  BAL: { lat: 39.278, lon: -76.6227, tz: 0 },
  BUF: { lat: 42.7738, lon: -78.787, tz: 0 },
  CAR: { lat: 35.2258, lon: -80.8528, tz: 0 },
  CHI: { lat: 41.8623, lon: -87.6167, tz: -1 },
  CIN: { lat: 39.0955, lon: -84.516, tz: 0 },
  CLE: { lat: 41.5061, lon: -81.6995, tz: 0 },
  DAL: { lat: 32.7473, lon: -97.0945, tz: -1 },
  DEN: { lat: 39.7439, lon: -105.02, tz: -2 },
  DET: { lat: 42.34, lon: -83.0456, tz: 0 },
  GB: { lat: 44.5013, lon: -88.0622, tz: -1 },
  HOU: { lat: 29.6847, lon: -95.4107, tz: -1 },
  IND: { lat: 39.7601, lon: -86.1639, tz: 0 },
  JAX: { lat: 30.3239, lon: -81.6373, tz: 0 },
  KC: { lat: 39.0489, lon: -94.4839, tz: -1 },
  LV: { lat: 36.0909, lon: -115.1833, tz: -3 },
  LAC: { lat: 33.9535, lon: -118.3392, tz: -3 },
  LAR: { lat: 33.9535, lon: -118.3392, tz: -3 },
  MIA: { lat: 25.958, lon: -80.2389, tz: 0 },
  MIN: { lat: 44.9736, lon: -93.2575, tz: -1 },
  NE: { lat: 42.0909, lon: -71.2643, tz: 0 },
  NO: { lat: 29.9509, lon: -90.0812, tz: -1 },
  NYG: { lat: 40.8135, lon: -74.0745, tz: 0 },
  NYJ: { lat: 40.8135, lon: -74.0745, tz: 0 },
  PHI: { lat: 39.9008, lon: -75.1675, tz: 0 },
  PIT: { lat: 40.4468, lon: -80.0158, tz: 0 },
  SF: { lat: 37.4032, lon: -121.9698, tz: -3 },
  SEA: { lat: 47.5952, lon: -122.3316, tz: -3 },
  TB: { lat: 27.9759, lon: -82.5033, tz: 0 },
  TEN: { lat: 36.1665, lon: -86.7713, tz: -1 },
  WAS: { lat: 38.9077, lon: -76.8645, tz: 0 },
};

function haversineMiles(a: TeamAbbr, b: TeamAbbr): number {
  const A = STADIUMS[a];
  const B = STADIUMS[b];
  const R = 3958.8;
  const dLat = ((B.lat - A.lat) * Math.PI) / 180;
  const dLon = ((B.lon - A.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((A.lat * Math.PI) / 180) * Math.cos((B.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface TravelEffect {
  miles: number;
  tzShift: number; // + = away team traveling east (loses body-clock time)
  awayPenalty: number; // points to subtract from the away team's expectation
  detail: string;
}

/**
 * Travel effect on the AWAY team. Long distance costs a little; an eastward
 * body-clock shift for an early kickoff costs more.
 */
export function travelEffect(home: TeamAbbr, away: TeamAbbr, kickoffHourEt: number): TravelEffect {
  const miles = haversineMiles(home, away);
  const tzShift = STADIUMS[home].tz - STADIUMS[away].tz; // >0 = away travels east
  let penalty = Math.min(0.6, (miles / 2800) * 0.6);
  let bodyClock = 0;
  if (kickoffHourEt <= 14 && tzShift >= 2) {
    // West team in a 1pm ET (10am body) window.
    bodyClock = 0.9;
  } else if (kickoffHourEt >= 20 && tzShift <= -2) {
    // East team late on the West Coast, past body-clock midnight influence.
    bodyClock = 0.4;
  }
  penalty += bodyClock;
  const detail =
    `${Math.round(miles)} mi` + (bodyClock ? `, ${tzShift > 0 ? 'east' : 'west'} body-clock` : '');
  return { miles, tzShift, awayPenalty: Number(penalty.toFixed(2)), detail };
}

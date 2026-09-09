import { STADIUMS } from './geo';
import type { Game, TeamAbbr } from './types';

/**
 * Live weather forecasts from Open-Meteo (free, no API key). For outdoor
 * stadiums we pull the hourly wind, precipitation, and temperature nearest to
 * kickoff and feed the magnitude straight into the simulation — real wind
 * suppresses passing and field goals, which moves totals with actual signal
 * instead of a heuristic. Domes are skipped (climate-controlled).
 */

const DOME_TEAMS: TeamAbbr[] = ['ATL', 'DET', 'MIN', 'NO', 'LV', 'IND', 'ARI', 'HOU', 'DAL'];

export interface WeatherForecast {
  windMph: number;
  precip: number; // mm at kickoff hour
  tempF: number;
}

interface OpenMeteo {
  hourly?: {
    time: string[];
    precipitation: number[];
    wind_speed_10m: number[];
    temperature_2m: number[];
  };
}

function kickoffHourKey(iso: string): string {
  // Open-Meteo (timezone=UTC) returns keys like "2026-09-13T17:00".
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:00`;
}

async function fetchForecast(
  lat: number,
  lon: number,
  kickoff: string,
): Promise<WeatherForecast | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation,wind_speed_10m,temperature_2m&wind_speed_unit=mph` +
    `&temperature_unit=fahrenheit&timezone=UTC&forecast_days=16`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) return null;
  const data = (await res.json()) as OpenMeteo;
  const h = data.hourly;
  if (!h?.time?.length) return null;
  const key = kickoffHourKey(kickoff);
  let idx = h.time.indexOf(key);
  if (idx < 0) idx = h.time.findIndex((t) => t >= key); // nearest upcoming hour
  if (idx < 0) return null;
  return {
    windMph: Math.round(h.wind_speed_10m[idx] ?? 0),
    precip: h.precipitation[idx] ?? 0,
    tempF: Math.round(h.temperature_2m[idx] ?? 60),
  };
}

/** Fetch forecasts for all outdoor games in parallel. */
export async function getWeatherForGames(games: Game[]): Promise<Record<string, WeatherForecast>> {
  const outdoor = games.filter((g) => !DOME_TEAMS.includes(g.home));
  const results = await Promise.all(
    outdoor.map(async (g) => {
      const s = STADIUMS[g.home];
      const f = await fetchForecast(s.lat, s.lon, g.kickoff).catch(() => null);
      return [g.id, f] as const;
    }),
  );
  const map: Record<string, WeatherForecast> = {};
  for (const [id, f] of results) if (f) map[id] = f;
  return map;
}

/** Classify a forecast into the display weather category. */
export function classifyWeather(f: WeatherForecast): Game['context']['weather'] {
  if (f.precip >= 0.6 && f.tempF <= 34) return 'snow';
  if (f.precip >= 0.4) return 'rain';
  if (f.windMph >= 15) return 'wind';
  if (f.tempF <= 28) return 'cold';
  return 'clear';
}

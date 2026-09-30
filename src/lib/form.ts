import { TEAMS } from '@/lib/teams';
import { fetchEspnResults, type TeamGameStat } from '@/lib/espn';
import { SEASON } from '@/lib/schedule';
import { LEAGUE_AVG_PPG, homeFieldEdge, teamProfile } from '@/lib/ratings';
import { baseElo, updateElo, type EloRatings } from '@/lib/elo';
import { memo } from '@/lib/cache';
import type { TeamAbbr } from '@/lib/types';

/**
 * In-season form model. Starts from each team's preseason efficiency and, after
 * every completed game, nudges the OFFENSE and DEFENSE separately toward what
 * the box score implies. Rather than learn from raw points (which are dominated
 * by turnover luck and garbage-time noise), each unit is scored on an
 * OPPONENT-ADJUSTED EFFICIENCY signal — yards moved plus drive-finishing —
 * blended with actual points. Yardage is far more stable week-to-week than
 * points, so this regresses turnover variance automatically and makes the power
 * ratings (and therefore the margin/side picks) sharper. Splitting offense and
 * defense lets a great-offense / leaky-defense team be modeled correctly
 * instead of as one blended number. This is how the model "gets smarter."
 */

const PTS_CAP = 18; // cap a single game's scoring residual (garbage time / blowouts)
const SHIFT_CAP = 1.5; // max per-game move for offensive or defensive form
const FORM_BAND = 7; // clamp cumulative offensive/defensive form drift (points)

// --- Efficiency scoring (opponent-adjusted "how well did this unit play") ---
const YARD_BLEND = 0.5; // weight on yards-implied points vs. actual points
const PTS_PER_YARD = 0.066; // ~335 yds → league-avg points; keeps the mean intact
const RZ_WEIGHT = 1.2; // finishing bonus per red-zone TD above baseline rate
const RZ_BASE = 0.55; // league red-zone TD rate
const THIRD_WEIGHT = 0.25; // sustaining bonus per third-down conversion above baseline
const THIRD_BASE = 0.39; // league third-down conversion rate

/**
 * Points a unit "earned" this game: half its real points, half a
 * yards/finishing estimate. The yards term is turnover-neutral, so blending
 * pulls fluky point totals back toward what the offense actually generated.
 */
function efficiencyPoints(points: number, stat: TeamGameStat | undefined): number {
  if (!stat || stat.yards == null) return points;
  let eff = stat.yards * PTS_PER_YARD;
  if (stat.redZoneTd != null && stat.redZoneTrips != null) {
    eff += RZ_WEIGHT * (stat.redZoneTd - RZ_BASE * stat.redZoneTrips);
  }
  if (stat.thirdMade != null && stat.thirdAtt != null) {
    eff += THIRD_WEIGHT * (stat.thirdMade - THIRD_BASE * stat.thirdAtt);
  }
  return YARD_BLEND * eff + (1 - YARD_BLEND) * points;
}


/** Learning rate decays as the season fills in — early reads matter more. */
function learnRate(week: number): number {
  return 0.05 + 0.05 / Math.max(1, week); // Wk1 → 0.10, Wk2 → 0.075, … → 0.05
}

export interface Ratings {
  /** Preseason power rating + net in-season form (offense − defense drift). */
  net: Record<TeamAbbr, number>;
  /** Offensive form delta vs. expectation (pts/game; + = scoring more). */
  off: Record<TeamAbbr, number>;
  /** Defensive form delta vs. expectation (pts/game allowed; + = leakier). */
  def: Record<TeamAbbr, number>;
  /** Margin-aware Elo rating — independent second opinion for the side markets. */
  elo: EloRatings;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function baseRatings(): Ratings {
  const net = {} as Record<TeamAbbr, number>;
  const off = {} as Record<TeamAbbr, number>;
  const def = {} as Record<TeamAbbr, number>;
  for (const t of Object.values(TEAMS)) {
    net[t.abbr] = t.rating;
    off[t.abbr] = 0;
    def[t.abbr] = 0;
  }
  return { net, off, def, elo: baseElo() };
}

/**
 * Effective ratings after applying results from weeks 1..(uptoWeek-1).
 * Cached by Next fetch revalidation on the underlying ESPN calls.
 */
export function getFormRatings(uptoWeek: number, season = SEASON): Promise<Ratings> {
  return memo(`form-${season}-${uptoWeek}`, 300_000, () => computeFormRatings(uptoWeek, season));
}

async function computeFormRatings(uptoWeek: number, season: number): Promise<Ratings> {
  const r = baseRatings();
  if (uptoWeek <= 1) return r;

  const weeks = Array.from({ length: uptoWeek - 1 }, (_, i) => i + 1);
  const results = await Promise.all(weeks.map((w) => fetchEspnResults(w, season).catch(() => [])));

  results.forEach((week, i) => {
    const k = learnRate(weeks[i]);
    for (const g of week) {
      const ph = teamProfile(g.home, r.off[g.home], r.def[g.home]);
      const pa = teamProfile(g.away, r.off[g.away], r.def[g.away]);
      const hfa = homeFieldEdge(g.home);
      // Same expected-points formulation the simulation uses, for consistency.
      const expHome = LEAGUE_AVG_PPG + ph.offense + pa.defense + hfa * 0.55;
      const expAway = LEAGUE_AVG_PPG + pa.offense + ph.defense - hfa * 0.45;
      // Opponent-adjusted efficiency instead of raw points (regresses turnover luck).
      const effHome = efficiencyPoints(g.homeScore, g.teamStats?.[g.home]);
      const effAway = efficiencyPoints(g.awayScore, g.teamStats?.[g.away]);
      const actHome = clamp(effHome, expHome - PTS_CAP, expHome + PTS_CAP);
      const actAway = clamp(effAway, expAway - PTS_CAP, expAway + PTS_CAP);

      const dOffHome = clamp(k * (actHome - expHome), -SHIFT_CAP, SHIFT_CAP);
      const dOffAway = clamp(k * (actAway - expAway), -SHIFT_CAP, SHIFT_CAP);
      // Each defense feels the points it ALLOWED vs. expectation (+ = leakier).
      const dDefHome = clamp(k * (actAway - expAway), -SHIFT_CAP, SHIFT_CAP);
      const dDefAway = clamp(k * (actHome - expHome), -SHIFT_CAP, SHIFT_CAP);

      r.off[g.home] = clamp(r.off[g.home] + dOffHome, -FORM_BAND, FORM_BAND);
      r.off[g.away] = clamp(r.off[g.away] + dOffAway, -FORM_BAND, FORM_BAND);
      r.def[g.home] = clamp(r.def[g.home] + dDefHome, -FORM_BAND, FORM_BAND);
      r.def[g.away] = clamp(r.def[g.away] + dDefAway, -FORM_BAND, FORM_BAND);

      // Independent Elo update (margin-aware) from the same result.
      updateElo(r.elo, g.home, g.away, g.homeScore, g.awayScore);
    }
  });

  for (const t of Object.values(TEAMS)) {
    r.net[t.abbr] = t.rating + r.off[t.abbr] - r.def[t.abbr];
  }
  return r;
}

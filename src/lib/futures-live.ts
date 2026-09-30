import { FUTURES } from '@/data/futures';
import { americanToProb, kellyUnits } from './odds';
import { fetchDraftKingsFutures } from './draftkings-futures';
import { baseRatings, getFormRatings, type Ratings } from './form';
import { getCurrentWeek } from './schedule';
import type { FuturesBet } from './types';

/** Relative model-probability swing per point the team's form rating has drifted. */
const FORM_K = 0.06;

/**
 * How much a future's model probability should move given the team's in-season
 * form drift through the selected week. Strength helps every market except an
 * "under" win-total, where it hurts. Week 1 has no drift, so nothing moves.
 */
function weekFormFactor(f: FuturesBet, ratings: Ratings, base: Ratings): number {
  if (!f.team || !(f.team in ratings.net)) return 1;
  const delta = ratings.net[f.team] - base.net[f.team];
  if (delta === 0) return 1;
  const dir = f.market === 'Win Total' && /under/i.test(f.selection) ? -1 : 1;
  return 1 + dir * FORM_K * delta;
}

/**
 * Overlay live DraftKings prices onto the curated futures and re-grade each one
 * for the given week: as the season plays out, `getFormRatings` shifts team
 * strength from real results, which moves every team-based future's model
 * probability, edge and stake — so the board's recommendations evolve week by
 * week. Defaults to the current week.
 */
export async function getLiveFutures(week: number = getCurrentWeek()): Promise<FuturesBet[]> {
  const [live, ratings] = await Promise.all([
    fetchDraftKingsFutures().catch(() => null),
    getFormRatings(week),
  ]);
  const base = baseRatings();

  return FUTURES.map((f) => {
    let price = f.price;

    if (live) {
      if (f.market === 'Super Bowl' && f.team) {
        price = live.team[`Super Bowl|${f.team}`] ?? price;
      } else if (f.market === 'Division' && f.team) {
        price = live.team[`Division|${f.team}`] ?? price;
      } else if (f.market === 'MVP') {
        price = live.player[`MVP|${f.selection.toLowerCase()}`] ?? price;
      } else if (f.market === 'Win Total' && f.team) {
        const wt = live.winTotal[f.team];
        if (wt) price = /under/i.test(f.selection) ? wt.under : wt.over;
      }
    }

    const factor = weekFormFactor(f, ratings, base);
    if (price === f.price && factor === 1) return f;

    const modelProb = Math.max(0.001, Math.min(0.99, f.modelProb * factor));
    const confidence =
      factor === 1 ? f.confidence : Math.max(0, Math.min(99, Math.round(f.confidence * factor)));
    const marketProb = americanToProb(price);
    return {
      ...f,
      price,
      marketProb,
      modelProb,
      confidence,
      edge: modelProb - marketProb,
      units: kellyUnits(modelProb, price),
    };
  });
}

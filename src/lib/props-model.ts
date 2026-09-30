import { readFileSync } from 'fs';
import path from 'path';

/**
 * Anytime-TD calibration layer, driven by the 15-season player model
 * (see ml/build_props.py → data/store/props-model.json). That study showed TD
 * probabilities are well-calibrated and sharply priced by the market — the model
 * beats a position baseline only marginally (Brier 0.176 vs 0.189) and slightly
 * OVER-rates the highest-probability scorers (pred 50% → real 48%). So the app's
 * multiplicative usage/team tilts must not push a scorer far above the vig-free
 * market: we shrink toward the market and cap the uplift. This is the concrete
 * fix for the app's worst market (anytime TD ran ~35%).
 */

interface PropsArtifact {
  anytimeTd?: {
    baseRate?: number;
    brierModel?: number;
    brierBaseline?: number;
    calibration?: { lo: number; hi: number; pred: number; real: number; n: number }[];
  };
  propResidualSd?: Record<string, number | null>;
}

export interface TdCalibration {
  /** Weight on the model's deviation from the market (0 = trust market fully). */
  modelWeight: number;
  /** Hard cap on how far above the vig-free market a scorer's prob may go. */
  maxUplift: number;
  loaded: boolean;
}

// Sensible market-anchored defaults if the artifact is absent.
const DEFAULTS: TdCalibration = { modelWeight: 0.5, maxUplift: 1.15, loaded: false };

let cached: TdCalibration | undefined;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Cached calibration parameters from the 15-season artifact (read once, sync). */
export function getTdCalibration(): TdCalibration {
  if (cached) return cached;
  try {
    const file = path.join(process.cwd(), 'data', 'store', 'props-model.json');
    const art = JSON.parse(readFileSync(file, 'utf-8')) as PropsArtifact;
    const td = art.anytimeTd;
    if (!td?.brierModel || !td?.brierBaseline) {
      cached = DEFAULTS;
      return cached;
    }
    // Marginal skill over the baseline ⇒ lean on the market. Map the Brier
    // improvement (~7%) into a modest model weight.
    const improvement = (td.brierBaseline - td.brierModel) / td.brierBaseline;
    const modelWeight = clamp(0.3 + improvement * 3, 0.3, 0.7);
    // The top calibration bucket reveals how much high-prob scorers are overrated;
    // cap uplift just past that so we never chase inflated legs.
    const top = td.calibration?.[td.calibration.length - 1];
    const overrate = top && top.pred > 0 ? top.real / top.pred : 0.96;
    const maxUplift = clamp(1 + (1 - overrate) + 0.1, 1.08, 1.2);
    cached = { modelWeight, maxUplift, loaded: true };
  } catch {
    cached = DEFAULTS;
  }
  return cached;
}

/**
 * Anchor a raw model TD probability to the vig-free market: keep only a fraction
 * of the model's deviation and cap the total uplift above the market.
 */
export function calibrateTdProb(
  rawProb: number,
  marketVigFree: number,
  cal: TdCalibration,
): number {
  if (marketVigFree <= 0) return rawProb;
  const blended = marketVigFree + cal.modelWeight * (rawProb - marketVigFree);
  const capped = Math.min(blended, marketVigFree * cal.maxUplift);
  return Math.max(0.01, Math.min(0.95, capped));
}

let sigmaCache: Record<string, number> | undefined;

/**
 * Real per-market prop residual SDs measured over 15 seasons (ml/build_props.py).
 * The app's hand-tuned sigmas were far too small (e.g. Pass Yards 46 vs a real
 * ~84), which made prop probabilities wildly overconfident. Reading the measured
 * variance calibrates every over/under toward reality.
 */
export function getPropResidualSds(): Record<string, number> {
  if (sigmaCache) return sigmaCache;
  try {
    const file = path.join(process.cwd(), 'data', 'store', 'props-model.json');
    const art = JSON.parse(readFileSync(file, 'utf-8')) as PropsArtifact;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(art.propResidualSd ?? {})) {
      if (typeof v === 'number' && v > 0) out[k] = v;
    }
    sigmaCache = out;
  } catch {
    sigmaCache = {};
  }
  return sigmaCache;
}

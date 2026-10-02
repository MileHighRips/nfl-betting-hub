/**
 * Market-disconnect score — a single, honest "how far is our number from the
 * price" signal attached to every pick. It does NOT change stakes (edge already
 * drives Kelly sizing); it surfaces the magnitude of value the model already
 * found, so a genuine mispricing is legible at a glance.
 */

export type DisconnectTier = 'strong' | 'value' | 'lean' | 'fair';

export interface Disconnect {
  /** (model prob − de-vigged market prob) × 100. */
  edgePct: number;
  /** |projection − line| / outcome SD, for point markets (spread/total/prop). */
  sigma?: number;
  tier: DisconnectTier;
  label: string;
}

// Standard NFL outcome dispersion for the σ view.
export const MARGIN_SD = 13.5;
export const TOTAL_SD = 10.2;

export function gradeDisconnect(
  edge: number,
  pt?: { projection?: number; line?: number; sd?: number },
): Disconnect {
  const edgePct = edge * 100;
  const sigma =
    pt && pt.projection != null && pt.line != null && pt.sd && pt.sd > 0
      ? Math.abs(pt.projection - pt.line) / pt.sd
      : undefined;
  const s = sigma ?? 0;
  const tier: DisconnectTier =
    edgePct >= 8 || s >= 1.5
      ? 'strong'
      : edgePct >= 4 || s >= 0.9
        ? 'value'
        : edgePct >= 2
          ? 'lean'
          : 'fair';
  const parts = [`${edgePct >= 0 ? '+' : ''}${edgePct.toFixed(1)}% vs mkt`];
  if (sigma != null) parts.push(`${sigma.toFixed(1)}\u03c3`);
  return { edgePct, sigma, tier, label: parts.join(' \u00b7 ') };
}

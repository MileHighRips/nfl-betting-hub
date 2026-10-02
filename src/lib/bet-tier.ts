import type { Disconnect } from './disconnect';

/**
 * Classify a bet across the three independent lanes the user cares about:
 *   • EV        — a genuine model edge (value/strong market disconnect)
 *   • News      — a structured beat-writer / role signal is feeding it
 *   • Narrative — it's aligned with the projected game script (situational
 *                 total, blowout usage tilt, high/low-scoring tailwind)
 * Two lanes → "Awesome"; all three → "Mega Superior".
 */
export type BetTierKey = 'mega' | 'awesome' | 'ev' | 'news' | 'narrative' | 'none';

export interface BetTier {
  ev: boolean;
  news: boolean;
  narrative: boolean;
  count: number;
  key: BetTierKey;
  label: string;
}

export function classifyBet(input: {
  edge: number;
  disconnect?: Disconnect;
  hasSignal?: boolean;
  narrative?: boolean;
}): BetTier {
  const tier = input.disconnect?.tier;
  const ev = tier === 'strong' || tier === 'value' || input.edge >= 0.04;
  const news = !!input.hasSignal;
  const narrative = !!input.narrative;
  const count = (ev ? 1 : 0) + (news ? 1 : 0) + (narrative ? 1 : 0);

  let key: BetTierKey;
  let label: string;
  if (count >= 3) {
    key = 'mega';
    label = 'Mega Superior';
  } else if (count === 2) {
    key = 'awesome';
    label = 'Awesome';
  } else if (ev) {
    key = 'ev';
    label = 'EV';
  } else if (news) {
    key = 'news';
    label = 'News';
  } else if (narrative) {
    key = 'narrative';
    label = 'Narrative';
  } else {
    key = 'none';
    label = '';
  }
  return { ev, news, narrative, count, key, label };
}

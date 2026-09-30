import { propKey } from '@/lib/props';
import type { LivePropMap } from '@/lib/types';
import type { PropMarket } from '@/data/props';

/**
 * Manual live DraftKings prop lines. Use this to pin an exact posted number
 * (e.g. a line that moved off the baseline) without connecting a paid feed.
 * These override the neutral baselines in data/props.ts; a connected live prop
 * feed (ODDS_API_KEY + ODDS_API_PROPS) takes precedence over these.
 *
 * Add/adjust entries as lines move. `line` is required; prices are optional.
 */
interface ManualLine {
  player: string;
  market: PropMarket;
  line: number;
  overPrice?: number;
  underPrice?: number;
}

const MANUAL: ManualLine[] = [
  { player: "D'Andre Swift", market: 'Rush Yards', line: 60.5 },
];

export const MANUAL_PROP_LINES: LivePropMap = Object.fromEntries(
  MANUAL.map((m) => [
    propKey(m.player, m.market),
    {
      line: m.line,
      overPrice: m.overPrice ?? -114,
      underPrice: m.underPrice ?? -114,
      book: 'DraftKings' as const,
    },
  ]),
);

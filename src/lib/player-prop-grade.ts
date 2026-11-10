import { findStat } from './names';
import type { PlayerGameStat } from './espn';

export function playerPropValue(
  stats: PlayerGameStat[],
  player: string,
  marketName: string,
): number | undefined {
  const stat = findStat(stats, player);
  if (!stat) return undefined;
  const market = marketName.toLowerCase();
  if (market.includes('rush') && market.includes('rec') && market.includes('yard')) {
    if (stat.rushYards == null || stat.receivingYards == null) return undefined;
    return stat.rushYards + stat.receivingYards;
  }
  if (market.includes('pass') && market.includes('yard')) return stat.passYards;
  if (market.includes('pass') && market.includes('td')) return stat.passTD;
  if (market.includes('pass') && market.includes('attempt')) return stat.passAttempts;
  if (market.includes('completion')) return stat.completions;
  if (market.includes('interception')) return stat.interceptions;
  if (market.includes('rush') && market.includes('yard')) return stat.rushYards;
  if (market.includes('rush') && market.includes('attempt')) return stat.rushAttempts;
  if (market.includes('receiv') && market.includes('yard')) return stat.receivingYards;
  if (market.includes('reception')) return stat.receptions;
  if (market.includes('sack')) return stat.sacks;
  return undefined;
}

import { fetchEspnResults, type CompletedResult } from './espn';
import { SEASON } from './schedule';
import { TEAMS } from './teams';
import { findStat } from './names';
import type { PickType, PlacedBet, TeamAbbr } from './types';

function inferMetadata(bet: PlacedBet): PlacedBet {
  // Prop bets stored a generic side ('prop'); derive the real Over/Under.
  if (bet.pickType === 'Prop' && bet.side !== 'over' && bet.side !== 'under') {
    const sideWord = /\bunder\b/i.test(bet.description)
      ? 'under'
      : /\bover\b/i.test(bet.description)
        ? 'over'
        : undefined;
    if (sideWord) bet = { ...bet, side: sideWord };
  }
  if (bet.gameId && bet.pickType && bet.side && bet.line != null) return bet;
  const matchup = bet.description.match(/\(([A-Z]{2,3})\s*@\s*([A-Z]{2,3})\)/i);
  const week = bet.market.match(/Week\s+(\d+)/i)?.[1];
  const rawType = bet.market.match(/·\s*(Spread|Total|Moneyline|Prop|Upset)/i)?.[1];
  const type = (rawType?.toLowerCase() === 'upset' ? 'Moneyline' : rawType) as PickType | undefined;
  if (!matchup || !week || !type) return bet;

  const away = matchup[1].toLowerCase();
  const home = matchup[2].toLowerCase();
  const selection = bet.description.split(' (')[0];
  const sideWord = selection.match(/\b(Over|Under)\b/i)?.[1]?.toLowerCase();
  const lineMatch = selection.match(/([+-]?\d+(?:\.\d+)?)(?:\s|$)/);
  const line = lineMatch ? Number(lineMatch[1]) : undefined;
  const team = Object.values(TEAMS).find((entry) =>
    selection.toLowerCase().startsWith(entry.name.toLowerCase()),
  );
  const side =
    type === 'Spread'
      ? team?.abbr.toLowerCase() === home
        ? 'home_spread'
        : team?.abbr.toLowerCase() === away
          ? 'away_spread'
          : undefined
      : type === 'Moneyline'
        ? team?.abbr.toLowerCase() === home
          ? 'home_ml'
          : team?.abbr.toLowerCase() === away
            ? 'away_ml'
            : undefined
        : sideWord;
  const propMatch = selection.match(/^(.*?)\s+(Over|Under)\s+\d+(?:\.\d+)?\s+(.+)$/i);

  return {
    ...bet,
    gameId: `${SEASON}-w${week}-${away}-${home}`,
    pickType: type,
    side,
    line: type === 'Moneyline' ? 0 : line,
    player: type === 'Prop' ? propMatch?.[1] : undefined,
    propMarket: type === 'Prop' ? propMatch?.[3] : undefined,
  };
}

function gameTeams(gameId: string): { away: TeamAbbr; home: TeamAbbr } | null {
  const parts = gameId.toUpperCase().split('-');
  if (parts.length < 4 || !parts[2] || !parts[3]) return null;
  return { away: parts[2] as TeamAbbr, home: parts[3] as TeamAbbr };
}

function gameWeek(gameId: string): number | null {
  const match = gameId.match(/-W(\d+)-/i);
  return match ? Number(match[1]) : null;
}

function resultFor(bet: PlacedBet, results: CompletedResult[]): CompletedResult | undefined {
  const teams = bet.gameId ? gameTeams(bet.gameId) : null;
  if (!teams) return undefined;
  return results.find(
    (result) => result.away === teams.away && result.home === teams.home,
  );
}

function settle(bet: PlacedBet, result: CompletedResult): PlacedBet['status'] | undefined {
  if (!bet.pickType || !bet.side) return undefined;

  if (bet.pickType === 'Prop') {
    if (bet.line == null) return undefined;
    const player = bet.player;
    const market = bet.propMarket?.toLowerCase();
    if (!player || !market) return undefined;
    const stat = findStat(result.playerStats, player);
    if (!stat) return undefined;
    const value = market.includes('pass')
      ? stat.passYards
      : market.includes('rush')
        ? stat.rushYards
        : market.includes('reception') && !market.includes('yard')
          ? stat.receptions
          : stat.receivingYards;
    if (value == null) return undefined;
    const margin = value - bet.line;
    if (margin === 0) return 'push';
    return (bet.side === 'over' ? margin > 0 : margin < 0) ? 'won' : 'lost';
  }

  if (bet.pickType === 'Moneyline') {
    if (result.homeScore === result.awayScore) return 'push';
    const homeWin = result.homeScore > result.awayScore;
    return (bet.side === 'home_ml') === homeWin ? 'won' : 'lost';
  }

  if (bet.pickType === 'Total') {
    if (bet.line == null) return undefined;
    const margin = result.homeScore + result.awayScore - bet.line;
    if (margin === 0) return 'push';
    return (bet.side === 'over' ? margin > 0 : margin < 0) ? 'won' : 'lost';
  }

  if (bet.line == null) return undefined;
  const margin =
    bet.side === 'home_spread'
      ? result.homeScore - result.awayScore + bet.line
      : result.awayScore - result.homeScore + bet.line;
  if (margin === 0) return 'push';
  return margin > 0 ? 'won' : 'lost';
}

export async function gradePendingBets(bets: PlacedBet[]): Promise<PlacedBet[]> {
  bets = bets.map(inferMetadata);
  const weeks = new Set<number>();
  for (const bet of bets) {
    if (!bet.gameId) continue;
    const week = gameWeek(bet.gameId);
    if (week) weeks.add(week);
  }

  const resultSets = await Promise.all(
    [...weeks].map(async (week) => {
      try {
        return await fetchEspnResults(week);
      } catch {
        return [];
      }
    }),
  );
  const results = resultSets.flat();

  // Finals are authoritative: re-settle any bet on a completed game so an
  // earlier miscall self-heals. Games not yet final keep their current status.
  return bets.map((bet) => {
    if (!bet.gameId || bet.manualStatus) return bet; // respect hand-set outcomes
    const result = resultFor(bet, results);
    if (!result) return bet;
    const status = settle(bet, result);
    return status ? { ...bet, status } : bet;
  });
}

import { CalendarRange } from 'lucide-react';
import { getGames } from '@/lib/odds-source';
import { analyzeGame } from '@/lib/model';
import { CURRENT_SEASON, CURRENT_WEEK } from '@/data/games';
import GameCard from '@/components/GameCard';
import { Chip, SectionTitle } from '@/components/atoms';

export const dynamic = 'force-dynamic';

export default async function SlatePage() {
  const { games, source, error } = await getGames();
  const analyses = games
    .map(analyzeGame)
    .sort((a, b) => new Date(a.game.kickoff).getTime() - new Date(b.game.kickoff).getTime());

  const bestBets = analyses.filter((a) => a.topPick.confidence >= 62 && a.topPick.units > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          title={`Week ${CURRENT_WEEK} Slate · ${CURRENT_SEASON}`}
          subtitle={`${games.length} games · ${bestBets} model best-bets · DraftKings & FanDuel`}
          icon={<CalendarRange size={18} />}
        />
        <div className="flex items-center gap-2">
          <Chip variant={source === 'live' ? 'value' : 'default'}>
            {source === 'live' ? 'Live odds feed' : 'Seed odds (add ODDS_API_KEY for live)'}
          </Chip>
        </div>
      </div>

      {error && (
        <div className="card border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
          Live feed unavailable ({error}) — showing seed lines.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {analyses.map((a) => (
          <GameCard key={a.game.id} a={a} />
        ))}
      </div>
    </div>
  );
}

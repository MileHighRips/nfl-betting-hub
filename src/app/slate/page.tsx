import { CalendarRange, CalendarClock } from 'lucide-react';
import { getGames } from '@/lib/odds-source';
import { analyzeGame } from '@/lib/model';
import { SEASON, getCurrentWeek } from '@/lib/schedule';
import GameCard from '@/components/GameCard';
import WeekSelector from '@/components/WeekSelector';
import { Chip, SectionTitle } from '@/components/atoms';

export const dynamic = 'force-dynamic';

export default async function SlatePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const currentWeek = getCurrentWeek();
  const week = sp.week ? Math.max(1, Math.min(18, Number(sp.week) || currentWeek)) : currentWeek;

  const { games, source, error } = await getGames(week);
  const analyses = games
    .map(analyzeGame)
    .sort((a, b) => new Date(a.game.kickoff).getTime() - new Date(b.game.kickoff).getTime());

  const bestBets = analyses.filter((a) => a.topPick.confidence >= 62 && a.topPick.units > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          title={`Week ${week} Slate · ${SEASON}`}
          subtitle={`${games.length} games · ${bestBets} model best-bets · DraftKings & FanDuel`}
          icon={<CalendarRange size={18} />}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Chip variant={source === 'live' ? 'value' : 'default'}>
            {source === 'live' ? 'Live odds feed' : 'Seed odds'}
          </Chip>
          <WeekSelector week={week} currentWeek={currentWeek} />
        </div>
      </div>

      {error && (
        <div className="card border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
          Live feed unavailable ({error}) — showing seed lines.
        </div>
      )}

      {analyses.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <CalendarClock size={28} className="text-zinc-500" />
          <div className="text-sm font-semibold text-white">
            No lines posted for Week {week} yet
          </div>
          <p className="max-w-md text-xs text-zinc-500">
            {source === 'seed'
              ? 'The seed slate only covers Week 1. Add a free ODDS_API_KEY in .env.local to pull live DraftKings & FanDuel lines for every week automatically as books post them.'
              : 'Sportsbooks typically post a week\u2019s lines 6\u201310 days out. This week will fill in automatically once DraftKings & FanDuel release their numbers.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {analyses.map((a) => (
            <GameCard key={a.game.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

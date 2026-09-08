import { CalendarRange, CalendarClock } from 'lucide-react';
import { getGames } from '@/lib/odds-source';
import { analyzeGame } from '@/lib/model';
import { getFormRatings } from '@/lib/form';
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

  const { games, source, provider, error } = await getGames(week);
  const ratings = await getFormRatings(week);
  const analyses = games
    .map((g) => analyzeGame(g, ratings))
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
          <Chip variant={source === 'live' ? 'value' : 'default'}>{provider}</Chip>
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
            Sportsbooks typically post a week&rsquo;s lines 6&ndash;10 days out. This week fills in
            automatically from the live ESPN feed once the games are scheduled and DraftKings posts
            numbers.
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

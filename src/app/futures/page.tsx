import { Trophy } from 'lucide-react';
import FuturesBoard from '@/components/FuturesBoard';
import WeekSelector from '@/components/WeekSelector';
import { SectionTitle } from '@/components/atoms';
import { getLiveFutures } from '@/lib/futures-live';
import { TOTAL_WEEKS } from '@/lib/schedule';
import { getActiveWeek } from '@/lib/active-week';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Futures & Awards · LockyLines' };

export default async function FuturesPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const currentWeek = await getActiveWeek();
  const week = sp.week
    ? Math.max(1, Math.min(TOTAL_WEEKS, Number(sp.week) || currentWeek))
    : currentWeek;
  const futures = await getLiveFutures(week);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          title="Futures & Award Markets"
          subtitle={`Super Bowl, MVP, all six awards, win totals & divisions — model view as of Week ${week}, with Ken's actual bets and predictions flagged`}
          icon={<Trophy size={18} />}
        />
        <WeekSelector week={week} currentWeek={currentWeek} basePath="/futures" />
      </div>
      <FuturesBoard futures={futures} />
    </div>
  );
}

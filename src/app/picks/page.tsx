import { ListChecks } from 'lucide-react';
import { SEASON } from '@/lib/schedule';
import { getActiveWeek } from '@/lib/active-week';
import { SectionTitle, Chip } from '@/components/atoms';
import RefreshPicks from '@/components/RefreshPicks';
import PrintPicks from '@/components/PrintPicks';
import AllPicks from '@/components/AllPicks';
import PicksScopeNav from '@/components/PicksScopeNav';
import WeekBreakdown from '@/components/WeekBreakdown';
import { getLifetimePicks, getWeekPicks } from '@/lib/flat-picks';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'All Picks · LockyLines' };

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const currentWeek = await getActiveWeek();
  const lifetime = sp.week === 'all';
  const week = lifetime
    ? currentWeek
    : Math.max(1, Math.min(currentWeek, Number(sp.week) || currentWeek));

  const { picks, provider } = lifetime
    ? await getLifetimePicks(currentWeek)
    : await getWeekPicks(week);

  return (
    <>
      <PrintPicks picks={picks} week={week} season={SEASON} provider={provider} />
      <div className="screen-only space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle
            title={lifetime ? `All Picks · Lifetime ${SEASON}` : `All Picks · Week ${week} ${SEASON}`}
            subtitle={
              lifetime
                ? 'Every value bet across the season — cumulative record, units P/L and ROI'
                : 'Every value bet the model (and Ken) likes — with win % and recommended unit size'
            }
            icon={<ListChecks size={18} />}
          />
          <div className="flex items-center gap-2">
            <RefreshPicks />
            <PicksScopeNav scope={lifetime ? 'all' : week} currentWeek={currentWeek} basePath="/picks" />
            <Chip variant="value">{provider}</Chip>
          </div>
        </div>
        {lifetime && <WeekBreakdown picks={picks} />}
        <AllPicks picks={picks} />
      </div>
    </>
  );
}


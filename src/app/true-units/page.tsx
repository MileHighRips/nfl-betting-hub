import { Coins } from 'lucide-react';
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
export const metadata = { title: 'True Units · LockyLines' };

export default async function TrueUnitsPage({
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

  const built = lifetime ? await getLifetimePicks(currentWeek) : await getWeekPicks(week);
  const provider = built.provider;
  // Same picks, but sized by the model's real conviction — swap the constrained
  // house stake for the uncapped quarter-Kelly `trueUnits`.
  const picks = built.picks.map((p) => ({ ...p, units: p.trueUnits }));

  return (
    <>
      <PrintPicks picks={picks} week={week} season={SEASON} provider={provider} />
      <div className="screen-only space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle
            title={lifetime ? `True Units · Lifetime ${SEASON}` : `True Units · Week ${week} ${SEASON}`}
            subtitle="Every pick sized by the model's real conviction — uncapped quarter-Kelly, no flat-1u limit. Compare the record, P/L and ROI against the constrained All Picks slate."
            icon={<Coins size={18} />}
          />
          <div className="flex items-center gap-2">
            <RefreshPicks />
            <PicksScopeNav
              scope={lifetime ? 'all' : week}
              currentWeek={currentWeek}
              basePath="/true-units"
            />
            <Chip variant="value">{provider}</Chip>
          </div>
        </div>
        {lifetime && <WeekBreakdown picks={picks} />}
        <AllPicks picks={picks} />
      </div>
    </>
  );
}


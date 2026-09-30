import { Skull } from 'lucide-react';
import { getEliminatorData } from '@/lib/eliminator';
import { SEASON } from '@/lib/schedule';
import { getActiveWeek } from '@/lib/active-week';
import { SectionTitle } from '@/components/atoms';
import RefreshPicks from '@/components/RefreshPicks';
import EliminatorBoard from '@/components/EliminatorBoard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Eliminator · LockyLines' };

export default async function EliminatorPage() {
  const week = await getActiveWeek();
  const weeks = await getEliminatorData(week);

  return (
    <div className="space-y-6">
      <div className="screen-only flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          title={`Eliminator Planner · ${SEASON}`}
          subtitle="Best survivor pick each week, optimized across the whole season so you don't burn a team you'll need later"
          icon={<Skull size={18} />}
        />
        <RefreshPicks />
      </div>
      <EliminatorBoard weeks={weeks} currentWeek={week} />
    </div>
  );
}

import { ListChecks } from 'lucide-react';
import { getGames } from '@/lib/odds-source';
import { analyzeGame } from '@/lib/model';
import { getFormRatings } from '@/lib/form';
import { getCurrentWeek, SEASON } from '@/lib/schedule';
import { FUTURES } from '@/data/futures';
import { TEAMS } from '@/lib/teams';
import { SectionTitle, Chip } from '@/components/atoms';
import AllPicks, { type FlatPick, type PickGroup } from '@/components/AllPicks';
import type { ModelPick } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'All Picks · LockyLines' };

export default async function PicksPage() {
  const week = getCurrentWeek();
  const [{ games, provider }, ratings] = await Promise.all([getGames(week), getFormRatings(week)]);
  const analyses = games.map((g) => analyzeGame(g, ratings));

  const picks: FlatPick[] = [];

  const push = (a: ReturnType<typeof analyzeGame>, pick: ModelPick, group: PickGroup) => {
    if (pick.units <= 0) return;
    const matchup = `${TEAMS[a.game.away].abbr} @ ${TEAMS[a.game.home].abbr}`;
    picks.push({
      id: `${a.game.id}-${group}`,
      group,
      matchup,
      selection: pick.selection,
      confidence: pick.confidence,
      edge: pick.edge,
      price: pick.price,
      book: pick.book,
      units: Number(pick.units.toFixed(2)),
      description: `${pick.selection} (${matchup})`,
      market: `Week ${week} · ${pick.type}`,
    });
  };

  for (const a of analyses) {
    push(a, a.spread, 'Spread');
    push(a, a.total, 'Total');
    push(a, a.moneyline, 'Moneyline');
    // Prop from the sim-based detail.
    if (a.prop.units > 0) {
      const matchup = `${TEAMS[a.game.away].abbr} @ ${TEAMS[a.game.home].abbr}`;
      picks.push({
        id: `${a.game.id}-Prop`,
        group: 'Prop',
        matchup,
        selection: a.prop.selection,
        confidence: a.prop.confidence,
        edge: a.prop.edge,
        price: a.prop.price,
        book: a.prop.book,
        units: Number(a.prop.units.toFixed(2)) || 0.5,
        description: `${a.prop.selection} (${matchup})`,
        market: `Week ${week} · Prop`,
      });
    }
    if (a.upset) push(a, a.upset, 'Upset');
  }

  // Ken's actual futures bets + any positive-edge futures.
  for (const f of FUTURES) {
    if (!f.kenPick && f.edge <= 0) continue;
    picks.push({
      id: `fut-${f.id}`,
      group: 'Futures',
      matchup: f.market,
      selection: f.selection,
      confidence: f.confidence,
      edge: f.edge,
      price: f.price,
      book: f.book === 'Consensus' || f.book === 'Kalshi' ? 'DraftKings' : f.book,
      units: Number((f.units || 0.5).toFixed(2)),
      description: `${f.selection} — ${f.market}`,
      market: `Futures · ${f.market}`,
      ken: f.kenPick,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          title={`All Picks · Week ${week} ${SEASON}`}
          subtitle="Every value bet the model (and Ken) likes — with win % and recommended unit size"
          icon={<ListChecks size={18} />}
        />
        <Chip variant="value">{provider}</Chip>
      </div>
      <AllPicks picks={picks} />
    </div>
  );
}

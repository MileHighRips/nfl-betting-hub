import { Zap } from 'lucide-react';
import { promises as fs } from 'fs';
import path from 'path';
import { getGames } from '@/lib/odds-source';
import { analyzeGamesWithLocks } from '@/lib/pick-locks';
import { getFormRatings } from '@/lib/form';
import { SEASON } from '@/lib/schedule';
import { getActiveWeek } from '@/lib/active-week';
import { hoursToKickoff } from '@/lib/kickoff';
import { spreadMovement, totalMovement, type LineMovement } from '@/lib/stale-line';
import { sgpForGame } from '@/lib/parlays';
import { captureClosingLines } from '@/lib/clv';
import { getNflNews, getWire, relevantNews } from '@/lib/news';
import { SectionTitle, Chip } from '@/components/atoms';
import RefreshPicks from '@/components/RefreshPicks';
import WeekSelector from '@/components/WeekSelector';
import ExportPdfButton from '@/components/ExportPdfButton';
import PrintBetNow from '@/components/PrintBetNow';
import NewsWire from '@/components/NewsWire';
import BetNowBoard, { type BetNowRow } from '@/components/BetNowBoard';
import type { GameAnalysis } from '@/lib/model';
import type { PlacedBet } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Cumulative units already placed per pick identity (prop-aware, ignores line),
// mirroring BetNowBoard so the PDF shows what's down + the remaining top-up.
async function readPlacedBets(): Promise<PlacedBet[]> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'data', 'store', 'bets.json'), 'utf-8');
    return JSON.parse(raw) as PlacedBet[];
  } catch {
    return [];
  }
}

function betIdentity(b: {
  gameId?: string;
  pickType?: string;
  side?: string;
  player?: string;
  propMarket?: string;
  description?: string;
}): string {
  if (!(b.gameId && b.pickType)) return b.description ?? '';
  if (b.pickType === 'Prop') {
    const dir = b.description && /\bunder\b/i.test(b.description) ? 'under' : 'over';
    return `${b.gameId}|Prop|${b.player ?? ''}|${b.propMarket ?? ''}|${dir}`;
  }
  return `${b.gameId}|${b.pickType}|${b.side ?? ''}|${b.player ?? ''}|${b.propMarket ?? ''}`;
}

// Minimum edge (model prob − market prob) to earn a spot on Bet Now. Real price
// value is the proxy for expected positive CLV; below this there's no reason to
// bet now rather than wait.
const EDGE_FLOOR = 0.02;

function collectRows(a: GameAnalysis, week: number): BetNowRow[] {
  const matchup = `${a.game.away} @ ${a.game.home}`;
  const kickoff = a.game.kickoff;
  const rows: BetNowRow[] = [];
  const stakeOf = (p: { units: number; trueUnits?: number }) =>
    Number((p.trueUnits ?? p.units).toFixed(2));

  const addPick = (
    pickType: string,
    pick: {
      selection: string;
      price: number;
      edge: number;
      confidence: number;
      units: number;
      trueUnits?: number;
      gameId?: string;
      side?: string;
      line?: number;
      player?: string;
      propMarket?: string;
      situational?: string;
      disconnect?: import('@/lib/disconnect').Disconnect;
      note?: string;
      narrative?: boolean;
    },
    move?: LineMovement,
  ) => {
    const stake = stakeOf(pick);
    if (stake <= 0) return;
    rows.push({
      key: `${a.game.id}-${pickType}-${pick.selection}`,
      matchup,
      kickoff,
      pickType,
      description: `${pick.selection} (${matchup})`,
      market: `Week ${week} · ${pickType}`,
      price: pick.price,
      stakeUnits: stake,
      edge: pick.edge,
      confidence: pick.confidence,
      gameId: pick.gameId ?? a.game.id,
      side: pick.side,
      line: pick.line,
      player: pick.player,
      propMarket: pick.propMarket,
      situational: pick.situational,
      disconnect: pick.disconnect,
      signal: pick.note,
      narrative: pick.narrative,
      move,
    });
  };

  const book = a.game.books[0];
  addPick('Spread', a.spread, spreadMovement(book, a.spread.edge));
  addPick('Total', a.total, totalMovement(book, a.total.edge));
  addPick('Moneyline', a.moneyline);
  // Upset is just an underdog ML — redundant with the Moneyline pick, so not surfaced.
  for (const { pick, detail } of a.props) {
    if (stakeOf(pick) <= 0) continue;
    rows.push({
      key: `${a.game.id}-prop-${detail.player}-${detail.market}`,
      matchup,
      kickoff,
      pickType: 'Prop',
      description: `${detail.player} ${detail.side} ${detail.line} ${detail.market} (${matchup})`,
      market: `Week ${week} · Prop`,
      price: pick.price,
      stakeUnits: stakeOf(pick),
      edge: pick.edge,
      confidence: pick.confidence,
      gameId: a.game.id,
      side: pick.side,
      line: pick.line,
      player: detail.player,
      propMarket: detail.market,
      disconnect: pick.disconnect,
      signal: pick.note,
      narrative: pick.narrative,
    });
  }
  for (const td of a.anytimeTds) {
    const stake = stakeOf(td);
    if (stake <= 0) continue;
    rows.push({
      key: `${a.game.id}-atd-${td.player}`,
      matchup,
      kickoff,
      pickType: 'Anytime TD',
      description: `${td.player} Anytime TD (${matchup})`,
      market: `Week ${week} · Anytime TD`,
      price: td.price,
      stakeUnits: stake,
      edge: td.edge,
      confidence: Math.round(td.prob * 100),
      gameId: a.game.id,
      player: td.player,
      disconnect: td.disconnect,
      signal: td.note,
      narrative: td.narrative,
      // ATD edges are tiny by nature — exempt from the sides/totals edge floor.
      floorExempt: true,
      longshot: td.price >= 600,
    });
  }
  // Dedicated big-payout longshot (best +EV scorer), surfaced even if thin-edge.
  const ls = a.anytimeTdLongshot;
  if (ls && !a.anytimeTds.some((t) => t.player === ls.player) && stakeOf(ls) > 0) {
    rows.push({
      key: `${a.game.id}-atd-ls-${ls.player}`,
      matchup,
      kickoff,
      pickType: 'Anytime TD',
      description: `${ls.player} Anytime TD (${matchup})`,
      market: `Week ${week} · Anytime TD`,
      price: ls.price,
      stakeUnits: stakeOf(ls),
      edge: ls.edge,
      confidence: Math.round(ls.prob * 100),
      gameId: a.game.id,
      player: ls.player,
      disconnect: ls.disconnect,
      signal: ls.note,
      narrative: ls.narrative,
      floorExempt: true,
      longshot: true,
    });
  }
  // Same-game parlay (correlated legs) from the live DK feed.
  const sgp = sgpForGame(a);
  if (sgp && sgp.units > 0) {
    rows.push({
      key: `${a.game.id}-sgp`,
      matchup,
      kickoff,
      pickType: 'SGP',
      description: `SGP (${matchup}): ${sgp.legs.map((l) => l.selection).join(' + ')}`,
      market: `Week ${week} · SGP`,
      price: sgp.americanOdds,
      stakeUnits: Number(sgp.units.toFixed(2)),
      edge: sgp.ev,
      confidence: 0,
      gameId: a.game.id,
    });
  }
  return rows;
}

export default async function BetNowPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const activeWeek = await getActiveWeek();

  // Default view auto-rolls to the next slate that still has pre-kickoff value.
  let defaultWeek = activeWeek;
  let defaultUpcoming: GameAnalysis[] = [];
  for (let w = activeWeek; w <= Math.min(18, activeWeek + 2); w++) {
    const { games } = await getGames(w);
    const ratings = await getFormRatings(w);
    const analyses = await analyzeGamesWithLocks(games, ratings);
    const up = analyses.filter((a) => hoursToKickoff(a.game.kickoff) > 0);
    if (up.length) {
      defaultWeek = w;
      defaultUpcoming = up;
      break;
    }
  }

  // An explicit ?week= lets you scout future weeks/lines from the same board.
  const explicit = sp.week ? Math.max(1, Math.min(18, Number(sp.week) || defaultWeek)) : undefined;
  const week = explicit ?? defaultWeek;
  const isDefaultView = week === defaultWeek;

  let upcoming: GameAnalysis[];
  if (isDefaultView) {
    upcoming = defaultUpcoming;
  } else {
    const { games } = await getGames(week);
    const ratings = await getFormRatings(week);
    const analyses = await analyzeGamesWithLocks(games, ratings);
    upcoming = analyses.filter((a) => hoursToKickoff(a.game.kickoff) > 0);
  }

  // Every unlocked (pre-kickoff) game for the week, ordered by kickoff.
  const sorted = [...upcoming].sort(
    (a, b) => new Date(a.game.kickoff).getTime() - new Date(b.game.kickoff).getTime(),
  );
  // Snapshot the current market as the closing line (frozen at kickoff) so CLV is
  // tracked automatically from this daily page — never touches locked snapshots.
  // Only from the live default view: scouting a future week must not freeze a
  // premature "closing" line for games days/weeks from kickoff.
  if (isDefaultView) await captureClosingLines(sorted.map((a) => a.game));
  const dayLabelOf = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
  const rows = sorted.flatMap((a) =>
    collectRows(a, week).map((r) => ({ ...r, day: dayLabelOf(a.game.kickoff) })),
  );
  // A bet earns a spot here with genuine price value (edge vs the current number).
  // Anytime-TD rows are floor-exempt — their edges are tiny by nature and the model
  // already gates them on EV / News+Narrative conviction.
  const valued = rows.filter((r) => r.edge >= EDGE_FLOOR || r.floorExempt);

  // Beat-writer wire (per-team Google News + national feeds), soonest teams first.
  const newsTeams = [...new Set(sorted.slice(0, 6).flatMap((a) => [a.game.home, a.game.away]))];
  const wireRaw = await getWire(newsTeams);
  const wire = wireRaw.length
    ? wireRaw.slice(0, 16)
    : relevantNews(await getNflNews(), new Set(newsTeams));
  const breakingTeams = [...new Set(wire.filter((n) => n.breaking).flatMap((n) => n.teams))];

  const dayCount = new Set(valued.map((r) => r.day)).size;
  const totalUnits = valued.reduce((s, r) => s + r.stakeUnits, 0);

  // Units already placed per pick (server-side bankroll store) for the PDF.
  const placedBets = await readPlacedBets();
  const placedByIdentity = new Map<string, number>();
  for (const b of placedBets) {
    const k = betIdentity(b);
    if (k) placedByIdentity.set(k, (placedByIdentity.get(k) ?? 0) + (b.stakeUnits ?? 0));
  }
  const placedForRow: Record<string, number> = {};
  for (const r of valued) placedForRow[r.key] = placedByIdentity.get(betIdentity(r)) ?? 0;

  return (
    <>
      <PrintBetNow rows={valued} week={week} season={SEASON} placed={placedForRow} />
      <div className="screen-only space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          title="Bet Now"
          subtitle={
            valued.length
              ? `${valued.length} value bets · ${sorted.length} unlocked games across ${dayCount} day${dayCount > 1 ? 's' : ''} · ${totalUnits.toFixed(1)}u · only genuine price value (≥2% edge)`
              : 'No unlocked games with real price value right now'
          }
          icon={<Zap size={18} />}
        />
        <div className="flex items-center gap-2">
          {!isDefaultView && <Chip variant="fade">Scouting future week</Chip>}
          <WeekSelector week={week} currentWeek={defaultWeek} basePath="/bet-now" />
          {valued.length > 0 && (
            <ExportPdfButton label="Export PDF" title="Export the Bet Now value bets as a PDF" />
          )}
          <RefreshPicks />
        </div>
      </div>

      {valued.length === 0 ? (
        <div className="card p-6 text-sm text-zinc-400">
          Nothing worth betting yet — no unlocked game carries genuine price value (≥2% edge). Bets
          only appear here when we&apos;re getting a better-than-fair number. Check back as lines post.
        </div>
      ) : (
        <>
          {breakingTeams.length > 0 && (
            <div className="card border-red-500/40 bg-red-500/5 p-3 text-xs text-red-300">
              <span className="font-semibold">⚠ Breaking status news</span> — verify inactives before
              betting: {breakingTeams.join(', ')}. The model uses the structured injury feed and may
              lag last-minute reports.
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <BetNowBoard rows={valued} season={SEASON} news={wire} />
            <NewsWire items={wire} />
          </div>
        </>
      )}
      </div>
    </>
  );
}

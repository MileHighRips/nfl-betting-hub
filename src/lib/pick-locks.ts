import { promises as fs } from 'fs';
import path from 'path';
import type { Game, ModelPick, PlayerProp } from './types';
import type { GameAnalysis, AnytimeTdPick } from './model';
import type { Ratings } from './form';
import { analyzeGame } from './model';
import { getGames } from './odds-source';
import { getFormRatings } from './form';
import { memo } from './cache';

const STORE_DIR = path.join(process.cwd(), 'data', 'store');
const STORE_FILE = path.join(STORE_DIR, 'pick-locks.json');

interface LockedAnalysis {
  lockedAt: string;
  /** True when a user locked the game by hand (vs. the 6 AM auto-lock). */
  manual?: boolean;
  picks: {
    spread: ModelPick;
    moneyline: ModelPick;
    total: ModelPick;
    prop: ModelPick;
    propDetail: PlayerProp;
    /** Multiple +EV props (new format). Absent on legacy single-prop locks. */
    props?: { pick: ModelPick; detail: PlayerProp }[];
    upset?: ModelPick;
    anytimeTd?: AnytimeTdPick;
    anytimeTdLongshot?: AnytimeTdPick;
    /** Multiple +EV anytime-TD scorers (new format). Absent on legacy locks. */
    anytimeTds?: AnytimeTdPick[];
  };
}

interface LockStore {
  locks: Record<string, LockedAnalysis>;
  /** Games the user unlocked by hand — auto-lock is suppressed for these. */
  unlocked: string[];
}

function easternParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

function isLockDue(game: Game, now: Date): boolean {
  if (game.status && game.status !== 'pre') return false;
  const kickoff = easternParts(new Date(game.kickoff));
  const current = easternParts(now);
  return (
    kickoff.year === current.year &&
    kickoff.month === current.month &&
    kickoff.day === current.day &&
    Number(current.hour) >= 6 &&
    new Date(game.kickoff).getTime() > now.getTime()
  );
}

async function readLocks(): Promise<LockStore> {
  try {
    const raw = JSON.parse(await fs.readFile(STORE_FILE, 'utf-8'));
    if (raw && typeof raw === 'object' && raw.locks && typeof raw.locks === 'object') {
      return { locks: raw.locks, unlocked: Array.isArray(raw.unlocked) ? raw.unlocked : [] };
    }
    // Migrate the legacy flat `{ gameId: LockedAnalysis }` shape.
    return { locks: (raw ?? {}) as Record<string, LockedAnalysis>, unlocked: [] };
  } catch {
    return { locks: {}, unlocked: [] };
  }
}

async function writeLocks(store: LockStore): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function snapshot(analysis: GameAnalysis): LockedAnalysis['picks'] {
  return {
    spread: analysis.spread,
    moneyline: analysis.moneyline,
    total: analysis.total,
    prop: analysis.prop,
    propDetail: analysis.propDetail,
    props: analysis.props,
    upset: analysis.upset,
    anytimeTd: analysis.anytimeTd,
    anytimeTdLongshot: analysis.anytimeTdLongshot,
    anytimeTds: analysis.anytimeTds,
  };
}

function applySnapshot(analysis: GameAnalysis, locked: LockedAnalysis['picks']): GameAnalysis {
  const candidates = [locked.spread, locked.moneyline, locked.total, locked.prop];
  const topPick = candidates.reduce((best, pick) =>
    pick.confidence > best.confidence ? pick : best,
  );
  // IMMUTABLE LOCK RULE: a locked game renders ONLY its stored snapshot. Never
  // fall back to fresh analysis for any field — what was locked stays locked.
  return {
    ...analysis,
    spread: locked.spread,
    moneyline: locked.moneyline,
    total: locked.total,
    prop: locked.prop,
    propDetail: locked.propDetail,
    props: locked.props ?? [{ pick: locked.prop, detail: locked.propDetail }],
    upset: locked.upset,
    anytimeTd: locked.anytimeTd,
    anytimeTdLongshot: locked.anytimeTdLongshot,
    anytimeTds:
      locked.anytimeTds ??
      [locked.anytimeTd, locked.anytimeTdLongshot].filter((p): p is AnytimeTdPick => Boolean(p)),
    topPick,
  };
}

/** Analyze games and freeze each one after 6:00 AM Eastern on kickoff day. */
export async function analyzeGamesWithLocks(
  games: Game[],
  ratings?: Ratings,
  now = new Date(),
): Promise<GameAnalysis[]> {
  // Memoize the CPU-heavy Monte-Carlo output per week so repeat renders don't
  // re-run it (it blocks the event loop). Locks are still applied fresh below,
  // so lock/unlock reflects immediately. Refresh Picks clears the memo.
  const week = games[0]?.week;
  const fresh =
    week != null
      ? await memo(`analyses-${week}`, 45_000, async () =>
          games.map((game) => analyzeGame(game, ratings)),
        )
      : games.map((game) => analyzeGame(game, ratings));
  const store = await readLocks();
  let changed = false;

  const analyses = fresh.map((analysis) => {
    const existing = store.locks[analysis.game.id];
    if (existing) {
      // IMMUTABLE LOCK RULE: never mutate a stored snapshot from fresh analysis.
      // Render exactly what was frozen at lock time.
      return { ...applySnapshot(analysis, existing.picks), locked: true };
    }
    // A hand-unlocked game stays live even past its auto-lock window.
    if (store.unlocked.includes(analysis.game.id)) return { ...analysis, locked: false };
    if (!isLockDue(analysis.game, now)) return { ...analysis, locked: false };

    store.locks[analysis.game.id] = { lockedAt: now.toISOString(), picks: snapshot(analysis) };
    changed = true;
    return { ...analysis, locked: true };
  });

  if (changed) await writeLocks(store);
  return analyses;
}

/** Re-run the model for a single game so it can be snapshotted on a manual lock. */
async function analyzeOneGame(gameId: string): Promise<GameAnalysis | undefined> {
  const match = gameId.match(/-w(\d+)-/);
  if (!match) return undefined;
  const week = Number(match[1]);
  const [{ games }, ratings] = await Promise.all([getGames(week), getFormRatings(week)]);
  const game = games.find((g) => g.id === gameId);
  return game ? analyzeGame(game, ratings) : undefined;
}

/** Manually freeze a game's picks now, clearing any prior unlock override. */
export async function lockGame(gameId: string): Promise<boolean> {
  const store = await readLocks();
  store.unlocked = store.unlocked.filter((id) => id !== gameId);
  if (!store.locks[gameId]) {
    const analysis = await analyzeOneGame(gameId);
    if (!analysis) {
      await writeLocks(store);
      return false;
    }
    store.locks[gameId] = {
      lockedAt: new Date().toISOString(),
      manual: true,
      picks: snapshot(analysis),
    };
  }
  await writeLocks(store);
  return true;
}

/** Manually unlock a game so it re-runs on fresh data and skips auto-lock. */
export async function unlockGame(gameId: string): Promise<boolean> {
  const store = await readLocks();
  delete store.locks[gameId];
  if (!store.unlocked.includes(gameId)) store.unlocked.push(gameId);
  await writeLocks(store);
  return true;
}

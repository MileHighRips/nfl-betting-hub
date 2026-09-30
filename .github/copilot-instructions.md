# Copilot instructions — nfl-betting-hub

## RULE: Locked picks are immutable — never change them

Once a game's picks are locked, that snapshot is permanent. It must render
exactly as frozen, forever, regardless of any code, model, data, or schedule
changes. This is a hard rule with no exceptions.

**Where locks live**
- Stored snapshots: `data/store/pick-locks.json` (`{ locks, unlocked }`).
- Logic: `src/lib/pick-locks.ts` (`analyzeGamesWithLocks`, `applySnapshot`,
  `lockGame`, `unlockGame`).

**You MUST NOT**
- Mutate, overwrite, re-snapshot, "upgrade", backfill, or migrate any existing
  entry under `locks` in `data/store/pick-locks.json`.
- Make a locked game read any value from fresh analysis. `applySnapshot` renders
  ONLY the stored snapshot — never add `?? analysis.*` fallbacks or similar.
- Add code that rewrites locked snapshots when new pick fields/markets are
  introduced. New fields apply to future locks only; old locks stay as-is.
- Change `analyzeGame`/model logic in a way that alters what a *locked* game
  displays. Fresh model changes may only affect unlocked games.

**You MAY**
- Create a NEW lock (auto-lock at 6 AM ET on kickoff day, or manual `lockGame`).
- Unlock a game via `unlockGame` (moves it to `unlocked`, suppresses auto-lock).
- Correct a locked snapshot ONLY when the user explicitly asks for that specific
  game, editing just that entry.

**Before merging any change to pick-locks or the model**, verify no locked
game's rendered picks changed (compare a locked game's rows before/after).

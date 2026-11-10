import { promises as fs } from 'fs';
import path from 'path';
import type { Game } from './types';
import type { GameAnalysis } from './model';
import { PLACEMENT_FEE_DOLLARS } from './betting-costs';
import { serializeStoreUpdate, writeJsonAtomically } from './store-io';

const STORE_DIR = path.join(process.cwd(), 'data', 'store');
const STORE_FILE = path.join(STORE_DIR, 'model-picks.json');

export interface LivePickInput {
  key: string;
  gameId: string;
  kickoff: string;
  pickType: string;
  description: string;
  market: string;
  price: number;
  stakeUnits: number;
  betDollars: number;
  modelProb?: number;
  marketProb?: number;
  decisionProb?: number;
  book?: string;
  side?: string;
  line?: number;
  alternateLine?: boolean;
  player?: string;
  propMarket?: string;
  recommended?: boolean;
  decisionReason?: string;
  modelVersion?: string;
}

export interface StoredLivePick extends LivePickInput {
  feeDollars: number;
  observedAt: string;
}

export interface LivePickSnapshot {
  firstSeenAt: string;
  lastSeenAt: string;
  picks: StoredLivePick[];
  candidates?: StoredLivePick[];
  modelInputs?: LiveModelInputSnapshot;
}

export interface LiveModelInputSnapshot {
  modelVersion: string;
  observedAt: string;
  gameContext: Game['context'];
  books: Game['books'];
  outPlayers?: Game['outPlayers'];
  injuryReports?: Game['injuryReports'];
  livePropCandidates?: Game['livePropCandidates'];
  livePropLines?: Game['livePropLines'];
  anytimeTdCandidates?: Game['anytimeTdCandidates'];
  factors: GameAnalysis['factors'];
  projections: {
    home: number;
    away: number;
    margin: number;
    total: number;
    homeWinProb: number;
    marginSd: number;
  };
  teamRatings: {
    home: { net: number; offense: number; defense: number; elo: number };
    away: { net: number; offense: number; defense: number; elo: number };
  };
}

export type LiveModelInputDraft = Omit<LiveModelInputSnapshot, 'observedAt'>;

export interface LiveGamePickHistory {
  season: number;
  week: number;
  kickoff: string;
  snapshots: LivePickSnapshot[];
}

export type LivePickHistory = Record<string, LiveGamePickHistory>;

async function readHistory(): Promise<LivePickHistory> {
  try {
    return JSON.parse(await fs.readFile(STORE_FILE, 'utf-8')) as LivePickHistory;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function stablePicks(picks: LivePickInput[], observedAt: string): StoredLivePick[] {
  return picks
    .map((pick) => ({ ...pick, feeDollars: PLACEMENT_FEE_DOLLARS, observedAt }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function pickFingerprint(picks: StoredLivePick[]): string {
  return JSON.stringify(picks, (key, value) => (key === 'observedAt' ? undefined : value));
}

function inputFingerprint(input: LiveModelInputSnapshot | undefined): string {
  return JSON.stringify(input, (key, value) => (key === 'observedAt' ? undefined : value));
}

async function saveSnapshot(
  games: Game[],
  picks: LivePickInput[],
  candidates: LivePickInput[],
  modelInputs: Record<string, LiveModelInputDraft>,
  capturedAt: string,
): Promise<void> {
  const history = await readHistory();
  const changedGames: string[] = [];

  for (const game of games) {
    if (
      !Number.isFinite(Date.parse(game.kickoff)) ||
      Date.parse(game.kickoff) <= Date.parse(capturedAt) ||
      game.status === 'in' ||
      game.status === 'post'
    )
      continue;

    const gamePicks = stablePicks(
      picks.filter((pick) => pick.gameId === game.id),
      capturedAt,
    );
    const gameCandidates = stablePicks(
      candidates.filter((candidate) => candidate.gameId === game.id),
      capturedAt,
    );
    const entry = (history[game.id] ??= {
      season: game.season,
      week: game.week,
      kickoff: game.kickoff,
      snapshots: [],
    });
    const previous = entry.snapshots[entry.snapshots.length - 1];
    const gameModelInputs = modelInputs[game.id]
      ? { ...modelInputs[game.id], observedAt: capturedAt }
      : previous?.modelInputs;
    const samePicks =
      previous &&
      pickFingerprint(previous.picks) === pickFingerprint(gamePicks) &&
      pickFingerprint(previous.candidates ?? []) === pickFingerprint(gameCandidates) &&
      inputFingerprint(previous.modelInputs) === inputFingerprint(gameModelInputs);

    if (samePicks) {
      previous.lastSeenAt = capturedAt;
      previous.picks = gamePicks;
      previous.candidates = gameCandidates;
      previous.modelInputs = gameModelInputs;
    } else {
      entry.snapshots.push({
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
        picks: gamePicks,
        candidates: gameCandidates,
        modelInputs: gameModelInputs,
      });
    }
    entry.season = game.season;
    entry.week = game.week;
    entry.kickoff = game.kickoff;
    changedGames.push(game.id);
  }

  if (!changedGames.length) return;
  await writeJsonAtomically(STORE_FILE, history);
}

/** Save changing Bet Now recommendations before kickoff; identical refreshes coalesce. */
export function recordLivePickSnapshots(
  games: Game[],
  picks: LivePickInput[],
  candidates: LivePickInput[] = picks,
  modelInputs: Record<string, LiveModelInputDraft> = {},
): Promise<void> {
  const capturedAt = new Date().toISOString();
  return serializeStoreUpdate(STORE_FILE, () =>
    saveSnapshot(games, picks, candidates, modelInputs, capturedAt),
  );
}

export async function getLivePickHistory(): Promise<LivePickHistory> {
  return readHistory();
}

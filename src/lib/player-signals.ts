import type { NewsItem } from './news';

/**
 * Structured beat-writer / role signals — the "hidden value" layer. We do NOT do
 * sentiment/NLP (a proven noise trap); instead we match SPECIFIC, actionable
 * phrases to a NAMED player and emit a bounded, labeled adjustment. Everything is
 * transparent (reason string) and capped, so free text can never run the model.
 */

export interface PlayerSignal {
  player: string;
  status?: 'out' | 'questionable';
  /** Bounded usage/probability multiplier applied to that player (0.8–1.25). */
  roleBoost: number;
  /** Promoted to a lead / goal-line / every-down role → independent TD floor. */
  lead?: boolean;
  /** Human-readable reason + source, shown on the pick for transparency. */
  reason: string;
}

const OUT =
  /\b(ruled out|will not play|won'?t play|inactive|is out\b|out for the (game|season|year)|declared out|placed on ir|injured reserve|miss(es|ing)? (the game|sunday|monday|thursday))\b/i;
const DOUBT =
  /\b(questionable|game[- ]time decision|limited (in )?practice|did not practice|\bdnp\b|banged up|dinged|nursing|a game[- ]time)\b/i;
const LEAD =
  /\b(goal[- ]?line|lead back|every[- ]?down|bell[- ]?cow|workhorse|feature[d]? back|will start|expected to start|lead the backfield|top (back|option)|primary (back|option|target)|increased (role|work|snaps|touches)|more (carries|touches|work|snaps)|step(s|ping)? in|next man up|take over|RB1|WR1)\b/i;
const DOWN =
  /\b(reduced role|committee|timeshare|lose[s]? (snaps|work|carries)|backup role|benched|limited snaps|split (backfield|carries))\b/i;

/**
 * Build signals only for players we actually care about (the candidate pool), by
 * scanning headlines that name them. Returns a map keyed by lowercased name.
 */
export function buildPlayerSignals(
  news: NewsItem[],
  players: string[],
): Record<string, PlayerSignal> {
  const result: Record<string, PlayerSignal> = {};
  for (const player of [...new Set(players)]) {
    const key = player.toLowerCase();
    if (result[key] || key.length < 4) continue;
    const hits = news.filter((n) => n.headline.toLowerCase().includes(key));
    if (!hits.length) continue;
    const text = hits.map((h) => h.headline).join(' \u2022 ');
    const src = hits.find((h) => h.source)?.source;

    let roleBoost = 1;
    let status: PlayerSignal['status'] | undefined;
    let lead = false;
    const reasons: string[] = [];

    if (OUT.test(text)) {
      status = 'out';
      reasons.push('ruled out');
    } else if (DOUBT.test(text)) {
      status = 'questionable';
      roleBoost *= 0.9;
      reasons.push('questionable');
    }
    if (LEAD.test(text)) {
      lead = true;
      roleBoost *= 1.2;
      reasons.push('lead/goal-line role');
    }
    if (DOWN.test(text)) {
      roleBoost *= 0.85;
      reasons.push('reduced role');
    }
    if (!reasons.length) continue;

    roleBoost = Math.max(0.8, Math.min(1.25, roleBoost));
    result[key] = {
      player,
      status,
      roleBoost,
      lead,
      reason: reasons.join(', ') + (src ? ` (${src})` : ''),
    };
  }
  return result;
}

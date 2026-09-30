const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;

/** Normalize a player name for matching (strip punctuation, suffixes, case). */
export function normName(n: string): string {
  return n
    .toLowerCase()
    .replace(/[.''`]/g, '')
    .replace(SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if two names refer to the same player (handles Cam/Cameron, Jr., D.J./DJ). */
export function namesMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return true;
  const pa = na.split(' ');
  const pb = nb.split(' ');
  const lastA = pa[pa.length - 1];
  const lastB = pb[pb.length - 1];
  if (!lastA || lastA !== lastB) return false;
  const firstA = pa[0] ?? '';
  const firstB = pb[0] ?? '';
  return firstA === firstB || firstA.startsWith(firstB) || firstB.startsWith(firstA);
}

/** Find a stat entry whose player matches the given name, fuzzily. */
export function findStat<T extends { player: string }>(stats: T[], name: string): T | undefined {
  return stats.find((s) => namesMatch(s.player, name));
}

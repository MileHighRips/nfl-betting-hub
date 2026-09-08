export function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(n: number, digits = 1): string {
  const s = n >= 0 ? '+' : '';
  return `${s}${(n * 100).toFixed(digits)}%`;
}

export function fmtKick(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function confidenceTone(c: number): string {
  if (c >= 68) return 'text-emerald-400';
  if (c >= 58) return 'text-lime-400';
  if (c >= 50) return 'text-amber-400';
  return 'text-zinc-400';
}

export function confidenceBg(c: number): string {
  if (c >= 68) return 'bg-emerald-500';
  if (c >= 58) return 'bg-lime-500';
  if (c >= 50) return 'bg-amber-500';
  return 'bg-zinc-500';
}

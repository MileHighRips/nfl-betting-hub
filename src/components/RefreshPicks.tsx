'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';

export default function RefreshPicks() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  const refresh = () => {
    setSpinning(true);
    startTransition(async () => {
      // Purge the cached odds/injury/weather fetches first, then re-render.
      await fetch('/api/refresh', { method: 'POST' }).catch(() => {});
      router.refresh();
    });
    // Keep the spin animation running briefly so the action reads as intentional.
    setTimeout(() => setSpinning(false), 900);
  };

  return (
    <button
      onClick={refresh}
      disabled={isPending}
      title="Re-run the model on unlocked games with the latest news, injuries and weather"
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-60"
    >
      <RefreshCw size={14} className={clsx((isPending || spinning) && 'animate-spin')} />
      {isPending ? 'Refreshing…' : 'Refresh Picks'}
    </button>
  );
}

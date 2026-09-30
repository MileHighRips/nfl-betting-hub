'use client';

import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';

/**
 * Purges every cached server feed (odds, injuries, weather, news, results),
 * then hard-reloads so the client Router Cache is wiped too — guaranteeing every
 * page (Bet Now included) re-pulls fresh data on next visit, not a stale payload.
 */
export default function RefreshAllButton() {
  const [isPending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  const refresh = () => {
    setSpinning(true);
    startTransition(async () => {
      await fetch('/api/refresh', { method: 'POST' }).catch(() => {});
      // Full reload clears the client-side Router Cache for ALL routes, so a
      // soft navigation to Bet Now can't serve a stale cached render.
      window.location.reload();
    });
  };

  return (
    <button
      onClick={refresh}
      disabled={isPending}
      title="Purge every cached data feed (odds, injuries, weather, news, results) and reload so all pages re-pull fresh data"
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-60"
    >
      <RefreshCw size={14} className={clsx((isPending || spinning) && 'animate-spin')} />
      {isPending ? 'Refreshing all…' : 'Refresh all data'}
    </button>
  );
}

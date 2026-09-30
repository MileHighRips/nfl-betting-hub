'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LockOpen } from 'lucide-react';
import clsx from 'clsx';

/**
 * Interactive per-game lock chip. Locked freezes the current picks; unlocked
 * keeps them live and suppresses the automatic kickoff-morning lock.
 */
export default function LockToggle({ gameId, locked }: { gameId: string; locked: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      await fetch('/api/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, action: locked ? 'unlock' : 'lock' }),
      }).catch(() => {});
      router.refresh();
    });
  };

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      title={locked ? 'Picks are frozen — click to unlock and re-run on fresh data' : 'Picks are live — click to lock them in now'}
      className={clsx(
        'chip transition disabled:opacity-60',
        locked
          ? 'border-zinc-400/40 bg-zinc-500/10 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300'
          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-zinc-400/50 hover:text-zinc-200',
      )}
    >
      {locked ? <Lock size={10} /> : <LockOpen size={10} />}
      {isPending ? '…' : locked ? 'Picks Locked' : 'Picks Live'}
    </button>
  );
}

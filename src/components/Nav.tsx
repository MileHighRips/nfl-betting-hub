'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarRange,
  Trophy,
  Flame,
  ClipboardList,
  BrainCircuit,
  ListChecks,
  Coins,
  Skull,
  Zap,
} from 'lucide-react';
import { useBankroll } from '@/lib/store';
import { fmtMoney } from '@/lib/format';
import clsx from 'clsx';

const LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bet-now', label: 'Bet Now', icon: Zap },
  { href: '/slate', label: 'Weekly Slate', icon: CalendarRange },
  { href: '/picks', label: 'All Picks', icon: ListChecks },
  { href: '/true-units', label: 'True Units', icon: Coins },
  { href: '/futures', label: 'Futures', icon: Trophy },
  { href: '/eliminator', label: 'Eliminator', icon: Skull },
  { href: '/value', label: 'Value Board', icon: Flame },
  { href: '/tracker', label: 'Bet Tracker', icon: ClipboardList },
  { href: '/methodology', label: 'The Model', icon: BrainCircuit },
];

export default function Nav() {
  const pathname = usePathname();
  const { stats } = useBankroll();
  const positive = stats.profit >= 0;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[rgba(8,9,13,0.8)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 font-black text-black">
            LL
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">
              Locky<span className="grad-text">Lines</span>
            </div>
            <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
              NFL Betting Hub
            </div>
          </div>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  active
                    ? 'bg-[var(--color-surface-2)] text-white'
                    : 'text-zinc-400 hover:text-white',
                )}
              >
                <Icon size={15} />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-right sm:block">
            <div className="text-[10px] tracking-widest text-zinc-500 uppercase">P/L</div>
            <div
              className={clsx(
                'mono text-sm font-bold',
                positive ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {fmtMoney(stats.profit)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-right">
            <div className="text-[10px] tracking-widest text-zinc-500 uppercase">Record</div>
            <div className="mono text-sm font-bold text-white">{stats.record}</div>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-[var(--color-border)] px-2 py-2 md:hidden">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
                active ? 'bg-[var(--color-surface-2)] text-white' : 'text-zinc-400',
              )}
            >
              <Icon size={14} />
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

import { Newspaper } from 'lucide-react';
import type { NewsItem } from '@/lib/news';
import { TEAMS } from '@/lib/teams';

function ago(iso?: string): string {
  if (!iso) return '';
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function NewsWire({ items }: { items: NewsItem[] }) {
  if (!items.length) return null;
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Newspaper size={15} className="text-cyan-400" />
        <span className="text-sm font-semibold text-white">News Wire</span>
        <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
          ESPN · updates ~2 min
        </span>
      </div>
      <div className="space-y-2">
        {items.map((n, i) => {
          const body = (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5">
                  {n.breaking && (
                    <span className="mt-0.5 shrink-0 rounded border border-red-500/50 bg-red-500/15 px-1 text-[9px] font-bold text-red-300">
                      BREAKING
                    </span>
                  )}
                  <span className="text-sm text-zinc-200">{n.headline}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                  {n.teams.slice(0, 3).map((t) => (
                    <span key={t} className="font-semibold text-zinc-400">
                      {TEAMS[t]?.abbr ?? t}
                    </span>
                  ))}
                  {n.source && <span className="truncate text-zinc-500">· {n.source}</span>}
                  <span className="ml-auto shrink-0">{ago(n.published)}</span>
                </div>
              </div>
            </div>
          );
          return n.link ? (
            <a
              key={i}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 transition hover:border-cyan-500/40"
            >
              {body}
            </a>
          ) : (
            <div
              key={i}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5"
            >
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

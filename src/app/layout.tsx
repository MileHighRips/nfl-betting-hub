import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import { BankrollProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: 'LockyLines · NFL Betting Hub',
  description:
    'A mathematically-grounded NFL betting hub built on Ken Barkley\u2019s models: weekly lines, futures, value board, props and bankroll tracking.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <BankrollProvider>
          <Nav />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
          <footer className="border-t border-[var(--color-border)] px-4 py-6 text-center text-xs text-zinc-600">
            Built on Ken Barkley&rsquo;s 2026 NFL betting models · For entertainment purposes · Bet
            responsibly · 1U = configurable
          </footer>
        </BankrollProvider>
      </body>
    </html>
  );
}

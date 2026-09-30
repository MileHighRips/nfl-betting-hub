'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PlacedBet } from './types';
import { americanToProfit } from './odds';

const LS_KEY = 'nfl-hub-bets';
const LS_UNIT = 'nfl-hub-unit';

interface BankrollState {
  bets: PlacedBet[];
  unitSize: number;
  setUnitSize: (n: number) => void;
  placeBet: (bet: Omit<PlacedBet, 'id' | 'placedAt' | 'unitSize' | 'status'>) => void;
  updateStatus: (id: string, status: PlacedBet['status']) => void;
  removeBet: (id: string) => void;
  refresh: () => void;
  stats: BankrollStats;
}

export interface BankrollStats {
  placed: number;
  pending: number;
  won: number;
  lost: number;
  push: number;
  staked: number; // $ risked on settled bets
  profit: number; // $ net on settled bets
  roi: number; // profit / staked
  pendingRisk: number; // $ at risk on pending
  record: string;
}

const Ctx = createContext<BankrollState | null>(null);

export function computeStats(bets: PlacedBet[], unitSize: number): BankrollStats {
  let won = 0,
    lost = 0,
    push = 0,
    pending = 0,
    staked = 0,
    profit = 0,
    pendingRisk = 0;
  for (const b of bets) {
    const risk = b.stakeUnits * b.unitSize;
    if (b.status === 'pending') {
      pending++;
      pendingRisk += risk;
      continue;
    }
    if (b.status === 'push') {
      push++;
      continue;
    }
    staked += risk;
    if (b.status === 'won') {
      won++;
      profit += risk * americanToProfit(b.price);
    } else if (b.status === 'lost') {
      lost++;
      profit -= risk;
    }
  }
  return {
    placed: bets.length,
    pending,
    won,
    lost,
    push,
    staked,
    profit,
    roi: staked > 0 ? profit / staked : 0,
    pendingRisk,
    record: `${won}-${lost}${push ? `-${push}` : ''}`,
  };
}

export function BankrollProvider({ children }: { children: ReactNode }) {
  const [bets, setBets] = useState<PlacedBet[]>([]);
  const [unitSize, setUnitSizeState] = useState(10);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    fetch('/api/bets')
      .then((r) => r.json())
      .then((d: { bets: PlacedBet[] }) => setBets(d.bets ?? []))
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  // Hydrate from localStorage immediately, then reconcile with the file store.
  useEffect(() => {
    try {
      const ls = localStorage.getItem(LS_KEY);
      if (ls) setBets(JSON.parse(ls));
      const u = localStorage.getItem(LS_UNIT);
      if (u) setUnitSizeState(Number(u));
    } catch {
      /* ignore */
    }
    refresh();
  }, [refresh]);

  // Persist to localStorage whenever bets change (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(bets));
    } catch {
      /* ignore */
    }
  }, [bets, hydrated]);

  const setUnitSize = useCallback((n: number) => {
    setUnitSizeState(n);
    try {
      localStorage.setItem(LS_UNIT, String(n));
    } catch {
      /* ignore */
    }
  }, []);

  const placeBet = useCallback<BankrollState['placeBet']>(
    (bet) => {
      const full: PlacedBet = {
        ...bet,
        id: `bet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        placedAt: new Date().toISOString(),
        unitSize,
        status: 'pending',
      };
      setBets((prev) => [full, ...prev]);
      fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(full),
      }).catch(() => {});
    },
    [unitSize],
  );

  const updateStatus = useCallback<BankrollState['updateStatus']>((id, status) => {
    setBets((prev) => prev.map((b) => (b.id === id ? { ...b, status, manualStatus: true } : b)));
    fetch('/api/bets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    }).catch(() => {});
  }, []);

  const removeBet = useCallback<BankrollState['removeBet']>((id) => {
    setBets((prev) => prev.filter((b) => b.id !== id));
    fetch('/api/bets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  const stats = useMemo(() => computeStats(bets, unitSize), [bets, unitSize]);

  const value = useMemo(
    () => ({ bets, unitSize, setUnitSize, placeBet, updateStatus, removeBet, refresh, stats }),
    [bets, unitSize, setUnitSize, placeBet, updateStatus, removeBet, refresh, stats],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBankroll(): BankrollState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBankroll must be used within BankrollProvider');
  return ctx;
}

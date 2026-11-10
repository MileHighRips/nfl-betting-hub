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
import { PLACEMENT_FEE_DOLLARS } from './betting-costs';

const LS_KEY = 'nfl-hub-bets';
const LS_UNIT = 'nfl-hub-unit';

interface BankrollState {
  bets: PlacedBet[];
  unitSize: number;
  setUnitSize: (n: number) => void;
  placeBet: (bet: Omit<PlacedBet, 'id' | 'placedAt' | 'unitSize' | 'status'>) => Promise<void>;
  updateStatus: (id: string, status: PlacedBet['status']) => void;
  updateStake: (id: string, patch: { stakeUnits?: number; unitSize?: number }) => void;
  removeBet: (id: string) => void;
  refresh: (clearError?: boolean) => void;
  syncError: string | null;
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
    const stake = b.stakeUnits * b.unitSize;
    const fee = b.fee ?? 0;
    if (b.status === 'pending') {
      pending++;
      pendingRisk += stake + fee;
      continue;
    }
    if (b.status === 'push') {
      push++;
      staked += fee;
      profit -= fee;
      continue;
    }
    staked += stake + fee;
    if (b.status === 'won') {
      won++;
      profit += stake * americanToProfit(b.price) - fee;
    } else if (b.status === 'lost') {
      lost++;
      profit -= stake + fee;
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
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback((clearError = true) => {
    fetch('/api/bets')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Tracker refresh failed with HTTP ${response.status}.`);
        return (await response.json()) as { bets?: PlacedBet[] };
      })
      .then((data) => {
        if (!Array.isArray(data.bets)) throw new Error('Tracker refresh returned invalid data.');
        setBets(data.bets);
        if (clearError) setSyncError(null);
      })
      .catch((error: unknown) => {
        console.error('Failed to refresh the bet tracker.', error);
        setSyncError(
          'Tracker could not sync with the server. Your latest changes may not be saved.',
        );
      })
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
    async (bet) => {
      const full: PlacedBet = {
        ...bet,
        fee: PLACEMENT_FEE_DOLLARS,
        id: `bet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        placedAt: new Date().toISOString(),
        unitSize,
        status: 'pending',
      };
      const response = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(full),
      });
      if (!response.ok) throw new Error(`Saving the bet failed with HTTP ${response.status}.`);
      const result = (await response.json()) as { bets?: PlacedBet[] };
      if (!Array.isArray(result.bets)) throw new Error('The saved bet response was invalid.');
      setBets(result.bets);
      setSyncError(null);
    },
    [unitSize],
  );

  const syncMutation = useCallback(
    (request: Promise<Response>) => {
      void request
        .then(async (response) => {
          if (!response.ok) throw new Error(`Tracker update failed with HTTP ${response.status}.`);
          return (await response.json()) as { bets?: PlacedBet[] };
        })
        .then((data) => {
          if (!Array.isArray(data.bets)) throw new Error('Tracker update returned invalid data.');
          setBets(data.bets);
          setSyncError(null);
        })
        .catch((error: unknown) => {
          console.error('Failed to update the bet tracker.', error);
          setSyncError('Tracker update failed. Refresh to confirm the saved state.');
          refresh(false);
        });
    },
    [refresh],
  );

  const updateStatus = useCallback<BankrollState['updateStatus']>(
    (id, status) => {
      setBets((prev) =>
        prev.map((bet) => (bet.id === id ? { ...bet, status, manualStatus: true } : bet)),
      );
      syncMutation(
        fetch('/api/bets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status }),
        }),
      );
    },
    [syncMutation],
  );

  const updateStake = useCallback<BankrollState['updateStake']>(
    (id, patch) => {
      setBets((prev) => prev.map((bet) => (bet.id === id ? { ...bet, ...patch } : bet)));
      syncMutation(
        fetch('/api/bets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...patch }),
        }),
      );
    },
    [syncMutation],
  );

  const removeBet = useCallback<BankrollState['removeBet']>(
    (id) => {
      setBets((prev) => prev.filter((bet) => bet.id !== id));
      syncMutation(
        fetch('/api/bets', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }),
      );
    },
    [syncMutation],
  );

  const stats = useMemo(() => computeStats(bets, unitSize), [bets, unitSize]);

  const value = useMemo(
    () => ({
      bets,
      unitSize,
      setUnitSize,
      placeBet,
      updateStatus,
      updateStake,
      removeBet,
      refresh,
      syncError,
      stats,
    }),
    [
      bets,
      unitSize,
      setUnitSize,
      placeBet,
      updateStatus,
      updateStake,
      removeBet,
      refresh,
      syncError,
      stats,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBankroll(): BankrollState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBankroll must be used within BankrollProvider');
  return ctx;
}

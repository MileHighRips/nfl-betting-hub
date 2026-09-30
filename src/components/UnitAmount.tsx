'use client';

import { useBankroll } from '@/lib/store';
import { fmtMoney } from '@/lib/format';

/** Dollar value of a unit stake, from the live bankroll unit size. */
export default function UnitAmount({ units, className }: { units: number; className?: string }) {
  const { unitSize } = useBankroll();
  return (
    <span className={className ?? 'mono text-[10px] font-normal text-zinc-400'}>
      {fmtMoney(units * unitSize)}
    </span>
  );
}

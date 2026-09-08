import { Trophy } from 'lucide-react';
import FuturesBoard from '@/components/FuturesBoard';
import { SectionTitle } from '@/components/atoms';

export const metadata = { title: 'Futures & Awards · LockyLines' };

export default function FuturesPage() {
  return (
    <div className="space-y-6">
      <SectionTitle
        title="Futures & Award Markets"
        subtitle="Super Bowl, MVP, all six awards, win totals & divisions — with Ken's actual bets and predictions flagged"
        icon={<Trophy size={18} />}
      />
      <FuturesBoard />
    </div>
  );
}

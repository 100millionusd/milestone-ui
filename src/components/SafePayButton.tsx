'use client';

import { useState } from 'react';
import { payMilestoneSafe } from '@/lib/api';

type Props = {
  bidId: number;
  milestoneIndex: number;
  amountUSD: number;
  disabled?: boolean;
  onQueued?: () => void; // called when server returns 202 pending
};

export default function SafePayButton({ bidId, milestoneIndex, amountUSD, disabled, onQueued }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="inline-flex items-center gap-2">
      <button
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const res = await payMilestoneSafe(bidId, milestoneIndex);
            setMsg('Queued for multisig approval');
            onQueued?.();
          } catch (e: any) {
            setMsg(e?.message || 'Failed to queue Safe payment');
          } finally {
            setBusy(false);
          }
        }}
        className="px-3 py-2 rounded-xl border shadow text-sm disabled:opacity-50"
        title="Route this payment through the Safe (multisig)"
      >
        {busy ? 'Queuing…' : 'Pay via Safe'}
      </button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
      <span className="text-[11px] text-gray-500">(${Number(amountUSD || 0).toFixed(2)})</span>
    </div>
  );
}

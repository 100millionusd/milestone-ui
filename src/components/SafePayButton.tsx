'use client';

import { useState } from 'react';
import { payMilestoneSafe } from '@/lib/api';

type Props = {
  bidId: number;
  milestoneIndex: number;
  amountUSD: number;
  disabled?: boolean;
  onQueued?: (safeTxHash?: string) => void; // optional: receive Safe tx hash
};

export default function SafePayButton({
  bidId,
  milestoneIndex,
  amountUSD,
  disabled,
  onQueued,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [safeHash, setSafeHash] = useState<string | null>(null);

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || busy}
        aria-disabled={disabled || busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          setSafeHash(null);
          try {
            const res: any = await payMilestoneSafe(bidId, milestoneIndex);
            // if your API returns { safeTxHash }, show it:
            if (res?.safeTxHash) setSafeHash(res.safeTxHash);
            setMsg('Queued for multisig approval');
            onQueued?.(res?.safeTxHash);
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

      <span className="text-[11px] text-gray-500">
        (${Number(amountUSD || 0).toFixed(2)})
      </span>

      {msg && <span className="text-xs text-gray-600">{msg}</span>}

      {safeHash && (
        <a
          className="text-xs underline"
          href={`https://safe-transaction-sepolia.safe.global/api/v1/multisig-transactions/${safeHash}`}
          target="_blank"
          rel="noreferrer"
        >
          View Safe tx
        </a>
      )}
    </div>
  );
}

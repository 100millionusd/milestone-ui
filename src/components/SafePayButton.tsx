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

// Optional: let env decide which Safe tx-service to show as a link.
// e.g. NEXT_PUBLIC_SAFE_SERVICE_BASE=https://safe-transaction-mainnet.safe.global
const SAFE_SERVICE_BASE = (
  process.env.NEXT_PUBLIC_SAFE_SERVICE_BASE ||
  'https://safe-transaction-sepolia.safe.global'
).replace(/\/+$/, '');

// Normalize different API shapes to a single safeTxHash string.
function pickSafeTxHash(res: any): string | undefined {
  return (
    res?.safeTxHash ||
    res?.safe_tx_hash ||
    res?.tx?.safeTxHash ||
    res?.tx?.safe_tx_hash ||
    res?.result?.safeTxHash ||
    res?.result?.safe_tx_hash
  );
}

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

  async function handleClick() {
    if (disabled || busy) return;
    setBusy(true);
    setMsg(null);
    setSafeHash(null);

    try {
      const res: any = await payMilestoneSafe(bidId, milestoneIndex);

      const hash = pickSafeTxHash(res);
      if (hash) setSafeHash(hash);

      setMsg('Queued for multisig approval');
      onQueued?.(hash);
    } catch (e: any) {
      // Try to surface a useful backend message
      const errMsg =
        e?.message ||
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        'Failed to queue Safe payment';
      setMsg(errMsg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || busy}
        aria-disabled={disabled || busy}
        aria-busy={busy}
        onClick={handleClick}
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
          href={`${SAFE_SERVICE_BASE}/api/v1/multisig-transactions/${encodeURIComponent(
            safeHash
          )}`}
          target="_blank"
          rel="noreferrer"
        >
          View Safe tx
        </a>
      )}
    </div>
  );
}

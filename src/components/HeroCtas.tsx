// src/components/HeroCtas.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { loginAs } from '@/lib/auth';

export default function HeroCtas({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<'vendor' | 'proposer' | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const onBid = async () => {
    setErr(null); setBusy('vendor');
    try {
      await loginAs('vendor');          // ← role intent
      router.push('/vendor');           // ← change if your vendor start route differs
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally { setBusy(null); }
  };

  const onProposal = async () => {
    setErr(null); setBusy('proposer');
    try {
      await loginAs('proposer');        // ← role intent
      router.push('/proposals/new');    // ← change if your proposer start route differs
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally { setBusy(null); }
  };

  return (
    <div className={className}>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        {/* LEFT button: was “Browse Projects” → now Submit a Bid */}
        <button
          onClick={onBid}
          disabled={!!busy}
          className="px-6 py-3 rounded-md bg-cyan-500 hover:bg-cyan-400 text-white font-semibold disabled:opacity-60"
        >
          {busy === 'vendor' ? 'Connecting…' : 'Submit a Bid'}
        </button>

        {/* RIGHT button: Submit Proposal */}
        <button
          onClick={onProposal}
          disabled={!!busy}
          className="px-6 py-3 rounded-md border border-white/30 bg-white/10 hover:bg-white/20 text-white font-semibold disabled:opacity-60"
        >
          {busy === 'proposer' ? 'Connecting…' : 'Submit Proposal'}
        </button>
      </div>

      {err && <p className="mt-3 text-sm text-red-300 text-center">{err}</p>}
    </div>
  );
}

// src/components/HeroCtas.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { loginAs } from '@/lib/auth';

type Props = { className?: string };

export default function HeroCtas({ className = '' }: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState<'vendor' | 'proposer' | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const onBid = async () => {
    setErr(null); setLoading('vendor');
    try {
      await loginAs('vendor');
      router.push('/vendor');           // adjust if your vendor start page differs
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setLoading(null);
    }
  };

  const onProposal = async () => {
    setErr(null); setLoading('proposer');
    try {
      await loginAs('proposer');
      router.push('/proposals/new');    // adjust if your proposer start page differs
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onBid}
          disabled={loading !== null}
          className="inline-flex items-center justify-center px-5 py-3 rounded-md bg-cyan-500 hover:bg-cyan-400 text-white font-semibold disabled:opacity-60"
        >
          {loading === 'vendor' ? 'Connecting…' : 'Submit a Bid'}
        </button>

        <button
          onClick={onProposal}
          disabled={loading !== null}
          className="inline-flex items-center justify-center px-5 py-3 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/30 disabled:opacity-60"
        >
          {loading === 'proposer' ? 'Connecting…' : 'Submit Proposal'}
        </button>
      </div>

      {err && (
        <p className="mt-3 text-sm text-red-300 text-center">{err}</p>
      )}
    </div>
  );
}

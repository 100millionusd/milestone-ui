// src/components/HeroCtas.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

async function getAddress(web3Provider: any): Promise<string> {
  // Try injected first
  const eth: any = (globalThis as any).ethereum;
  if (eth?.request) {
    const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
    if (accounts?.length) return accounts[0].toLowerCase();
  }
  // Fallback to Web3Auth provider
  if (web3Provider?.request) {
    const accounts: string[] = await web3Provider.request({ method: 'eth_requestAccounts' }).catch(async () => {
      // some providers only expose eth_accounts
      return (await web3Provider.request({ method: 'eth_accounts' })) as string[];
    });
    if (accounts?.length) return accounts[0].toLowerCase();
  }
  throw new Error('No wallet found / not connected');
}

async function signMessage(address: string, message: string, web3Provider: any): Promise<string> {
  // Try injected first
  const eth: any = (globalThis as any).ethereum;
  if (eth?.request) {
    return await eth.request({ method: 'personal_sign', params: [message, address] });
  }
  // Fallback to Web3Auth provider
  if (web3Provider?.request) {
    return await web3Provider.request({ method: 'personal_sign', params: [message, address] });
  }
  throw new Error('No signer available');
}

async function loginWithRole(role: 'vendor' | 'proposer', web3Provider: any) {
  const address = await getAddress(web3Provider);

  // 1) nonce
  const n = await fetch(`${API_BASE}/auth/nonce?address=${address}`, { credentials: 'include' });
  if (!n.ok) throw new Error('Failed to get nonce');
  const { nonce } = await n.json();

  // 2) sign
  const signature = await signMessage(address, nonce, web3Provider);

  // 3) login WITH role intent
  const resp = await fetch(`${API_BASE}/auth/login?role=${role}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Login failed: ${resp.status} ${t}`);
  }
  return resp.json(); // { token, role, roles }
}

export default function HeroCtas({ className = '' }: { className?: string }) {
  const router = useRouter();
  const { provider } = useWeb3Auth(); // from your Web3AuthProvider
  const [busy, setBusy] = React.useState<'vendor' | 'proposer' | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const onBid = async () => {
    setErr(null); setBusy('vendor');
    try {
      await loginWithRole('vendor', provider);
      router.push('/vendor');            // change if your vendor start route differs
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally { setBusy(null); }
  };

  const onProposal = async () => {
    setErr(null); setBusy('proposer');
    try {
      await loginWithRole('proposer', provider);
      router.push('/proposals/new');     // change if your proposer start route differs
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally { setBusy(null); }
  };

  return (
    <div className={`flex flex-wrap items-center justify-center gap-4 ${className}`}>
      {/* LEFT button: now Submit a Bid (vendor) */}
      <button
        onClick={onBid}
        disabled={!!busy}
        className="inline-flex items-center justify-center rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-white hover:bg-cyan-600 disabled:opacity-60"
      >
        {busy === 'vendor' ? 'Connecting…' : 'Submit a Bid'}
      </button>

      {/* RIGHT button: Submit Proposal (proposer) */}
      <button
        onClick={onProposal}
        disabled={!!busy}
        className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10 disabled:opacity-60"
      >
        {busy === 'proposer' ? 'Connecting…' : 'Submit Proposal'}
      </button>

      {err && <p className="w-full text-center text-sm text-red-300">{err}</p>}
    </div>
  );
}

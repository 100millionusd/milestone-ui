'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/api';

/** GET nonce from API; if GET 404, fallback to POST */
async function getNonce(address: string): Promise<string> {
  // try GET
  let resp = await fetch(`${API_BASE}/auth/nonce?address=${encodeURIComponent(address)}`, {
    credentials: 'include',
  });
  if (resp.status === 404) {
    // fallback POST
    resp = await fetch(`${API_BASE}/auth/nonce`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
  }
  if (!resp.ok) throw new Error(await resp.text());
  const { nonce } = await resp.json();
  if (!nonce) throw new Error('nonce missing');
  return nonce;
}

export default function HeroCtas({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'vendor' | 'proposer'>(null);

  async function connectAndLogin(role: 'vendor' | 'proposer') {
    setBusy(role);
    try {
      const eth: any = (window as any).ethereum;
      if (!eth?.request) throw new Error('No wallet found');

      // 1) connect wallet
      const [addr] = await eth.request({ method: 'eth_requestAccounts' });
      const address = String(addr).toLowerCase();

      // 2) get nonce from API origin (handles GET/POST)
      const nonce = await getNonce(address);

      // 3) sign nonce
      const signature = await eth.request({
        method: 'personal_sign',
        params: [nonce, address],
      });

      // 4) login with explicit role
      const r = await fetch(`${API_BASE}/auth/login?role=${role}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature }),
      });
      if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
      const j = await r.json().catch(() => ({} as any));

      // keep Bearer fallback token in localStorage (matches api.ts behavior)
      if (j?.token) {
        try { localStorage.setItem('lx_jwt', String(j.token)); } catch {}
      }

      // 5) go to the right flow
      router.push(role === 'vendor' ? '/projects' : '/new');
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`flex flex-wrap items-center justify-center gap-4 ${className}`}>
      <button
        // [FIX] ONLY this line is changed
        onClick={() => router.push('/vendor/login?next=/vendor/dashboard')}
        disabled={!!busy}
        className="inline-flex items-center justify-center rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-white hover:bg-cyan-600 disabled:opacity-60"
      >
        {busy === 'vendor' ? 'Connecting…' : 'Submit a Bid'}
      </button>

      <button
        // [FIX] ONLY this line is changed
        onClick={() => router.push('/vendor/login?next=/new')}
        disabled={!!busy}
        className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10 disabled:opacity-60"
      >
        {busy === 'proposer' ? 'Connecting…' : 'Submit Proposal'}
      </button>
    </div>
  );
}
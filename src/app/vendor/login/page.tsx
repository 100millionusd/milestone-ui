// src/app/vendor/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { apiFetch } from '@/lib/api';

export default function VendorLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, session } = useWeb3Auth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSignIn() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      // 1) Connect wallet (sets cookie/Bearer via your provider)
      await login();

      // 2) Ask server who we are
      const who = await apiFetch('/auth/role', { cache: 'no-store' });
      const roles = Array.isArray(who?.roles) ? who.roles : (who?.role ? [who.role] : []);
      const isAdmin = roles.includes('admin');
      const isVendor = roles.includes('vendor');
      const next = params.get('next');

      // 3) Route by role
      if (isAdmin && !isVendor) {
        // Admins never get pushed into vendor UI
        router.replace('/admin');
        return;
      }

      if (isVendor) {
        // Vendor wallets straight to dashboard (or ?next=… if provided)
        router.replace(next || '/vendor/dashboard');
        return;
      }

      // No vendor role yet → go complete profile & choose role
      router.replace('/vendor/profile');
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center">
      <div className="space-y-3 text-center">
        {err && <div className="text-rose-700">{err}</div>}
        <button
          onClick={handleSignIn}
          disabled={busy || session === 'authenticating'}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg disabled:opacity-60"
        >
          {busy || session === 'authenticating' ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </main>
  );
}

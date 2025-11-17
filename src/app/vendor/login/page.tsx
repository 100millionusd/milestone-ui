// src/app/vendor/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { apiFetch } from '@/lib/api';
import { loginAs } from '@/lib/auth'; // 1. IMPORT loginAs FROM THE CORRECT FILE

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useWeb3Auth();
  const [busy, setBusy] = useState<'idle' | 'vendor' | 'proposer'>('idle');
  const [err, setErr] = useState<string | null>(null);

  // 2. THIS IS THE NEW HANDLER THAT FIXES THE PROBLEM
  async function handleSignIn(role: 'vendor' | 'proposer') {
    if (busy !== 'idle') return;
    setBusy(role); // Set busy to 'vendor' or 'proposer'
    setErr(null);
    try {
      // 3. CALL loginAs() WITH THE CHOSEN ROLE
      // This explicitly tells the server what the role is.
      await loginAs(role);

      // 4. Now, the rest of the code will work because
      // the user has the correct token.
      const who = await apiFetch('/auth/role', { cache: 'no-store' });
      const roles = Array.isArray(who?.roles) ? who.roles : (who?.role ? [who.role] : []);
      const isAdmin = roles.includes('admin');
      const isVendor = roles.includes('vendor');
      const isProposer = roles.includes('proposer');
      const next = params.get('next');

      // 5. Route by role
      if (isAdmin) {
        router.replace('/admin');
        return;
      }

      if (isVendor) {
        // Vendor wallets straight to dashboard
        router.replace(next || '/vendor/dashboard');
        return;
      }
      
      if (isProposer) {
        // Proposer wallets go to their profile or dashboard
        router.replace(next || '/proposer/profile');
        return;
      }

      // Fallback: New user, send them to the role they just chose
      router.replace(role === 'vendor' ? '/vendor/profile' : '/proposer/profile');
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed');
    } finally {
      setBusy('idle');
    }
  }

  return (
    <main className="min-h-screen grid place-items-center">
      <div className="space-y-4 text-center p-4">
        <h1 className="text-2xl font-semibold">Sign In</h1>
        {err && <div className="text-rose-700 max-w-sm">{err}</div>}
        
        {/* 6. TWO FUCKING BUTTONS INSTEAD OF ONE */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleSignIn('vendor')}
            disabled={busy !== 'idle' || session === 'authenticating'}
            className="bg-emerald-600 text-white px-6 py-3 rounded-lg disabled:opacity-60"
          >
            {busy === 'vendor' ? 'Signing in…' : 'Sign in as Vendor'}
          </button>
          
          <button
            onClick={() => handleSignIn('proposer')}
            disabled={busy !== 'idle' || session === 'authenticating'}
            className="bg-violet-600 text-white px-6 py-3 rounded-lg disabled:opacity-60"
          >
            {busy === 'proposer' ? 'Signing in…' : 'Sign in as Entity (Proposer)'}
          </button>
        </div>
      </div>
    </main>
  );
}
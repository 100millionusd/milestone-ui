// src/app/vendor/login/page.tsx
'use client';

import { useState } from 'react';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

export default function LoginPage() {
  // 1. THIS IS THE HOOK FROM YOUR FIXED FILE
  const { login, session } = useWeb3Auth();

  const [busy, setBusy] = useState<'idle' | 'vendor' | 'proposer'>('idle');
  const [err, setErr] = useState<string | null>(null);

  async function handleSignIn(role: 'vendor' | 'proposer') {
    if (busy !== 'idle') return;
    setBusy(role);
    setErr(null);
    try {
      // 2. CALL THE login() FUNCTION WITH THE CHOSEN ROLE
      // This will pop the modal AND log them in correctly.
      // Your provider file handles all the redirects.
      await login(role);

    } catch (e: any) {
      setErr(e?.message || 'Sign in failed');
      setBusy('idle');
    }
    // On success, the provider handles the redirect, so we don't need a finally.
  }

  return (
    <main className="min-h-screen grid place-items-center">
      <div className="space-y-4 text-center p-4">
        <h1 className="text-2xl font-semibold">Sign In</h1>
        {err && <div className="text-rose-700 max-w-sm">{err}</div>}
        
        {/* 3. THE TWO BUTTONS THAT SOLVE THE PROBLEM */}
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
// app/admin/login/page.tsx
'use client';
import { useState } from 'react';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

export default function AdminLogin() {
  const { login, session } = useWeb3Auth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-screen grid place-items-center">
      <button
        onClick={async () => { if (busy) return; setBusy(true); try { await login(); } finally { setBusy(false); }}}
        disabled={busy || session === 'authenticating'}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg disabled:opacity-60"
      >
        {session === 'authenticating' ? 'Signing in…' : 'Sign in'}
      </button>
    </div>
  );
}

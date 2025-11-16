// src/app/vendor/login/page.tsx
'use client';

import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { login, session, role } = useWeb3Auth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  // If user is already logged in, redirect them away
  useEffect(() => {
    if (session === 'authenticated') {
      if (next) {
        router.replace(next);
      } else {
        // Role-based default redirect
        if (role === 'admin') router.replace('/admin');
        else if (role === 'vendor') router.replace('/vendor/dashboard');
        else if (role === 'proposer') router.replace('/new');
      }
    }
  }, [session, role, next, router]);

  const handleLogin = async (role: 'vendor' | 'proposer') => {
    try {
      await login(role);
      // The login function in Web3AuthProvider will now handle the redirect
    } catch (e) {
      console.error(e);
      // Handle login error (e.g., show a toast)
    }
  };

  if (session === 'authenticated' || session === 'authenticating') {
    return <main className="max-w-md mx-auto p-6 text-center">Loading...</main>;
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-slate-600 mt-2">
          Connect your wallet to continue as a Vendor or an Entity.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <button
          onClick={() => handleLogin('vendor')}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow"
        >
          Continue as Vendor
          <span className="block text-sm font-normal opacity-90">I want to submit bids on projects</span>
        </button>

        <button
          onClick={() => handleLogin('proposer')}
          className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 px-4 rounded-xl shadow"
        >
          Continue as Entity
          <span className="block text-sm font-normal opacity-90">I want to submit a new proposal</span>
        </button>
      </div>
    </main>
  );
}
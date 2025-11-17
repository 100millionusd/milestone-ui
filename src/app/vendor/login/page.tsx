// src/app/vendor/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { apiFetch, loginVendor, loginProposer } from '@/lib/api'; // 1. Import loginVendor/loginProposer
import { ethers } from 'ethers'; // 2. Import ethers to sign

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  // 3. Get the tools from the hook, NOT the broken login() function
  const { web3auth, provider, address, getNonce, session, connect } = useWeb3Auth(); 
  const [busy, setBusy] = useState<'idle' | 'vendor' | 'proposer'>('idle');
  const [err, setErr] = useState<string | null>(null);

  // 4. THIS IS THE NEW HANDLER THAT FIXES THE PROBLEM
  async function handleSignIn(role: 'vendor' | 'proposer') {
    if (busy !== 'idle') return;
    setBusy(role);
    setErr(null);

    try {
      let currentProvider = provider;
      let currentAddress = address;

      // 5. IF NOT CONNECTED, POP THE WEB3AUTH MODAL
      if (!currentProvider || !currentAddress) {
        // Use the 'connect' function from your hook
        // If 'connect' isn't on your hook, use 'web3auth.connect()'
        const newProvider = await connect(); 
        if (!newProvider) throw new Error('Wallet connection failed.');
        
        const ethersProvider = new ethers.providers.Web3Provider(newProvider);
        currentAddress = await ethersProvider.getSigner().getAddress();
        currentProvider = newProvider;
      }

      if (!currentProvider || !currentAddress || !getNonce) {
        throw new Error('Wallet connection is not fully set up.');
      }

      // 6. GET NONCE AND SIGN IT
      const nonce = await getNonce();
      if (!nonce) throw new Error('Failed to get nonce');
      
      const ethersProvider = new ethers.providers.Web3Provider(currentProvider);
      const signer = ethersProvider.getSigner();
      const signature = await signer.signMessage(nonce);

      // 7. CALL THE CORRECT, EXPLICIT LOGIN FUNCTION
      if (role === 'vendor') {
        await loginVendor(currentAddress, signature);
      } else {
        await loginProposer(currentAddress, signature);
      }

      // 8. NOW THE USER HAS THE CORRECT TOKEN, SO WE ROUTE THEM
      const who = await apiFetch('/auth/role', { cache: 'no-store' });
      const roles = Array.isArray(who?.roles) ? who.roles : (who?.role ? [who.role] : []);
      const isAdmin = roles.includes('admin');
      const isVendor = roles.includes('vendor');
      const isProposer = roles.includes('proposer');
      const next = params.get('next');

      if (isAdmin) {
        router.replace('/admin');
        return;
      }
      if (role === 'vendor' && isVendor) {
        router.replace(next || '/vendor/dashboard');
        return;
      }
      if (role === 'proposer' && isProposer) {
        router.replace(next || '/proposer/profile');
        return;
      }

      // Fallback: New user
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
        
        {/* 9. TWO BUTTONS INSTEAD OF ONE */}
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
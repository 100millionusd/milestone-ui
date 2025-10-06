'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

export default function VendorLogin() {
  const router = useRouter();
  const sp = useSearchParams();
  const { login, role, refreshRole } = useWeb3Auth();

  // 1) On mount, sync role from server cookie (prevents stale localStorage causing redirect)
  useEffect(() => {
    void refreshRole();
  }, [refreshRole]);

  // 2) Redirect ONLY when authenticated by server (role !== 'guest')
  useEffect(() => {
    if (role !== 'guest') {
      router.replace('/vendor/dashboard');
    }
  }, [role, router]);

  const handleLogin = async () => {
    try {
      await login(); // Provider handles post-login redirects
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  const fromLogout = sp.get('loggedout') === '1';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold mb-2">Vendor Login</h1>
        <p className="text-gray-600 mb-6">
          {fromLogout ? 'You have been signed out. Connect again to continue.' :
            'Connect your wallet to continue.'}
        </p>

        <button
          onClick={handleLogin}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 w-full"
        >
          Connect Wallet
        </button>

        <p className="text-sm text-gray-500 mt-6">Powered by USDT/USDC</p>
      </div>
    </div>
  );
}

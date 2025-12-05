// src/app/vendor/login/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { useSearchParams } from 'next/navigation';
import { API_BASE } from '@/lib/api';

// Simple Li Icon Component to match the screenshot
const LithiumLogo = () => (
  <div className="h-12 w-12 bg-[#0ea5e9] rounded-lg flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-blue-500/20">
    Li
  </div>
);

// Header Logo Component
const HeaderLogo = () => (
  <div className="flex items-center gap-2">
    <div className="h-8 w-8 bg-[#0ea5e9] rounded flex items-center justify-center text-white font-bold text-lg">
      Li
    </div>
    <span className="text-white font-semibold text-xl tracking-tight">LithiumX</span>
  </div>
);

type Role = 'vendor' | 'proposer' | 'admin';

export default function LoginPage() {
  const { login, session, isResolvingTenant } = useWeb3Auth();

  // State to track which card is selected. 
  // Defaulting to 'vendor' matches the screenshot (blue border), 
  // but you can set to null if you want no default selection.
  const [selectedRole, setSelectedRole] = useState<Role>('vendor');

  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get('tenant');
  const [tenantName, setTenantName] = useState<string | null>(null);

  useEffect(() => {
    if (tenantSlug) {
      fetch(`${API_BASE}/api/tenants/lookup?slug=${tenantSlug}`)
        .then(r => r.json())
        .then(data => {
          if (data && data.name) setTenantName(data.name);
        })
        .catch(() => { });
    }
  }, [tenantSlug]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleConnectWallet() {
    if (busy || session === 'authenticating') return;

    setBusy(true);
    setErr(null);

    try {
      // Pass the currently selected role to the login function
      await login(selectedRole);
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed');
      setBusy(false);
    }
    // No finally block needed as provider handles redirect on success
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-200 flex flex-col font-sans">

      {/* Navigation Bar */}
      <nav className="w-full px-6 py-4 flex justify-between items-center border-b border-white/5 bg-[#0B1120]">
        <HeaderLogo />
        <button
          className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          disabled={true} // Visual only in navbar as per screenshot context
        >
          Connect Wallet
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">

        {/* Card Container */}
        <div className="w-full max-w-md bg-[#151e32] border border-slate-700/50 rounded-2xl p-8 shadow-2xl">

          {/* Card Header */}
          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <LithiumLogo />
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Welcome to LithiumX</h1>
              {tenantName && (
                <div className="mb-2 px-3 py-1 bg-indigo-500/20 text-indigo-200 rounded-full text-sm font-medium border border-indigo-500/30">
                  Organization: {tenantName}
                </div>
              )}
              <p className="text-slate-400">Connect your wallet to continue</p>
            </div>
          </div>

          {/* Error Message Display */}
          {err && (
            <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/50 rounded text-rose-200 text-sm text-center">
              {err}
            </div>
          )}

          {/* Role Selection */}
          <div className="space-y-3 mb-8">
            <label className="text-sm font-medium text-slate-300 ml-1">Select Role</label>

            <div className="grid grid-cols-3 gap-4">
              {/* Proposer Card */}
              <button
                onClick={() => setSelectedRole('proposer')}
                className={`
                  flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200
                  ${selectedRole === 'proposer'
                    ? 'bg-[#1e293b] border-[#0ea5e9] shadow-[0_0_0_1px_#0ea5e9]'
                    : 'bg-[#1e293b]/50 border-slate-700 hover:border-slate-600 hover:bg-[#1e293b]'}
                `}
              >
                <span className="text-white font-semibold text-lg">Proposer</span>
                <span className="text-slate-400 text-xs mt-1">Create Projects</span>
              </button>

              {/* Vendor Card */}
              <button
                onClick={() => setSelectedRole('vendor')}
                className={`
                  flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200
                  ${selectedRole === 'vendor'
                    ? 'bg-[#1e293b] border-[#0ea5e9] shadow-[0_0_0_1px_#0ea5e9]'
                    : 'bg-[#1e293b]/50 border-slate-700 hover:border-slate-600 hover:bg-[#1e293b]'}
                `}
              >
                <span className="text-white font-semibold text-lg">Vendor</span>
                <span className="text-slate-400 text-xs mt-1">Submit Bids</span>
              </button>

              {/* Admin Card */}
              <button
                onClick={() => setSelectedRole('admin')}
                className={`
                  flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200
                  ${selectedRole === 'admin'
                    ? 'bg-[#1e293b] border-[#0ea5e9] shadow-[0_0_0_1px_#0ea5e9]'
                    : 'bg-[#1e293b]/50 border-slate-700 hover:border-slate-600 hover:bg-[#1e293b]'}
                `}
              >
                <span className="text-white font-semibold text-lg">Admin</span>
                <span className="text-slate-400 text-xs mt-1">Manage Org</span>
              </button>
            </div>
          </div>

          {/* Connect Button */}
          <button
            onClick={handleConnectWallet}
            disabled={busy || session === 'authenticating' || isResolvingTenant}
            className={`
              w-full py-3.5 rounded-lg text-white font-semibold text-lg transition-all duration-200
              ${busy || session === 'authenticating' || isResolvingTenant
                ? 'bg-slate-700 cursor-not-allowed text-slate-400'
                : 'bg-[#0ea5e9] hover:bg-[#0284c7] shadow-lg shadow-blue-900/20 active:scale-[0.98]'}
            `}
          >
            {isResolvingTenant ? 'Loading Organization...' : (busy || session === 'authenticating' ? 'Connecting...' : 'Connect Wallet')}
          </button>

        </div>
      </main>
    </div>
  );
}
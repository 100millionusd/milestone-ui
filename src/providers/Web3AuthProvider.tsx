// src/providers/Web3AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
import { ethers } from 'ethers';
import { useRouter, usePathname } from 'next/navigation';
import { postJSON, loginWithSignature, getAuthRoleOnce, getVendorProfile } from '@/lib/api';

type Role = 'admin' | 'vendor' | 'guest';
const normalizeRole = (v: any): Role => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'admin' || s === 'vendor' ? (s as Role) : 'guest';
};

interface Web3AuthContextType {
  web3auth: Web3Auth | null;
  provider: SafeEventEmitterProvider | null;
  address: string | null;
  role: Role;
  isConnecting: boolean;
  // Back-compat alias so old pages calling `login()` don’t crash:
  login: () => Promise<void>;
  loginMetamask: () => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  address: null,
  role: 'guest',
  isConnecting: false,
  login: async () => {},
  loginMetamask: async () => {},
  loginGoogle: async () => {},
  logout: async () => {},
  refreshRole: async () => {},
});

// ---------- ENV ----------
const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;
const WEB3AUTH_NETWORK = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || 'sapphire_devnet';

// Only mount Web3Auth UI on routes that actually need it
const pageNeedsWallet = (p?: string) =>
  !!p && (p.startsWith('/vendor') || p.startsWith('/admin/payments') || p.startsWith('/wallet'));

// ---------- RPC ----------
async function probeRpc(url: string, timeoutMs = 2500): Promise<boolean> {
  if (!url) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return false;
    const j = await r.json().catch(() => ({} as any));
    const hex = (j?.result || '').toString();
    return /^0x[0-9a-f]+$/i.test(hex) && parseInt(hex, 16) === 11155111; // 0xaa36a7
  } catch {
    return false;
  }
}
async function pickHealthyRpc(): Promise<string> {
  const candidates = ['https://rpc.sepolia.org', 'https://1rpc.io/sepolia'];
  for (const url of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await probeRpc(url)) return url;
  }
  return 'https://rpc.sepolia.org';
}

// ---------- PROVIDER ----------
export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const needsWallet = useMemo(() => pageNeedsWallet(pathname || ''), [pathname]);

  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('guest');
  const [isConnecting, setIsConnecting] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Quick restore
  useEffect(() => {
    try {
      setRole(normalizeRole(localStorage.getItem('lx_role')));
      setAddress(localStorage.getItem('lx_addr'));
    } finally {
      setMounted(true);
    }
  }, []);

  // Init Web3Auth v9 (MetaMask + Google)
  useEffect(() => {
    if (!needsWallet) return;
    const init = async () => {
      try {
        if (!clientId) {
          console.error('Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }

        const rpcTarget = await pickHealthyRpc();
        const chainConfig = {
          chainNamespace: CHAIN_NAMESPACES.EIP155,
          chainId: '0xaa36a7', // Sepolia
          rpcTarget,
          displayName: 'Sepolia Testnet',
          blockExplorerUrl: 'https://sepolia.etherscan.io',
          ticker: 'ETH',
          tickerName: 'Ethereum Sepolia',
        };

        // Web3Auth core (v9) — chainConfig MUST be here
        const w3a = new Web3Auth({
          clientId,
          web3AuthNetwork: WEB3AUTH_NETWORK, // keep devnet unless your clientId is allowlisted on mainnet
          chainConfig,
          uiConfig: { appName: 'LithiumX' },
        });

        // Private key provider for EVM
        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        // Google via OpenLogin
        const openlogin = new OpenloginAdapter({
          privateKeyProvider,
          adapterSettings: {
            uxMode: 'popup', // popup avoids awkward redirects
            whiteLabel: { name: 'LithiumX' },
          },
        });
        w3a.configureAdapter(openlogin);

        // MetaMask
        w3a.configureAdapter(new MetamaskAdapter());

        await w3a.initModal({
          modalConfig: {
            [WALLET_ADAPTERS.OPENLOGIN]: { label: 'Google', showOnModal: true },
            [WALLET_ADAPTERS.METAMASK]: { label: 'MetaMask', showOnModal: true },
          },
        });

        setWeb3auth(w3a);
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();
  }, [needsWallet]);

  // Role fetch (cookie or Bearer via api.ts)
  const refreshRole = async () => {
    try {
      const info = await getAuthRoleOnce();
      const r = normalizeRole(info?.role);
      setRole(r);
      localStorage.setItem('lx_role', r);
      if ((info as any)?.address) {
        const addr = String((info as any).address);
        setAddress(addr);
        localStorage.setItem('lx_addr', addr);
      }
    } catch (e) {
      console.warn('refreshRole failed:', e);
    }
  };

  useEffect(() => {
    if (mounted) void refreshRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Complete app login AFTER user approves in the wallet / Google popup
  const completeAppLogin = async (web3authProvider: SafeEventEmitterProvider) => {
    setProvider(web3authProvider);

    const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
    const signer = await ethersProvider.getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
    localStorage.setItem('lx_addr', addr);

    // 1) nonce
    const { nonce } = await postJSON('/auth/nonce', { address: addr });
    // 2) sign
    const signature = await signer.signMessage(nonce);
    // 3) exchange for token (api.ts stores lx_jwt → Bearer fallback)
    const { role: srvRole } = await loginWithSignature(addr, signature);

    setRole(srvRole || 'vendor');
    localStorage.setItem('lx_role', srvRole || 'vendor');

    // 4) profile check → redirect
    try {
      const p = await getVendorProfile().catch(() => null);
      const url = new URL(window.location.href);
      const nextParam = url.searchParams.get('next');
      const fallback = pathname || '/';
      if (!p || !(p?.vendorName || p?.companyName) || !p?.email) {
        window.location.replace(`/vendor/profile?next=${encodeURIComponent(nextParam || fallback)}`);
      } else {
        window.location.replace(nextParam || '/');
      }
    } catch {
      window.location.replace('/');
    }
  };

  const connectSafe = async (fn: () => Promise<SafeEventEmitterProvider | null>) => {
    setIsConnecting(true);
    try {
      // Fixes “Already connected”
      if (web3auth?.provider) {
        try { await web3auth.logout(); } catch {}
      }
      const p = await fn();
      if (!p) throw new Error('No provider returned');
      await completeAppLogin(p);
    } finally {
      setIsConnecting(false);
    }
  };

  const loginMetamask = async () => {
    if (!web3auth) return;
    try {
      await connectSafe(() => web3auth.connectTo(WALLET_ADAPTERS.METAMASK));
    } catch (e) {
      console.error('MetaMask login error:', e);
    }
  };

  const loginGoogle = async () => {
    if (!web3auth) return;
    try {
      await connectSafe(() =>
        web3auth.connectTo(WALLET_ADAPTERS.OPENLOGIN, {
          loginProvider: 'google',
        } as any)
      );
    } catch (e) {
      console.error('Google login error:', e);
    }
  };

  const logout = async () => {
    try { await web3auth?.logout(); } catch {}
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    setProvider(null);
    setAddress(null);
    setRole('guest');
    localStorage.removeItem('lx_addr');
    localStorage.removeItem('lx_jwt');
    localStorage.removeItem('lx_role');
    try { router.replace('/'); } catch {}
  };

  // Reset on account/network change (only where wallets are used)
  useEffect(() => {
    if (!needsWallet) return;
    const eth = (typeof window !== 'undefined' && (window as any).ethereum) || null;
    if (!eth?.on) return;

    const onAccountsChanged = async () => {
      try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
      setProvider(null);
      setAddress(null);
      setRole('guest');
      localStorage.removeItem('lx_addr');
      localStorage.removeItem('lx_jwt');
      localStorage.removeItem('lx_role');
      window.location.href = '/vendor/login';
    };

    const onChainChanged = () => window.location.reload();

    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);
    return () => {
      try {
        eth.removeListener?.('accountsChanged', onAccountsChanged);
        eth.removeListener?.('chainChanged', onChainChanged);
      } catch {}
    };
  }, [needsWallet]);

  if (!mounted) return null;

  return (
    <Web3AuthContext.Provider
      value={{
        web3auth,
        provider,
        address,
        role,
        isConnecting,
        // Back-compat: your old page calls `login()` → we map to Google
        login: loginGoogle,
        loginMetamask,
        loginGoogle,
        logout,
        refreshRole,
      }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

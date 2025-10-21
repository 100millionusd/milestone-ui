// src/providers/Web3AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, WALLET_ADAPTERS, SafeEventEmitterProvider } from '@web3auth/base';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
import { ethers } from 'ethers';
import { usePathname } from 'next/navigation';
import { postJSON, loginWithSignature, getAuthRoleOnce, getVendorProfile } from '@/lib/api';

type Role = 'admin' | 'vendor' | 'guest';
const normalizeRole = (v: any): Role => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'admin' || s === 'vendor' ? (s as Role) : 'guest';
};

interface Ctx {
  web3auth: Web3Auth | null;
  provider: SafeEventEmitterProvider | null;
  address: string | null;
  role: Role;
  token: string | null;
  login: () => Promise<void>;              // generic (MetaMask by default)
  loginWithMetamask: () => Promise<void>;  // explicit
  loginWithGoogle: () => Promise<void>;    // explicit
  logout: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const Web3Ctx = createContext<Ctx>({
  web3auth: null,
  provider: null,
  address: null,
  role: 'guest',
  token: null,
  login: async () => {},
  loginWithMetamask: async () => {},
  loginWithGoogle: async () => {},
  logout: async () => {},
  refreshRole: async () => {},
});

// ---------- ENV ----------
const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;
const WEB3AUTH_NETWORK = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || 'sapphire_devnet';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const api = (p: string) => (API_BASE ? `${API_BASE}${p}` : `/api${p}`);

// ---------- Helpers ----------
const pageNeedsWallet = (p?: string) =>
  !!p && (p.startsWith('/vendor') || p.startsWith('/admin/payments') || p.startsWith('/wallet'));

async function pickRpc() {
  const urls = [
    process.env.NEXT_PUBLIC_SEPOLIA_RPC || '',
    'https://rpc.sepolia.org',
    'https://1rpc.io/sepolia',
  ].filter(Boolean);
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const j = await r.json().catch(() => ({} as any));
      if (parseInt(String(j?.result || '0x0'), 16) === 11155111) return url;
    } catch {}
  }
  return 'https://rpc.sepolia.org';
}

const setCookie = (k: string, v: string) =>
  (document.cookie = `${k}=${v}; Path=/; Secure; SameSite=None`);
const clearCookie = (k: string) =>
  (document.cookie = `${k}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=None`);

// ---------- Provider ----------
export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const needsWallet = useMemo(() => pageNeedsWallet(pathname || ''), [pathname]);

  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('guest'); // start clean, no preload
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Clean slate on the dedicated login page to prevent “already logged in before approval”
  useEffect(() => {
    setMounted(true);
    if (pathname === '/vendor/login') {
      (async () => {
        try { await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' }); } catch {}
        try {
          localStorage.removeItem('lx_jwt');
          localStorage.removeItem('lx_role');
          localStorage.removeItem('lx_addr');
        } catch {}
        clearCookie('auth_token');
        clearCookie('lx_jwt');
        setRole('guest');
        setToken(null);
        setAddress(null);
      })();
    }
  }, [pathname]); // eslint-disable-line

  // Init Web3Auth (Modal) — pass chainConfig **here** (not to a private key provider)
  useEffect(() => {
    if (!needsWallet) return;
    (async () => {
      try {
        if (!clientId) {
          console.error('Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }
        const rpcTarget = await pickRpc();

        const chainConfig = {
          chainNamespace: CHAIN_NAMESPACES.EIP155, // or just 'eip155'
          chainId: '0xaa36a7', // 11155111 (Sepolia)
          rpcTarget,
          displayName: 'Sepolia Testnet',
          blockExplorerUrl: 'https://sepolia.etherscan.io',
          ticker: 'ETH',
          tickerName: 'Ethereum Sepolia',
        };

        const w3a = new Web3Auth({
          clientId,
          web3AuthNetwork: WEB3AUTH_NETWORK,
          chainConfig, // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< THIS FIXES your init error
        });

        // Adapters
        w3a.configureAdapter(new MetamaskAdapter());
        const openlogin = new OpenloginAdapter({
          adapterSettings: { network: WEB3AUTH_NETWORK, uxMode: 'popup' },
        });
        w3a.configureAdapter(openlogin);

        await w3a.initModal({
          modalConfig: {
            [WALLET_ADAPTERS.METAMASK]: { showOnModal: true },
            [WALLET_ADAPTERS.OPENLOGIN]: { showOnModal: true, label: 'Continue with Google' },
            [WALLET_ADAPTERS.WALLET_CONNECT_V2]: { showOnModal: false }, // keep hidden = no WC deps
          },
        });

        setWeb3auth(w3a);
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    })();
  }, [needsWallet]);

  const refreshRole = async () => {
    try {
      const info = await getAuthRoleOnce();
      const r = normalizeRole(info?.role);
      setRole(r);
      if ((info as any)?.address) {
        const addr = String((info as any).address);
        setAddress(addr);
        try { localStorage.setItem('lx_addr', addr); } catch {}
      }
    } catch (e) {
      console.warn('refreshRole failed:', e);
    }
  };

  const finishLogin = async (prov: SafeEventEmitterProvider) => {
    const ethersProvider = new ethers.BrowserProvider(prov as any);
    const signer = await ethersProvider.getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
    try { localStorage.setItem('lx_addr', addr); } catch {}

    const { nonce } = await postJSON('/auth/nonce', { address: addr });
    const signature = await signer.signMessage(nonce);
    await loginWithSignature(addr, signature); // stores lx_jwt in localStorage

    // Mirror to cookie so SSR/admin can read it immediately
    const jwt = (() => { try { return localStorage.getItem('lx_jwt'); } catch { return null; } })();
    if (jwt) {
      setCookie('auth_token', jwt);
      setCookie('lx_jwt', jwt);
      setToken(jwt);
    }

    await refreshRole();

    // Vendor profile redirect (also works for admin if you ignore vendor profile)
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

  // Explicit login flows (no auto-connect)
  const loginWithMetamask = async () => {
    if (!web3auth) return;
    try {
      const prov = await web3auth.connectTo(WALLET_ADAPTERS.METAMASK);
      if (!prov) throw new Error('MetaMask provider unavailable');
      setProvider(prov);
      await finishLogin(prov);
    } catch (e) {
      console.error('MetaMask login error:', e);
    }
  };

  const loginWithGoogle = async () => {
    if (!web3auth) return;
    try {
      const prov = await web3auth.connectTo(WALLET_ADAPTERS.OPENLOGIN, { loginProvider: 'google' } as any);
      if (!prov) throw new Error('OpenLogin provider unavailable');
      setProvider(prov);
      await finishLogin(prov);
    } catch (e) {
      console.error('Google login error:', e);
    }
  };

  // Back-compat generic login (defaults to MetaMask)
  const login = async () => {
    await loginWithMetamask();
  };

  const logout = async () => {
    try { await web3auth?.logout(); } catch {}
    try { await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' }); } catch {}
    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');
    try {
      localStorage.removeItem('lx_addr');
      localStorage.removeItem('lx_jwt');
      localStorage.removeItem('lx_role');
    } catch {}
    clearCookie('auth_token');
    clearCookie('lx_jwt');
    window.location.replace('/');
  };

  // Reset on account/network change (only where wallet is used)
  useEffect(() => {
    if (!needsWallet) return;
    const eth = (typeof window !== 'undefined' ? (window as any).ethereum : null);
    if (!eth?.on) return;

    const onAccountsChanged = async () => { try { await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' }); } catch {}; await logout(); };
    const onChainChanged = () => window.location.reload();

    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);
    return () => {
      try {
        eth.removeListener?.('accountsChanged', onAccountsChanged);
        eth.removeListener?.('chainChanged', onChainChanged);
      } catch {}
    };
  }, [needsWallet]); // eslint-disable-line

  if (!mounted) return null;

  return (
    <Web3Ctx.Provider
      value={{
        web3auth,
        provider,
        address,
        role,
        token,
        login,
        loginWithMetamask,
        loginWithGoogle,
        logout,
        refreshRole,
      }}
    >
      {children}
    </Web3Ctx.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3Ctx);

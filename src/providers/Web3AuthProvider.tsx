// src/providers/Web3AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
import { ethers } from 'ethers';
import { useRouter, usePathname } from 'next/navigation';

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
  token: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  address: null,
  role: 'guest',
  token: null,
  login: async () => {},
  logout: async () => {},
  refreshRole: async () => {},
});

// ---- Env ----
const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;

// If you have an ANKR API key, we’ll build the Sepolia URL with it.
// Or you can supply a full RPC url in NEXT_PUBLIC_SEPOLIA_RPC.
const ankrKey = process.env.NEXT_PUBLIC_ANKR_API_KEY || '';
const envRpc =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ||
  (ankrKey ? `https://rpc.ankr.com/eth_sepolia/${ankrKey}` : '');

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

const BASE_CHAIN = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0xaa36a7', // 11155111 (Sepolia)
  displayName: 'Sepolia Testnet',
  blockExplorerUrl: 'https://sepolia.etherscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum Sepolia',
} as const;

// Use relative endpoints if NEXT rewrites proxy your backend (best for Safari).
// If NEXT_PUBLIC_API_BASE_URL is set, we’ll call that absolute origin instead.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const api = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

// ---- RPC health probe (prevents “failed to detect network”) ----
async function probeRpc(url: string, timeoutMs = 3500): Promise<boolean> {
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
    return /^0x[0-9a-f]+$/i.test(hex) && parseInt(hex, 16) === 11155111;
  } catch {
    return false;
  }
}

async function pickHealthyRpc(): Promise<string> {
  const candidates = [
    envRpc,                             // ← your env (ANKR with key if provided)
    'https://rpc.sepolia.org',
    'https://1rpc.io/sepolia',
    'https://rpc.ankr.com/eth_sepolia', // public fallback (no key)
  ].filter(Boolean);
  for (const url of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await probeRpc(url)) return url;
  }
  return 'https://rpc.sepolia.org';
}

export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('guest');
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Restore session (address/role/token from storage; server role still comes from cookie)
  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
      setRole(normalizeRole(localStorage.getItem('lx_role')));
      setAddress(localStorage.getItem('lx_addr'));
    } finally {
      setMounted(true);
    }
  }, []);

  // Init Web3Auth (NO OpenLogin adapter)
  useEffect(() => {
    const init = async () => {
      try {
        if (!clientId) {
          console.error('Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }

        const rpcTarget = await pickHealthyRpc();
        const chainConfig = { ...BASE_CHAIN, rpcTarget };
        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        const w3a = new Web3Auth({
          clientId,
          web3AuthNetwork: 'sapphire_mainnet', // production network
          privateKeyProvider,
          uiConfig: {},
        });

        // Only EOA wallets (no OpenLogin)
        w3a.configureAdapter(new MetamaskAdapter());

        if (wcProjectId) {
          w3a.configureAdapter(
            new WalletConnectV2Adapter({
              adapterSettings: {
                projectId: wcProjectId,
                qrcodeModalOptions: { themeMode: 'dark' },
              },
            })
          );
        }

        // Hide OpenLogin from modal to avoid “openlogin is not a valid adapter”
        await w3a.initModal({
          modalConfig: {
            [WALLET_ADAPTERS.OPENLOGIN]: { showOnModal: false },
          },
        });

        setWeb3auth(w3a);
        // Do NOT call getSigner() here; only after user connects in login()
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();
  }, []);

  // Read role from the server (cookie-based)
  const refreshRole = async () => {
    try {
      const res = await fetch(api('/auth/role'), {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      const norm = normalizeRole(data?.role);
      setRole(norm);
      localStorage.setItem('lx_role', norm);
      if (data?.address && typeof data.address === 'string') {
        localStorage.setItem('lx_addr', data.address);
        setAddress(data.address);
      }
    } catch (e) {
      console.warn('refreshRole failed:', e);
    }
  };

  const isProfileIncomplete = (p: any) => {
    const hasName = !!(p?.vendorName || p?.companyName);
    const hasEmail = !!p?.email;
    return !(hasName && hasEmail);
  };

  const postLoginProfileRedirect = async () => {
    try {
      const r = await fetch(api('/vendor/profile'), { credentials: 'include' });
      const p = r.ok ? await r.json() : null;

      const url = new URL(window.location.href);
      const nextParam = url.searchParams.get('next');
      const fallback = pathname || '/';

      if (!p || isProfileIncomplete(p)) {
        const dest = `/vendor/profile?next=${encodeURIComponent(nextParam || fallback)}`;
        router.replace(dest);
      } else {
        router.replace(nextParam || '/');
      }
    } catch {
      router.replace('/');
    }
  };

  // Sync role from cookie on mount
  useEffect(() => {
    if (mounted) {
      refreshRole();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const login = async () => {
    if (!web3auth) return;
    try {
      // Connect to a wallet (MetaMask / WalletConnect)
      const web3authProvider = await web3auth.connect();
      if (!web3authProvider) throw new Error('No provider from Web3Auth');

      setProvider(web3authProvider);

      // Resolve address AFTER connect (avoid “eth_requestAccounts method not found”)
      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      // Ask server for nonce
      const nonceRes = await fetch(api('/auth/nonce'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: addr }),
      });
      if (!nonceRes.ok) throw new Error('Failed to get nonce');
      const { nonce } = await nonceRes.json();

      // Sign nonce
      const signature = await (new ethers.BrowserProvider(web3authProvider as any))
        .getSigner()
        .then(s => s.signMessage(nonce));

      // Verify (sets httpOnly auth cookie)
      const verifyRes = await fetch(api('/auth/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: addr, signature }),
      });
      if (!verifyRes.ok) throw new Error('Auth verify failed');

      const { role: srvRole } = await verifyRes.json();
      const normRole = normalizeRole(srvRole);

      setToken(null);
      localStorage.removeItem('lx_jwt');

      setRole(normRole);
      localStorage.setItem('lx_role', normRole);

      await refreshRole();
      await postLoginProfileRedirect();
    } catch (e) {
      console.error('Login error:', e);
    }
  };

  const logout = async () => {
    try {
      await web3auth?.logout();
    } catch {}
    try {
      await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' });
    } catch {}

    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');
    localStorage.removeItem('lx_addr');
    localStorage.removeItem('lx_jwt');
    localStorage.removeItem('lx_role');

    try { router.replace('/'); } catch {}
  };

  // Re-auth on account/network change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const eth = (window as any).ethereum;
    if (!eth?.on) return;

    const onAccountsChanged = async (_accounts: string[]) => {
      try {
        await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' }).catch(() => {});
      } finally {
        setProvider(null);
        setAddress(null);
        setToken(null);
        setRole('guest');
        localStorage.removeItem('lx_addr');
        localStorage.removeItem('lx_jwt');
        localStorage.removeItem('lx_role');
        window.location.href = '/vendor/login';
      }
    };

    const onChainChanged = () => {
      window.location.reload();
    };

    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);

    return () => {
      try {
        eth.removeListener?.('accountsChanged', onAccountsChanged);
        eth.removeListener?.('chainChanged', onChainChanged);
      } catch {}
    };
  }, []);

  if (!mounted) return null;

  return (
    <Web3AuthContext.Provider value={{ web3auth, provider, address, role, token, login, logout, refreshRole }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

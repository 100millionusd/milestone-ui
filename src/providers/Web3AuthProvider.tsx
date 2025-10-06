// src/providers/Web3AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
import { ethers } from 'ethers';
import { useRouter, usePathname } from 'next/navigation';
import { postJSON, loginWithSignature, getAuthRole, getVendorProfile, logout as apiLogout } from '@/lib/api';


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

// ---------- ENV ----------
const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;

// Web3Auth network: keep devnet by default to avoid 400s (switch with env when allowlisted)
const WEB3AUTH_NETWORK = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || 'sapphire_devnet';

// ANKR: either give a full RPC in NEXT_PUBLIC_SEPOLIA_RPC,
// or set NEXT_PUBLIC_ANKR_API_KEY and we’ll build the URL for you.
const ankrKey = process.env.NEXT_PUBLIC_ANKR_API_KEY || '';
const envRpc =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ||
  (ankrKey ? `https://rpc.ankr.com/eth_sepolia/${ankrKey}` : ''); // only if key present

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

// Backend API base (leave empty to use same-origin + Next.js rewrites)
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
// IMPORTANT: when API_BASE is empty, we prefix with /api so Next rewrites can proxy.
// This fixes the Safari cookie issue and also your 404s like /auth/role.
const api = (path: string) => (API_BASE ? `${API_BASE}${path}` : `/api${path}`);

// --- Hard logout helpers (clear Web3Auth + WalletConnect caches) ---
function clearWeb3AuthCaches() {
  if (typeof localStorage === 'undefined') return;

  // 1) Stop Web3Auth from remembering the last adapter (prevents auto-reconnect)
  try { localStorage.removeItem('web3auth_cached_adapter'); } catch {}

  // 2) WalletConnect v2 caches
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith('wc@2') || k.startsWith('walletconnect')) {
        localStorage.removeItem(k);
      }
    }
  } catch {}

  // 3) Common deeplink flag
  try { localStorage.removeItem('WALLETCONNECT_DEEPLINK_CHOICE'); } catch {}
}

async function disconnectAdaptersSafely(web3auth: Web3Auth | null) {
  if (!web3auth) return;

  // Try adapter-specific disconnects (best-effort)
  try {
    const wc = web3auth.getAdapter?.(WALLET_ADAPTERS.WALLET_CONNECT_V2) as any;
    if (wc?.disconnectSession) {
      await wc.disconnectSession().catch(() => {});
    }
  } catch {}

  // Web3Auth generic logout (clears internal session)
  try { await web3auth.logout(); } catch {}
}

// ---------- RPC HEALTH ----------
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
    return /^0x[0-9a-f]+$/i.test(hex) && parseInt(hex, 16) === 11155111;
  } catch {
    return false;
  }
}

const isBareAnkr = (u: string) => /rpc\.ankr\.com\/eth_sepolia\/?$/.test(u);

async function pickHealthyRpc(): Promise<string> {
  const candidates = [
    envRpc && !isBareAnkr(envRpc) ? envRpc : '', // only use ANKR if key is present
    'https://rpc.sepolia.org',
    'https://1rpc.io/sepolia',
    // do NOT include bare ankr fallback; it passes chainId but fails later with Unauthorized
  ].filter(Boolean);
  for (const url of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await probeRpc(url)) return url;
  }
  // worst-case
  return 'https://rpc.sepolia.org';
}

// ---------- PROVIDER ----------
export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('guest');
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Restore quick state from localStorage
  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
      setRole(normalizeRole(localStorage.getItem('lx_role')));
      setAddress(localStorage.getItem('lx_addr'));
    } finally {
      setMounted(true);
    }
  }, []);

  // ---------- LAZY INIT FOR WEB3AUTH ----------
  const initOnceRef = useRef<Promise<Web3Auth | null> | null>(null);

  async function ensureWeb3Auth(): Promise<Web3Auth> {
    if (web3auth) return web3auth;
    if (initOnceRef.current) {
      const existing = await initOnceRef.current;
      if (!existing) throw new Error('Web3Auth failed to initialize');
      return existing;
    }

    initOnceRef.current = (async () => {
      if (!clientId) {
        console.error('Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
        return null;
      }

      const rpcTarget = await pickHealthyRpc();
      const chainConfig = {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: '0xaa36a7', // 11155111
        rpcTarget,
        displayName: 'Sepolia Testnet',
        blockExplorerUrl: 'https://sepolia.etherscan.io',
        ticker: 'ETH',
        tickerName: 'Ethereum Sepolia',
      };

      const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

      const w3a = new Web3Auth({
        clientId,
        web3AuthNetwork: WEB3AUTH_NETWORK, // 'sapphire_devnet' by default
        privateKeyProvider,
        uiConfig: {},
      });

      // Wallet adapters (EOA only)
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

      // Hide OpenLogin entry to avoid “openlogin is not a valid adapter”
      await w3a.initModal({
        modalConfig: {
          [WALLET_ADAPTERS.OPENLOGIN]: { showOnModal: false },
        },
      });

      setWeb3auth(w3a);
      return w3a;
    })();

    const w3a = await initOnceRef.current;
    if (!w3a) throw new Error('Web3Auth failed to initialize');
    return w3a;
  }

  // Cookie-based role from server
  const refreshRole = async () => {
    try {
      const info = await getAuthRole(); // { role, address? }
      setRole(info.role);
      localStorage.setItem('lx_role', info.role);
      if (info.address) {
        setAddress(info.address);
        localStorage.setItem('lx_addr', info.address);
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
      const p = await getVendorProfile().catch(() => null);

      const url = new URL(window.location.href);
      const nextParam = url.searchParams.get('next');
      const fallback = pathname || '/';

      if (!p || isProfileIncomplete(p)) {
        router.replace(`/vendor/profile?next=${encodeURIComponent(nextParam || fallback)}`);
      } else {
        router.replace(nextParam || '/');
      }
    } catch {
      router.replace('/');
    }
  };

  useEffect(() => {
    if (mounted) void refreshRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const login = async () => {
    const w3a = await ensureWeb3Auth(); // <-- LAZY INIT
    try {
      // 0) Connect wallet
      clearWeb3AuthCaches();
      const web3authProvider = await w3a.connect();
      if (!web3authProvider) throw new Error('No provider from Web3Auth');
      setProvider(web3authProvider);

      // 1) Address
      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      // 2) Nonce
      const { nonce } = await postJSON('/auth/nonce', { address: addr });

      // 3) Sign
      const signature = await signer.signMessage(nonce);

      // 4) Exchange for token (stores lx_jwt in localStorage inside api.ts)
      const { role: srvRole } = await loginWithSignature(addr, signature);

      // 5) Update role locally
      setRole(srvRole || 'vendor');
      localStorage.setItem('lx_role', srvRole || 'vendor');

      // 6) Optional: confirm role from server (works via cookie or Bearer)
      const info = await getAuthRole();
      setRole(info.role);
      if (info.address) {
        setAddress(info.address);
        localStorage.setItem('lx_addr', info.address);
      }

      // 7) Profile redirect using helper (includes Bearer for Safari)
      try {
        const p = await getVendorProfile();
        const url = new URL(window.location.href);
        const nextParam = url.searchParams.get('next');
        const fallback = pathname || '/';
        if (!p || !(p?.vendorName || p?.companyName) || !p?.email) {
          const dest = `/vendor/profile?next=${encodeURIComponent(nextParam || fallback)}`;
          router.replace(dest);
        } else {
          router.replace(nextParam || '/');
        }
      } catch {
        router.replace('/');
      }
    } catch (e) {
      console.error('Login error:', e);
    }
  };

  const logout = async () => {
  // 1) Disconnect wallet/adapters + Web3Auth internal session
  await disconnectAdaptersSafely(web3auth);

  // 2) Tell your backend to clear the auth cookie **and** clear role cache
  try { await apiLogout(); } catch {}

  // 3) Clear app-local auth state
  try { localStorage.removeItem('lx_addr'); } catch {}
  try { localStorage.removeItem('lx_jwt'); } catch {}
  try { localStorage.removeItem('lx_role'); } catch {}

  // 4) Nuke Web3Auth / WalletConnect caches so there’s no auto-reconnect
  clearWeb3AuthCaches();

  // 5) Reset provider state in React
  setProvider(null);
  setAddress(null);
  setToken(null);
  setRole('guest');

  // 6) Hard redirect so any in-memory providers are gone
  try { window.location.assign('/vendor/login?loggedout=1'); } catch {}
};

  // Reset on account/network change
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
    try { localStorage.removeItem('lx_addr'); } catch {}
    try { localStorage.removeItem('lx_jwt'); } catch {}
    try { localStorage.removeItem('lx_role'); } catch {}
    clearWeb3AuthCaches();
    window.location.href = '/vendor/login';
  }
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
  }, []);

  if (!mounted) return null;

  return (
    <Web3AuthContext.Provider
      value={{ web3auth, provider, address, role, token, login, logout, refreshRole }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

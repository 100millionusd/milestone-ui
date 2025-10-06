'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
import { ethers } from 'ethers';
import { useRouter, usePathname } from 'next/navigation';
import {
  postJSON,
  loginWithSignature,
  getAuthRole,
  getVendorProfile,
  logout as apiLogout, // <-- use backend logout from src/lib/api.ts
} from '@/lib/api';

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
const WEB3AUTH_NETWORK = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || 'sapphire_devnet';

const ankrKey = process.env.NEXT_PUBLIC_ANKR_API_KEY || '';
const envRpc =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ||
  (ankrKey ? `https://rpc.ankr.com/eth_sepolia/${ankrKey}` : '');

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const api = (path: string) => (API_BASE ? `${API_BASE}${path}` : `/api${path}`);

// ---------- HARD LOGOUT HELPERS ----------
function clearWeb3AuthCaches() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem('web3auth_cached_adapter'); } catch {}
  try { localStorage.removeItem('WALLETCONNECT_DEEPLINK_CHOICE'); } catch {}
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('wc@2') || k.startsWith('walletconnect') || k.startsWith('openlogin')) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith('wc@2') || k.startsWith('walletconnect')) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {}
}

async function disconnectAdaptersSafely(w3a: Web3Auth | null) {
  if (!w3a) return;
  try {
    const wc = w3a.getAdapter?.(WALLET_ADAPTERS.WALLET_CONNECT_V2) as any;
    if (wc?.disconnectSession) {
      await wc.disconnectSession().catch(() => {});
    }
  } catch {}
  try { await w3a.logout(); } catch {}
}

// ---------- RPC HEALTH ----------
async function probeRpc(url: string, timeoutMs = 2500): Promise<boolean> {
  if (!url) return false;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
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
    envRpc && !isBareAnkr(envRpc) ? envRpc : '',
    'https://rpc.sepolia.org',
    'https://1rpc.io/sepolia',
  ].filter(Boolean);
  for (const u of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await probeRpc(u)) return u;
  }
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

  // Quick restore
  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
      setRole(normalizeRole(localStorage.getItem('lx_role')));
      setAddress(localStorage.getItem('lx_addr'));
    } finally {
      setMounted(true);
    }
  }, []);

  // ---------- LAZY INIT ----------
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
        chainId: '0xaa36a7', // 11155111 (Sepolia)
        rpcTarget,
        displayName: 'Sepolia Testnet',
        blockExplorerUrl: 'https://sepolia.etherscan.io',
        ticker: 'ETH',
        tickerName: 'Ethereum Sepolia',
      };
      const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });
      const w3a = new Web3Auth({
        clientId,
        web3AuthNetwork: WEB3AUTH_NETWORK,
        privateKeyProvider,
        uiConfig: {},
      });

      w3a.configureAdapter(new MetamaskAdapter());
      if (wcProjectId) {
        w3a.configureAdapter(
          new WalletConnectV2Adapter({
            adapterSettings: { projectId: wcProjectId, qrcodeModalOptions: { themeMode: 'dark' } },
          })
        );
      }

      // Prevent OpenLogin from showing / caching
      await w3a.initModal({
        modalConfig: { [WALLET_ADAPTERS.OPENLOGIN]: { showOnModal: false } },
      });

      setWeb3auth(w3a);
      return w3a;
    })();
    const w3a = await initOnceRef.current;
    if (!w3a) throw new Error('Web3Auth failed to initialize');
    return w3a;
  }

  // Server-authoritative role
  const refreshRole = useCallback(async () => {
    try {
      const info = await getAuthRole(); // cookie/bearer based
      setRole(info.role);
      localStorage.setItem('lx_role', info.role);
      if (info.address) {
        setAddress(info.address);
        localStorage.setItem('lx_addr', info.address);
      }
    } catch (e) {
      setRole('guest');
      localStorage.setItem('lx_role', 'guest');
    }
  }, []);

  useEffect(() => {
    if (mounted) void refreshRole();
  }, [mounted, refreshRole]);

  const isProfileIncomplete = (p: any) => !(!!(p?.vendorName || p?.companyName) && !!p?.email);

  const login = useCallback(async () => {
    const w3a = await ensureWeb3Auth();
    try {
      // ensure no cached auto-connect
      clearWeb3AuthCaches();

      const web3authProvider = await w3a.connect();
      if (!web3authProvider) throw new Error('No provider from Web3Auth');
      setProvider(web3authProvider);

      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      const { nonce } = await postJSON('/auth/nonce', { address: addr });
      const signature = await signer.signMessage(nonce);

      const { role: srvRole } = await loginWithSignature(addr, signature);
      setRole(srvRole || 'vendor');
      localStorage.setItem('lx_role', srvRole || 'vendor');

      const info = await getAuthRole();
      setRole(info.role);
      if (info.address) {
        setAddress(info.address);
        localStorage.setItem('lx_addr', info.address);
      }

      try {
        const p = await getVendorProfile();
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
    } catch (e) {
      console.error('Login error:', e);
    }
  }, [pathname, router]);

  const logout = useCallback(async () => {
    // 1) Disconnect wallet/adapters & Web3Auth session
    await disconnectAdaptersSafely(web3auth);

    // 2) Backend cookie clear (use your api.ts logout that handles fallbacks)
    try { await apiLogout(); } catch {}

    // 3) App-local auth
    try { localStorage.removeItem('lx_addr'); } catch {}
    try { localStorage.removeItem('lx_jwt'); } catch {}
    try { localStorage.removeItem('lx_role'); } catch {}

    // 4) Nuke caches that cause auto-reconnect
    clearWeb3AuthCaches();

    // 5) Reset state
    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');

    // 6) Hard navigation (kill in-memory providers)
    try { window.location.replace('/vendor/login?loggedout=1'); } catch {}
  }, [web3auth]);

  // Reset on account/network change — call the same logout handler
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const eth = (window as any).ethereum;
    if (!eth?.on) return;

    const onAccountsChanged = async () => { try { await logout(); } catch {} };
    const onChainChanged = () => window.location.reload();

    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);
    return () => {
      try {
        eth.removeListener?.('accountsChanged', onAccountsChanged);
        eth.removeListener?.('chainChanged', onChainChanged);
      } catch {}
    };
  }, [logout]);

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

'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
import { ethers } from 'ethers';
import { useRouter, usePathname } from 'next/navigation';
import { postJSON, loginWithSignature, getAuthRoleOnce, getVendorProfile } from '@/lib/api';

type Role = 'admin' | 'vendor' | 'guest';
type Session = 'unauthenticated' | 'authenticating' | 'authenticated';

const normalizeRole = (v: any): Role => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'admin' || s === 'vendor' ? (s as Role) : 'guest';
};

interface Web3AuthContextType {
  web3auth: Web3Auth | null;
  provider: SafeEventEmitterProvider | null;
  address: string | null;
  role: Role;
  session: Session;
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
  session: 'unauthenticated',
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
    envRpc && !isBareAnkr(envRpc) ? envRpc : '',
    'https://rpc.sepolia.org',
    'https://1rpc.io/sepolia',
  ].filter(Boolean);
  for (const url of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await probeRpc(url)) return url;
  }
  return 'https://rpc.sepolia.org';
}

// ---------- Only load wallet where needed ----------
const pageNeedsWallet = (p?: string) => {
  if (!p) return false;
  return p.startsWith('/vendor') || p.startsWith('/admin') || p.startsWith('/wallet');
};

// ---------- PROVIDER ----------
export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const needsWallet = useMemo(() => pageNeedsWallet(pathname || ''), [pathname]);

  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('guest');
  const [session, setSession] = useState<Session>('unauthenticated');
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  // Only restore token for Bearer fallback; DO NOT restore address/role (prevents early redirect)
  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
    } finally {
      setMounted(true);
    }
  }, []);

  // Init Web3Auth (MetaMask + optional WalletConnect) — gated by needsWallet
  useEffect(() => {
    if (!needsWallet) return;

    // 1. Declare w3a instance here so cleanup function can access it
    let w3a: Web3Auth | null = null;

    const init = async () => {
      try {
        if (!clientId) {
          console.error('Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }
        const rpcTarget = await pickHealthyRpc();
        const chainConfig = {
          chainNamespace: CHAIN_NAMESPACES.EIP155,
          chainId: '0xaa36a7', // sepolia
          rpcTarget,
          displayName: 'Sepolia Testnet',
          blockExplorerUrl: 'https://sepolia.etherscan.io',
          ticker: 'ETH',
          tickerName: 'Ethereum Sepolia',
        };

        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        // 2. Assign to the outer variable
        w3a = new Web3Auth({
          clientId,
          web3AuthNetwork: WEB3AUTH_NETWORK,
          privateKeyProvider,
          uiConfig: {},
        });

        // External wallets
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

        // No OpenLogin adapter here.

        await w3a.initModal();
        setWeb3auth(w3a);
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();

    // 3. THE FIX: Return a cleanup function
    return () => {
      if (w3a) {
        // This tells Web3Auth to clean up its listeners and modal
        w3a.destroy().catch((e) => console.error("Web3Auth destroy error:", e));
        setWeb3auth(null); // Also clear it from state
      }
    };
  }, [needsWallet]);

  // Fresh server role check (no cache)
  const refreshRole = async () => {
    try {
      const info = await getAuthRoleOnce(); // ← FRESH, not the cached once()
      const r = normalizeRole(info?.role);
      setRole(r);
      setSession(r === 'vendor' || r === 'admin' ? 'authenticated' : 'unauthenticated');
      if ((info as any)?.address) {
        const addr = String((info as any).address);
        setAddress(addr);
      }
      // mirror for cross-tab listeners / UI that peeks localStorage
      try { localStorage.setItem('lx_role', r); } catch {}
      try { window.dispatchEvent(new Event('lx-role-changed')); } catch {}
    } catch (e) {
      console.warn('refreshRole failed:', e);
      setSession('unauthenticated');
      setRole('guest');
    }
  };

  useEffect(() => {
    if (mounted) void refreshRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Also re-check on tab focus or route changes (fixes “admin link not visible until refresh”)
  useEffect(() => {
    const onFocus = () => void refreshRole();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  useEffect(() => {
    // small debounce to avoid spamming during rapid RSC navigations
    const t = setTimeout(() => { void refreshRole(); }, 50);
    return () => clearTimeout(t);
  }, [pathname]);

  const login = async () => {
    if (!web3auth || loggingIn) return;
    setLoggingIn(true);
    try {
      setSession('authenticating');

      // Prefer MetaMask explicitly to avoid stray cached providers
      let web3authProvider: SafeEventEmitterProvider | null = null;
      try {
        web3authProvider = await (web3auth as any).connectTo(WALLET_ADAPTERS.METAMASK);
      } catch (err: any) {
        const msg = String(err?.message || err || '').toLowerCase();
        if (msg.includes('already connected')) {
          web3authProvider = (web3auth as any).provider || (await web3auth.connect());
        } else {
          // fallback to modal if user cancels, etc.
          web3authProvider = await web3auth.connect();
        }
      }

      if (!web3authProvider) throw new Error('No provider from Web3Auth');
      setProvider(web3authProvider);

      // Get address AFTER user approves in MetaMask
      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);

      // SIWE-ish nonce + signature
      const { nonce } = await postJSON('/auth/nonce', { address: addr });
      const signature = await signer.signMessage(nonce);

      // Exchange for JWT (server sets cookie; mirror to localStorage + site cookie)
      const { role: srvRole, token: jwt } = await loginWithSignature(addr, signature);
      if (jwt) {
        try { localStorage.setItem('lx_jwt', jwt); } catch {}
        document.cookie = `lx_jwt=${jwt}; path=/; Secure; SameSite=None`;
        setToken(jwt);
      }
      // optimistic local role (will be corrected by fresh call below)
      try { localStorage.setItem('lx_role', srvRole || 'vendor'); } catch {}

      // Fresh confirm with server (no cache)
      await refreshRole();

      // Post-login redirect (vendor profile completeness)
      try {
        const p = await getVendorProfile().catch(() => null);
        const url = new URL(window.location.href);
        const nextParam = url.searchParams.get('next');
        const fallback = pathname || '/';
        const dest =
          !p || !(p?.vendorName || p?.companyName) || !p?.email
            ? `/vendor/profile?next=${encodeURIComponent(nextParam || fallback)}`
            : (nextParam || (role === 'admin' ? '/admin' : '/vendor/dashboard'));

        // if admin, prefer /admin unless an explicit next=... overrides
        const finalDest =
          role === 'admin' && !nextParam ? '/admin' : dest;

        router.replace(finalDest);
      } catch {
        router.replace(role === 'admin' ? '/admin' : '/vendor/dashboard');
      }
    } catch (e) {
      console.error('Login error:', e);
      setSession('unauthenticated');
    } finally {
      setLoggingIn(false);
    }
  };

  const clearJwtEverywhere = () => {
    try { localStorage.removeItem('lx_jwt'); } catch {}
    try { localStorage.removeItem('lx_role'); } catch {}
    // kill site cookie copy
    try { document.cookie = 'lx_jwt=; Max-Age=0; path=/; Secure; SameSite=None'; } catch {}
  };

  const logout = async () => {
    try { await web3auth?.logout(); } catch {}
    try { await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' }); } catch {}
    clearJwtEverywhere();
    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');
    setSession('unauthenticated');
    try { window.dispatchEvent(new Event('lx-role-changed')); } catch {}
    try { router.replace('/vendor/login'); } catch {}
  };

  // Account / network change
  useEffect(() => {
    if (!needsWallet) return;
    if (typeof window === 'undefined') return;
    const eth = (window as any).ethereum;
    if (!eth?.on) return;

    const onAccountsChanged = async (_accounts: string[]) => {
      try {
        await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' }).catch(() => {});
      } finally {
        clearJwtEverywhere();
        setProvider(null);
        setAddress(null);
        setToken(null);
        setRole('guest');
        setSession('unauthenticated');
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
  }, [needsWallet]);

  if (!mounted) return null;

  return (
    <Web3AuthContext.Provider
      value={{ web3auth, provider, address, role, session, token, login, logout, refreshRole }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);
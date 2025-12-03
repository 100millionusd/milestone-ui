'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
import { ethers } from 'ethers';
import { useRouter, usePathname } from 'next/navigation';
// We still need all these for the role-aware redirect
import { postJSON, loginWithSignature, getAuthRole, getVendorProfile, getProposerProfile, clearAuthRoleCache, apiFetch } from '@/lib/api';

type Role = 'admin' | 'vendor' | 'guest' | 'proposer';
type Session = 'unauthenticated' | 'authenticating' | 'authenticated';

const normalizeRole = (v: any): Role => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'admin' || s === 'vendor' || s === 'proposer' ? (s as Role) : 'guest';
};

interface Web3AuthContextType {
  web3auth: Web3Auth | null;
  provider: SafeEventEmitterProvider | null;
  address: string | null;
  role: Role;
  session: Session;
  token: string | null;
  login: (role: 'vendor' | 'proposer' | 'admin') => Promise<void>; // 💡 CHANGED
  logout: () => Promise<void>;
  refreshRole: () => Promise<{ role: Role; address: string | null }>;
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  address: null,
  role: 'guest',
  session: 'unauthenticated',
  token: null,
  login: async (role: 'vendor' | 'proposer' | 'admin') => { }, // 💡 CHANGED
  logout: async () => { },
  refreshRole: async () => ({ role: 'guest', address: null }),
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
  return 'https.rpc.sepolia.org';
}

// ---------- Only load wallet where needed ----------
const pageNeedsWallet = (p?: string) => {
  if (!p) return false;
  return p.startsWith('/vendor') || p.startsWith('/admin') || p.startsWith('/wallet') || p.startsWith('/proposer') || p.startsWith('/new');
};

// ==================================================
// 💡 SINGLETON PATTERN: Create a persistent, global instance
// ==================================================
let globalWeb3Auth: Web3Auth | null = null;
let isWeb3AuthInitialized = false;
// ==================================================
let web3authInstance: Web3Auth | null = null;
let providerInstance: SafeEventEmitterProvider | null = null;


// ---------- PROVIDER ----------
export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // 1. Client-side Tenant Resolution Fallback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const tenantSlug = params.get('tenant');

    if (tenantSlug) {
      // Check if we already have the correct cookie
      const currentCookie = document.cookie.match(new RegExp('(^| )lx_tenant_slug=([^;]+)'))?.[2];

      if (currentCookie !== tenantSlug) {
        console.log('[Client] Resolving tenant slug:', tenantSlug);
        // Fetch ID from API
        fetch(`${API_BASE}/api/tenants/lookup?slug=${tenantSlug}`)
          .then(res => res.json())
          .then(data => {
            if (data.id) {
              console.log('[Client] Setting tenant cookie:', data.id);
              document.cookie = `lx_tenant_id=${data.id}; path=/; max-age=86400; samesite=lax`;
              document.cookie = `lx_tenant_slug=${data.slug}; path=/; max-age=86400; samesite=lax`;

              // Force re-fetch of role since tenant context changed
              refreshRole();

              // Optional: Reload page if we want to be absolutely sure everything resets
              // window.location.reload();
            }
          })
          .catch(err => console.error('[Client] Tenant lookup failed:', err));
      }
    }
  }, [pathname]);
  const needsWallet = useMemo(() => pageNeedsWallet(pathname || ''), [pathname]);

  // Use the global instance as the *initial* state
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(globalWeb3Auth);
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
    // 1. Only run if we need a wallet AND it's not already set in state
    if (!needsWallet || web3auth) return;

    // 2. If it's already initialized globally, just set it to state and finish.
    if (globalWeb3Auth && isWeb3AuthInitialized) {
      setWeb3auth(globalWeb3Auth);
      return;
    }

    // 3. If it's initializing but not done, wait.
    if (globalWeb3Auth && !isWeb3AuthInitialized) {
      return;
    }

    // 4. This is the FIRST time we're initializing
    const init = async () => {
      try {
        if (!clientId) {
          console.error('Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }

        // Check again in case of a race condition
        if (globalWeb3Auth) {
          setWeb3auth(globalWeb3Auth);
          return;
        }

        const rpcTarget = await pickHealthyRpc();
        const chainConfig = {
          chainNamespace: CHAIN_NAMESPACES.EIP155,
          chainId: '0xaa36a7', // sepolia
          rpcTarget,
          displayName: 'Sepolia Testnet',
          blockExplorerUrl: 'https.sepolia.etherscan.io',
          ticker: 'ETH',
          tickerName: 'Ethereum Sepolia',
        };

        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        // 5. Create and assign to GLOBAL instance
        globalWeb3Auth = new Web3Auth({
          clientId,
          web3AuthNetwork: WEB3AUTH_NETWORK,
          privateKeyProvider,
          uiConfig: {},
        });

        // External wallets
        globalWeb3Auth.configureAdapter(new MetamaskAdapter());

        if (wcProjectId) {
          globalWeb3Auth.configureAdapter(
            new WalletConnectV2Adapter({
              adapterSettings: {
                projectId: wcProjectId,
                qrcodeModalOptions: { themeMode: 'dark' },
              },
            })
          );
        }

        // No OpenLogin adapter here.

        // 6. Init the modal
        await globalWeb3Auth.initModal();

        // 7. Mark as initialized
        isWeb3AuthInitialized = true;

        // 8. Set to state
        setWeb3auth(globalWeb3Auth);

      } catch (e) {
        console.error('Web3Auth init error:', e);
        globalWeb3Auth = null; // Reset on failure
        isWeb3AuthInitialized = false;
      }
    };
    init();

    // 9. No cleanup function is needed because the instance is global and persistent.

  }, [needsWallet, web3auth]); // Dependencies ensure this runs if we need a wallet and don't have it

  // This function now returns the fresh role info to fix the login race condition
  const refreshRole = async () => {
    try {
      const info = await getAuthRole(); // Use UNCACHED function
      const r = normalizeRole(info?.role);
      setRole(r);
      const addr = (info as any)?.address ? String((info as any).address) : null;
      setAddress(addr);

      // 🛑 FIX: If we have an address, we are authenticated (even if just a guest)
      setSession(addr ? 'authenticated' : 'unauthenticated');

      // mirror for cross-tab listeners / UI that peeks localStorage
      try { localStorage.setItem('lx_role', r); } catch { }
      try { window.dispatchEvent(new Event('lx-role-changed')); } catch { }
      // Return the fresh info
      return { role: r, address: addr };
    } catch (e) {
      console.warn('refreshRole failed:', e);
      setSession('unauthenticated');
      setRole('guest');
      // Return error state
      return { role: 'guest' as Role, address: null };
    }
  };

  useEffect(() => {
    if (mounted) void refreshRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Also re-check on tab focus
  useEffect(() => {
    const onFocus = () => void refreshRole();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Removed the useEffect[pathname] hook that was causing the redirect loop

  // 💡 CHANGED: login now accepts the user's role intent
  const login = async (role: 'vendor' | 'proposer' | 'admin') => {
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

      // 💡 CHANGED: Pass the chosen role to the server
      const { token: jwt } = await loginWithSignature(addr, signature, role);

      if (jwt) {
        try { localStorage.setItem('lx_jwt', jwt); } catch { }
        let domain = '';
        const hostname = window.location.hostname;
        if (!hostname.includes('localhost')) {
          const parts = hostname.split('.');
          if (hostname.endsWith('netlify.app') || hostname.endsWith('vercel.app')) {
            domain = `; Domain=.${parts.slice(-3).join('.')}`;
          } else {
            domain = `; Domain=.${parts.slice(-2).join('.')}`;
          }
        }
        document.cookie = `lx_jwt=${jwt}; path=/; Secure; SameSite=None${domain}`;
        setToken(jwt);
      }

      // ==========================================================
      // 💡 Await refreshRole AND use its return value
      // ==========================================================

      // 1. Clear any stale client-side cache
      clearAuthRoleCache();

      // 2. Await the fresh role *directly* from the server
      const { role: finalRole } = await refreshRole(); // This now returns the role

      // 3. Post-login redirect (using the fresh, correct role)
      try {
        const url = new URL(window.location.href);
        let nextParam = url.searchParams.get('next'); // Get the raw nextParam
        let dest = '/'; // Final destination

        const currentPath = window.location.pathname;

        // 🛑 FIX: Allow staying on specific pages (like create-tenant) even after login
        if (currentPath === '/create-tenant' || currentPath === '/new') {
          dest = currentPath;
        } else if (finalRole === 'admin') {
          dest = nextParam || '/admin'; // Admin can go anywhere

        } else if (finalRole === 'vendor') {
          // 💡 If nextParam is for proposers, ignore it.
          if (nextParam && (nextParam.startsWith('/proposer') || nextParam === '/new')) {
            nextParam = null; // Ignore forbidden nextParam
          }

          // Check vendor profile completeness
          const p = await getVendorProfile().catch(() => null);
          dest = (!p || !(p?.vendorName || p?.companyName) || !p?.email)
            ? `/vendor/profile?next=${encodeURIComponent(nextParam || '/vendor/dashboard')}`
            : (nextParam || '/vendor/dashboard');

        } else if (finalRole === 'proposer') {
          // 💡 If nextParam is for vendors, ignore it.
          if (nextParam && nextParam.startsWith('/vendor')) {
            nextParam = null; // Ignore forbidden nextParam
          }

          // Check proposer profile completeness
          const p = await getProposerProfile().catch(() => null);
          dest = (!p || !p?.orgName || !p?.contactEmail)
            ? `/proposer/profile?next=${encodeURIComponent(nextParam || '/new')}`
            : (nextParam || '/new');
        } else {
          // Guest
          dest = nextParam || '/';
        }

        router.replace(dest); // This is now safe and loop-free

      } catch (e) {
        console.error("Post-login redirect error:", e);
        // Safe fallback
        router.replace(finalRole === 'admin' ? '/admin' : (finalRole === 'vendor' ? '/vendor/dashboard' : '/'));
      }
    } catch (e) {
      console.error('Login error:', e);
      setSession('unauthenticated');
    } finally {
      setLoggingIn(false);
    }
  };

  const clearJwtEverywhere = () => {
    try { localStorage.removeItem('lx_jwt'); } catch { }
    try { localStorage.removeItem('lx_role'); } catch { }

    // Calculate domain for robust clearing (same logic as login)
    let domain = '';
    const hostname = window.location.hostname;
    if (!hostname.includes('localhost')) {
      const parts = hostname.split('.');
      if (hostname.endsWith('netlify.app') || hostname.endsWith('vercel.app')) {
        domain = `; Domain=.${parts.slice(-3).join('.')}`;
      } else {
        domain = `; Domain=.${parts.slice(-2).join('.')}`;
      }
    }

    // 1. Clear with domain (for cross-subdomain cookies)
    try { document.cookie = `lx_jwt=; Max-Age=0; path=/; Secure; SameSite=None${domain}`; } catch { }
    try { document.cookie = `lx_tenant_id=; Max-Age=0; path=/; Secure; SameSite=None${domain}`; } catch { }
    try { document.cookie = `lx_tenant_slug=; Max-Age=0; path=/; Secure; SameSite=None${domain}`; } catch { }

    // 2. Clear without domain (fallback for host-only cookies)
    try { document.cookie = 'lx_jwt=; Max-Age=0; path=/; Secure; SameSite=None'; } catch { }
    try { document.cookie = 'lx_tenant_id=; Max-Age=0; path=/; Secure; SameSite=None'; } catch { }
    try { document.cookie = 'lx_tenant_slug=; Max-Age=0; path=/; Secure; SameSite=None'; } catch { }
  };

  const logout = async () => {
    try { await web3auth?.logout(); } catch { }
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch { }
    clearJwtEverywhere();
    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');
    setSession('unauthenticated');
    try { window.dispatchEvent(new Event('lx-role-changed')); } catch { }
    try { router.replace('/vendor/login'); } catch { }
  };

  // Account / network change
  useEffect(() => {
    if (!needsWallet) return;
    if (typeof window === 'undefined') return;
    const eth = (window as any).ethereum;

    if (!eth?.on) return; // Fixed typo

    const onAccountsChanged = async (_accounts: string[]) => {
      try {
        await apiFetch('/auth/logout', { method: 'POST' }).catch(() => { });
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
      } catch { }
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
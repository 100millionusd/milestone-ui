'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
import { ethers } from 'ethers';
import { useRouter, usePathname } from 'next/navigation';
import { postJSON, loginWithSignature, getAuthRole, getAuthRoleOnce, getVendorProfile } from '@/lib/api';

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
  return p.startsWith('/vendor') || p.startsWith('/admin/payments') || p.startsWith('/wallet');
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

  // Only restore token for Bearer fallback; DO NOT restore address/role (prevents early redirect)
  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
    } finally {
      setMounted(true);
    }
  }, []);

  // Init Web3Auth (MetaMask + WalletConnect only) — gated by needsWallet
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
          chainId: '0xaa36a7', // sepolia
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

        // No OpenLogin / Auth here (keeps build stable). Social can be added later if needed.

        await w3a.initModal();
        setWeb3auth(w3a);
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();
  }, [needsWallet]);

  // Server role check → establishes session only when backend says so
  const refreshRole = async () => {
    try {
      const info = await getAuthRoleOnce();
      const r = normalizeRole(info?.role);
      setRole(r);
      if (r === 'vendor' || r === 'admin') {
        setSession('authenticated');
      } else {
        setSession('unauthenticated');
      }
      if ((info as any)?.address) {
        const addr = String((info as any).address);
        setAddress(addr);
      }
    } catch (e) {
      console.warn('refreshRole failed:', e);
      setSession('unauthenticated');
    }
  };

  useEffect(() => {
    if (mounted) void refreshRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const login = async () => {
    if (!web3auth) return;
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
      setAddress(addr); // UI can show it, but we still wait for backend auth

      // SIWE-ish nonce + signature
      const { nonce } = await postJSON('/auth/nonce', { address: addr });
      const signature = await signer.signMessage(nonce);

      // Exchange for JWT (server sets cookie; we also mirror in localStorage + a lax cookie)
      const { role: srvRole, token: jwt } = await loginWithSignature(addr, signature);
      if (jwt) {
        try {
          localStorage.setItem('lx_jwt', jwt);
        } catch {}
        document.cookie = `lx_jwt=${jwt}; path=/; Secure; SameSite=None`;
        setToken(jwt);
      }

      // Confirm with server (fresh, not cached)
      const info = await getAuthRole();
      const r = normalizeRole(info.role);
      setRole(r);
      setSession(r === 'vendor' || r === 'admin' ? 'authenticated' : 'unauthenticated');

      // Post-login redirect (vendor completeness check)
      try {
        const p = await getVendorProfile().catch(() => null);
        const url = new URL(window.location.href);
        const nextParam = url.searchParams.get('next');
        const fallback = pathname || '/';
        if (!p || !(p?.vendorName || p?.companyName) || !p?.email) {
          const dest = `/vendor/profile?next=${encodeURIComponent(nextParam || fallback)}`;
          router.replace(dest);
        } else {
          router.replace(nextParam || (r === 'admin' ? '/admin' : '/vendor/dashboard'));
        }
      } catch {
        router.replace(r === 'admin' ? '/admin' : '/vendor/dashboard');
      }
    } catch (e) {
      console.error('Login error:', e);
      setSession('unauthenticated');
    }
  };

  const logout = async () => {
    try {
      await web3auth?.logout();
    } catch {}
    try {
      await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' });
    } catch {}

    // 🔴 clear the client-side cookie we set on login
    try {
      document.cookie = 'lx_jwt=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=None';
    } catch {}

    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');
    setSession('unauthenticated');
    try {
      localStorage.removeItem('lx_jwt');
    } catch {}
    try {
      router.replace('/vendor/login');
    } catch {}
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
        // 🔴 also clear cookie here
        try {
          document.cookie = 'lx_jwt=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=None';
        } catch {}
        setProvider(null);
        setAddress(null);
        setToken(null);
        setRole('guest');
        setSession('unauthenticated');
        try { localStorage.removeItem('lx_jwt'); } catch {}
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

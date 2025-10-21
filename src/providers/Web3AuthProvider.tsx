'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
import { ethers } from 'ethers';
import { useRouter, usePathname } from 'next/navigation';
import { postJSON, loginWithSignature, getAuthRole, getVendorProfile } from '@/lib/api';

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
  /** Opens modal; pass "google" or "metamask" to force a method */
  login: (method?: 'google' | 'metamask') => Promise<void>;
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
// use devnet unless your clientId is allowlisted for mainnet
const WEB3AUTH_NETWORK = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || 'sapphire_devnet';

// Optional custom RPCs
const ankrKey = process.env.NEXT_PUBLIC_ANKR_API_KEY || '';
const envRpc =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ||
  (ankrKey ? `https://rpc.ankr.com/eth_sepolia/${ankrKey}` : '');

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
const pageNeedsWallet = (p?: string) =>
  !!p && (p.startsWith('/vendor') || p.startsWith('/admin/payments') || p.startsWith('/wallet'));

// ---------- PROVIDER ----------
export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const needsWallet = useMemo(() => pageNeedsWallet(pathname || ''), [pathname]);

  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('guest');
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Restore quick state
  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
      setRole(normalizeRole(localStorage.getItem('lx_role')));
      setAddress(localStorage.getItem('lx_addr'));
    } finally {
      setMounted(true);
    }
  }, []);

  // Init Web3Auth — gated by needsWallet
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
          web3AuthNetwork: WEB3AUTH_NETWORK,
          privateKeyProvider,
          uiConfig: {
            // lean modal; you pick button in UI, or call login('google'|'metamask')
            mode: 'auto', // or 'dark'/'light'
          },
        });

        // MetaMask adapter
        w3a.configureAdapter(new MetamaskAdapter());

        // OpenLogin adapter (for Google)
        const openlogin = new OpenloginAdapter({
          adapterSettings: {
            uxMode: 'popup',
            loginConfig: {
              // Show only Google in the in-app wallet list
              google: {
                name: 'Google',
                verifier: 'google',
                typeOfLogin: 'google',
              },
            },
          },
        });
        w3a.configureAdapter(openlogin);

        // IMPORTANT: we are NOT adding WalletConnect — avoids missing peer package at build time

        // Init modal. We explicitly allow OpenLogin + MetaMask only.
        await w3a.initModal({
          modalConfig: {
            [WALLET_ADAPTERS.OPENLOGIN]: { showOnModal: true },
            [WALLET_ADAPTERS.METAMASK]: { showOnModal: true },
          },
        });

        setWeb3auth(w3a);
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();
  }, [needsWallet]);

  // Role from server
  const refreshRole = async () => {
    try {
      const info = await getAuthRole();
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

  // Core login flow — will NOT proceed until user finishes wallet action
  const login = async (method?: 'google' | 'metamask') => {
    if (!web3auth) return;
    try {
      // 0) Connect wallet (waits for user)
      let web3authProvider: SafeEventEmitterProvider | null = null;
      if (method === 'google') {
        web3authProvider = await web3auth.connectTo(WALLET_ADAPTERS.OPENLOGIN, {
          loginProvider: 'google',
        });
      } else if (method === 'metamask') {
        web3authProvider = await web3auth.connectTo(WALLET_ADAPTERS.METAMASK);
      } else {
        web3authProvider = await web3auth.connect(); // opens modal, user picks
      }
      if (!web3authProvider) throw new Error('No provider from Web3Auth');
      setProvider(web3authProvider);

      // 1) Address (EIP-1193 request happens only after user approves)
      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      // 2) Nonce
      const { nonce } = await postJSON('/auth/nonce', { address: addr });

      // 3) Sign
      const signature = await signer.signMessage(nonce);

      // 4) Exchange for token (api.ts will stash token in localStorage as lx_jwt)
      const { role: srvRole } = await loginWithSignature(addr, signature);

      // 4b) Also set a **first-party cookie** so SSR can forward it to your API
      const jwt = localStorage.getItem('lx_jwt');
      if (jwt) {
        // SameSite=None; Secure so it works on Netlify/https
        document.cookie = `lx_jwt=${jwt}; Path=/; Secure; SameSite=None`;
        setToken(jwt);
      }

      // 5) Role update
      setRole(srvRole || 'vendor');
      localStorage.setItem('lx_role', srvRole || 'vendor');

      // 6) Confirm with backend (reads cookie or Bearer)
      await refreshRole();

      // 7) Post-login redirect (vendor profile completeness)
      try {
        const p = await getVendorProfile().catch(() => null);
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
    // wipe cookie
    document.cookie = 'lx_jwt=; Path=/; Max-Age=0; Secure; SameSite=None';
    try {
      router.replace('/');
    } catch {}
  };

  // Reset on account/network change — only on wallet pages
  useEffect(() => {
    if (!needsWallet) return;
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
        document.cookie = 'lx_jwt=; Path=/; Max-Age=0; Secure; SameSite=None';
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
      value={{ web3auth, provider, address, role, token, login, logout, refreshRole }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

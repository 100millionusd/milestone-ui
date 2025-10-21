'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
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
  login: (adapter?: 'metamask' | 'walletconnect' | 'openlogin') => Promise<void>;
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

// ---------- RPC health ----------
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
    if (await probeRpc(url)) return url;
  }
  return 'https://rpc.sepolia.org';
}

// ---------- Where to init wallets ----------
const pageNeedsWallet = (p?: string) => {
  if (!p) return false;
  // ✅ We DO init on /vendor/login so the Web3Auth modal (Google) works there
  return (
    p.startsWith('/vendor') ||
    p.startsWith('/admin/payments') ||
    p.startsWith('/wallet')
  );
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
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  // Restore from localStorage fast
  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
      setRole(normalizeRole(localStorage.getItem('lx_role')));
      setAddress(localStorage.getItem('lx_addr'));
    } finally {
      setMounted(true);
    }
  }, []);

  // Init Web3Auth (EOA + socials)
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
            appLogo: '', // optional
          },
        });

        // ---- Adapters ----
        // MetaMask (EOA)
        w3a.configureAdapter(new MetamaskAdapter());

        // WalletConnect (EOA)
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

        // ✅ OpenLogin (socials: Google, Reddit, etc.)
        const openlogin = new OpenloginAdapter({
          adapterSettings: {
            uxMode: 'popup', // popup is safest on Netlify
            // If you use redirect mode, allowlist this in Web3Auth dashboard
            // redirectUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
            loginConfig: {
              // Example: show Google explicitly (others appear by default too)
              google: {
                verifier: '', // optional: if using a custom verifier
                typeOfLogin: 'google',
                clientId: '', // optional if using Web3Auth default
              },
            },
          },
          // whiteLabel: { name: 'Your App', defaultLanguage: 'en' },
        });
        w3a.configureAdapter(openlogin);

        // Show OpenLogin on the modal
        await w3a.initModal({
          modalConfig: {
            [WALLET_ADAPTERS.OPENLOGIN]: { showOnModal: true },
          },
        });

        setWeb3auth(w3a);
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();
  }, [needsWallet]);

  // Role refresh (skip during active login)
  const refreshRole = async () => {
    try {
      if (authBusy) return;
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
    if (mounted && !authBusy) void refreshRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, authBusy]);

  // MetaMask approval gate — only needed when user chose MetaMask
  async function ensureAccountsApproved(ethish: any): Promise<string> {
    const before = await ethish.request?.({ method: 'eth_accounts' }).catch(() => []);
    if (!before || !before.length) {
      await ethish.request({ method: 'eth_requestAccounts' }); // shows MetaMask connect
    }
    const after = await ethish.request({ method: 'eth_accounts' });
    if (!after || !after.length) {
      throw new Error('User rejected wallet connection');
    }
    return after[0];
  }

  const isProfileIncomplete = (p: any) => !(!!(p?.vendorName || p?.companyName) && !!p?.email);

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

  // ---------- LOGIN ----------
  const login = async (adapter?: 'metamask' | 'walletconnect' | 'openlogin') => {
    if (!web3auth) return;
    setAuthBusy(true);
    try {
      // 1) Open the modal / adapter of choice
      const w3Provider =
        adapter === 'metamask'
          ? await web3auth.connectTo(WALLET_ADAPTERS.METAMASK)
          : adapter === 'walletconnect'
          ? await web3auth.connectTo(WALLET_ADAPTERS.WALLET_CONNECT_V2)
          : adapter === 'openlogin'
          ? await web3auth.connectTo(WALLET_ADAPTERS.OPENLOGIN)
          : // default: show modal with all options (Google included)
            await web3auth.connect();

      if (!w3Provider) throw new Error('No provider from Web3Auth');
      setProvider(w3Provider);

      // 2) If this is MetaMask, force the connect approval BEFORE nonce/sign
      const isMetaMask = (w3Provider as any)?.isMetaMask === true;
      if (isMetaMask) {
        await ensureAccountsApproved(w3Provider);
      }

      // 3) Get signer/address
      const ethersProvider = new ethers.BrowserProvider(w3Provider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      // 4) Nonce -> 5) Sign
      const { nonce } = await postJSON('/auth/nonce', { address: addr });
      const signature = await signer.signMessage(nonce);

      // 6) Exchange for JWT (stored to localStorage by api.ts)
      const { role: srvRole } = await loginWithSignature(addr, signature);

      // 7) Mirror JWT into first-party cookie for SSR routes, then hard reload
      const jwt = localStorage.getItem('lx_jwt');
      if (jwt) {
        document.cookie = `lx_jwt=${jwt}; Path=/; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
      }

      // 8) Update local role and confirm with server once (optional)
      const r = normalizeRole(srvRole || 'vendor');
      setRole(r);
      localStorage.setItem('lx_role', r);

      await getAuthRole({ address: addr }).catch(() => ({}));

      // 9) Reload so SSR-protected pages see cookie
      window.location.reload();
    } catch (e) {
      console.error('Login error:', e);
    } finally {
      setAuthBusy(false);
    }
  };

  // ---------- LOGOUT ----------
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
    try {
      router.replace('/');
    } catch {}
  };

  // ---------- SAFE listeners (no auto /auth/logout spam) ----------
  useEffect(() => {
    if (!needsWallet) return;
    if (typeof window === 'undefined') return;
    const eth = (window as any).ethereum;
    if (!eth?.on) return;

    let debounce: any = null;
    const onAccountsChanged = (_accounts: string[]) => {
      const prev = (localStorage.getItem('lx_addr') || '').toLowerCase();
      const next = (_accounts?.[0] || '').toLowerCase();
      if (!prev) return;            // ignore on first boot
      if (next && prev && next !== prev) {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          window.location.href = '/vendor/login?reason=account_changed';
        }, 300);
      }
    };
    const onChainChanged = () => window.location.reload();

    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);
    return () => {
      try {
        eth.removeListener?.('accountsChanged', onAccountsChanged);
        eth.removeListener?.('chainChanged', onChainChanged);
        clearTimeout(debounce);
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

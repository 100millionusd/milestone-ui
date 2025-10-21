// src/providers/Web3AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
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
    if (await probeRpc(url)) return url;
  }
  return 'https://rpc.sepolia.org';
}

// ---------- Only load wallet where needed (avoid listeners on login page) ----------
const pageNeedsWallet = (p?: string) => {
  if (!p) return false;
  if (p.startsWith('/vendor/login')) return false;     // no wallet init on login screen
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
  const [authBusy, setAuthBusy] = useState(false);     // prevent races during login

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

  // Init Web3Auth (NO OpenLogin) — gated
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
          chainId: '0xaa36a7',
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

        // Adapters (EOA only)
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

        // Hide OpenLogin completely
        await w3a.initModal({
          modalConfig: {
            [WALLET_ADAPTERS.OPENLOGIN]: { showOnModal: false },
          },
        });

        setWeb3auth(w3a);
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();
  }, [needsWallet]);

  // Role refresh from server cookie/Bearer (skip while logging in)
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

  // ----- STRICT GATED LOGIN (MetaMask must be approved first) -----
  async function ensureAccountsApproved(ethish: any): Promise<string> {
    const before = await ethish.request?.({ method: 'eth_accounts' }).catch(() => []);
    if (!before || !before.length) {
      // This triggers MetaMask "Connect" and waits for user's choice
      await ethish.request({ method: 'eth_requestAccounts' });
    }
    const after = await ethish.request({ method: 'eth_accounts' });
    if (!after || !after.length) {
      throw new Error('User rejected wallet connection');
    }
    return after[0];
  }

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

  const login = async () => {
    if (!web3auth) return;
    setAuthBusy(true);
    try {
      // Always choose MetaMask explicitly so nothing auto-connects.
      const w3Provider = await web3auth.connectTo(WALLET_ADAPTERS.METAMASK);
      if (!w3Provider) throw new Error('No provider from Web3Auth');
      setProvider(w3Provider);

      // 0) HARD GATE — MetaMask "Connect" must complete first.
      const ethish: any = w3Provider;
      const approvedAddr = await ensureAccountsApproved(ethish);

      // 1) Ethers signer AFTER approval
      const ethersProvider = new ethers.BrowserProvider(w3Provider as any);
      const signer = await ethersProvider.getSigner();
      const addr = (await signer.getAddress()) || approvedAddr;
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      // 2) Nonce → 3) Sign
      const { nonce } = await postJSON('/auth/nonce', { address: addr });
      const signature = await signer.signMessage(nonce);

      // 4) Exchange for JWT (api.ts stores localStorage "lx_jwt")
      const { role: srvRole } = await loginWithSignature(addr, signature);

      // 4.1) Mirror JWT into a first-party cookie for SSR and reload
      const jwt = localStorage.getItem('lx_jwt');
      if (jwt) {
        document.cookie = `lx_jwt=${jwt}; Path=/; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
      }

      // 5) Update role locally
      const r = normalizeRole(srvRole || 'vendor');
      setRole(r);
      localStorage.setItem('lx_role', r);

      // 6) Make sure server now sees it, then hard reload so SSR reads cookie
      await getAuthRole({ address: addr }).catch(() => ({}));
      window.location.reload();
    } catch (e) {
      console.error('Login error:', e);
    } finally {
      setAuthBusy(false);
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
    try {
      router.replace('/');
    } catch {}
  };

  // ======= SAFE listeners (no auto /auth/logout spam) =======
  useEffect(() => {
    if (!needsWallet) return;
    if (typeof window === 'undefined') return;
    const eth = (window as any).ethereum;
    if (!eth?.on) return;

    // Debounce to ignore transient empty account arrays some wallets emit on init
    let debounce: any = null;

    const onAccountsChanged = (_accounts: string[]) => {
      // If we don't have a session address yet, ignore noise.
      const prev = (localStorage.getItem('lx_addr') || '').toLowerCase();
      const next = (_accounts?.[0] || '').toLowerCase();

      // Ignore spurious empty events; don't log out automatically.
      if (!prev) return;

      // If user switched accounts, nudge to re-auth, but DON'T call /auth/logout automatically.
      if (next && prev && next !== prev) {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          window.location.href = '/vendor/login?reason=account_changed';
        }, 300);
      }
    };

    const onChainChanged = () => {
      // Soft reload is enough
      window.location.reload();
    };

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
    <Web3AuthContext.Provider value={{ web3auth, provider, address, role, token, login, logout, refreshRole }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

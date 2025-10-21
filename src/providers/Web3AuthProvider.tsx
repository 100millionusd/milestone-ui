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
import { postJSON, loginWithSignature, getAuthRole, getAuthRoleOnce, getVendorProfile } from '@/lib/api';

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
  isConnecting: boolean;
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
  isConnecting: false,
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
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

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

  // Init Web3Auth (MetaMask + optional WC) — gated by needsWallet
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
          chainNamespace: CHAIN_NAMESPACES.EIP155,   // << do not remove
          chainId: '0xaa36a7',                       // 11155111 (Sepolia)
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

        // MetaMask only (no OpenLogin)
        w3a.configureAdapter(new MetamaskAdapter());

        // Optional: WalletConnect (requires @walletconnect/sign-client installed)
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
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();
  }, [needsWallet]);

  const refreshRole = async () => {
    try {
      const info = await getAuthRoleOnce();
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

  const isProfileIncomplete = (p: any) => {
    const hasName = !!(p?.vendorName || p?.companyName);
    const hasEmail = !!p?.email;
    return !(hasName && hasEmail);
  };

  useEffect(() => {
    if (mounted) void refreshRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const login = async () => {
    if (!web3auth || isConnecting) return;
    setIsConnecting(true);

    try {
      let web3authProvider: SafeEventEmitterProvider | null = null;

      // If already connected, reuse provider; otherwise connect to MetaMask explicitly
      if (web3auth.connectedAdapterName) {
        web3authProvider = web3auth.provider;
      } else {
        try {
          web3authProvider = await web3auth.connectTo(WALLET_ADAPTERS.METAMASK);
        } catch (err: any) {
          const msg = String(err?.message || err || '').toLowerCase();
          if (msg.includes('already connected')) {
            web3authProvider = web3auth.provider;
          } else {
            console.error('MetaMask login error:', err);
            throw err;
          }
        }
      }

      if (!web3authProvider) throw new Error('No provider from Web3Auth');
      setProvider(web3authProvider);

      // Explicitly request accounts — this is where the MetaMask popup happens
      try {
        await (window as any)?.ethereum?.request?.({ method: 'eth_requestAccounts' });
      } catch {
        // user might already be connected; continue
      }

      // Get signer AFTER user approves connection
      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      // Server nonce → sign → exchange for JWT
      const { nonce } = await postJSON('/auth/nonce', { address: addr });
      const signature = await signer.signMessage(nonce);
      await loginWithSignature(addr, signature); // stores token in localStorage

      // Mirror token into a cookie for same-origin calls (Safari/3rd-party cookies workarounds)
      const jwt = localStorage.getItem('lx_jwt');
      if (jwt) {
        document.cookie = `lx_jwt=${jwt}; path=/; Secure; SameSite=None`;
      }

      // Confirm role from server
      const info = await getAuthRole();
      const r = normalizeRole(info.role);
      setRole(r);
      localStorage.setItem('lx_role', r);
      if ((info as any)?.address) {
        const a = String((info as any).address);
        setAddress(a);
        localStorage.setItem('lx_addr', a);
      }

      // Redirect based on vendor profile completeness
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
    } finally {
      setIsConnecting(false);
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

  // Reset on account/network change — gated by needsWallet
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
      value={{ web3auth, provider, address, role, token, isConnecting, login, logout, refreshRole }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

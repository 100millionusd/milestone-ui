// src/providers/Web3AuthProvider.tsx
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
  loginWithMetamask: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  address: null,
  role: 'guest',
  token: null,
  loginWithMetamask: async () => {},
  loginWithGoogle: async () => {},
  logout: async () => {},
  refreshRole: async () => {},
});

const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;
const WEB3AUTH_NETWORK = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || 'sapphire_devnet';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const api = (path: string) => (API_BASE ? `${API_BASE}${path}` : `/api${path}`);

async function pickHealthyRpc(): Promise<string> {
  const urls = [
    process.env.NEXT_PUBLIC_SEPOLIA_RPC || '',
    'https://rpc.sepolia.org',
    'https://1rpc.io/sepolia',
  ].filter(Boolean);

  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json().catch(() => ({} as any));
      if (parseInt(String(j?.result || '0x0'), 16) === 11155111) return url;
    } catch {}
  }
  return 'https://rpc.sepolia.org';
}

const pageNeedsWallet = (p?: string) => !!p && (p.startsWith('/vendor') || p.startsWith('/admin/payments') || p.startsWith('/wallet'));

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

  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
      setRole(normalizeRole(localStorage.getItem('lx_role')));
      setAddress(localStorage.getItem('lx_addr'));
    } finally {
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (!needsWallet) return;
    (async () => {
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
        });

        w3a.configureAdapter(new MetamaskAdapter());

        const openloginAdapter = new OpenloginAdapter({
          adapterSettings: { network: WEB3AUTH_NETWORK, uxMode: 'popup' },
        });
        w3a.configureAdapter(openloginAdapter);

        await w3a.initModal({
          modalConfig: {
            [WALLET_ADAPTERS.OPENLOGIN]: { label: 'Continue with Google', showOnModal: true },
            [WALLET_ADAPTERS.METAMASK]: { showOnModal: true },
          },
        });

        setWeb3auth(w3a);
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    })();
  }, [needsWallet]);

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

  useEffect(() => { if (mounted) void refreshRole(); }, [mounted]); // eslint-disable-line

  const completeLogin = async (ethProvider: any) => {
    const ethersProvider = new ethers.BrowserProvider(ethProvider);
    const signer = await ethersProvider.getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
    localStorage.setItem('lx_addr', addr);

    const { nonce } = await postJSON('/auth/nonce', { address: addr });
    const signature = await signer.signMessage(nonce);

    await loginWithSignature(addr, signature);

    const jwt = localStorage.getItem('lx_jwt');
    if (jwt) {
      document.cookie = `lx_jwt=${jwt}; Path=/; Secure; SameSite=None`;
      setToken(jwt);
    }

    await refreshRole();

    try {
      const p = await getVendorProfile().catch(() => null);
      const url = new URL(window.location.href);
      const nextParam = url.searchParams.get('next');
      const fallback = pathname || '/';
      if (!p || !(p?.vendorName || p?.companyName) || !p?.email) {
        window.location.replace(`/vendor/profile?next=${encodeURIComponent(nextParam || fallback)}`);
      } else {
        window.location.replace(nextParam || '/');
      }
    } catch {
      window.location.replace('/');
    }
  };

  const loginWithMetamask = async () => {
    if (!web3auth) return;
    try {
      const prov = await web3auth.connectTo(WALLET_ADAPTERS.METAMASK);
      if (!prov) throw new Error('MetaMask provider unavailable');
      setProvider(prov);
      await completeLogin(prov);
    } catch (e) {
      console.error('MetaMask login error:', e);
    }
  };

  const loginWithGoogle = async () => {
    if (!web3auth) return;
    try {
      const prov = await web3auth.connectTo(WALLET_ADAPTERS.OPENLOGIN, { loginProvider: 'google' } as any);
      if (!prov) throw new Error('OpenLogin provider unavailable');
      setProvider(prov);
      await completeLogin(prov);
    } catch (e) {
      console.error('Google login error:', e);
    }
  };

  const logout = async () => {
    try { await web3auth?.logout(); } catch {}
    try { await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' }); } catch {}
    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');
    localStorage.removeItem('lx_addr');
    localStorage.removeItem('lx_jwt');
    localStorage.removeItem('lx_role');
    try { window.location.replace('/'); } catch {}
  };

  useEffect(() => {
    if (!needsWallet) return;
    const eth = (typeof window !== 'undefined' ? (window as any).ethereum : null);
    if (!eth?.on) return;

    const onAccountsChanged = async () => {
      try { await fetch(api('/auth/logout'), { method: 'POST', credentials: 'include' }); } catch {}
      setProvider(null);
      setAddress(null);
      setToken(null);
      setRole('guest');
      localStorage.removeItem('lx_addr');
      localStorage.removeItem('lx_jwt');
      localStorage.removeItem('lx_role');
      window.location.replace('/vendor/login');
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
      value={{ web3auth, provider, address, role, token, loginWithMetamask, loginWithGoogle, logout, refreshRole }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider, WALLET_ADAPTERS } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
import { ethers } from 'ethers';
import { useRouter, usePathname } from 'next/navigation';

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

// ---- Env ----
const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;
const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC || 'https://rpc.ankr.com/eth_sepolia';
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0xaa36a7', // Sepolia
  rpcTarget: rpcUrl,
  displayName: 'Sepolia Testnet',
  blockExplorerUrl: 'https://sepolia.etherscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum Sepolia',
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  'https://milestone-api-production.up.railway.app';

export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('guest');
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Restore session (address/role/token from storage; server role still comes from cookie)
  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
      setRole(normalizeRole(localStorage.getItem('lx_role')));
      setAddress(localStorage.getItem('lx_addr'));
    } finally {
      setMounted(true);
    }
  }, []);

  // Init Web3Auth (NO OpenLogin adapter)
  useEffect(() => {
    const init = async () => {
      try {
        if (!clientId) {
          console.error('Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }

        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        const w3a = new Web3Auth({
          clientId,
          web3AuthNetwork: 'sapphire_devnet',
          privateKeyProvider,
          uiConfig: {},
        });

        // Only EOA wallets
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

        // Hide OpenLogin entry so modal doesn’t try to init it
        await w3a.initModal({
          modalConfig: {
            [WALLET_ADAPTERS.OPENLOGIN]: { showOnModal: false },
          },
        });

        setWeb3auth(w3a);

        // Do NOT call getSigner() here; we only resolve address after login()
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();
  }, []);

  // Read role from the server (uses httpOnly cookie set by /auth/verify)
  const refreshRole = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/role`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      const norm = normalizeRole(data?.role);
      setRole(norm);
      localStorage.setItem('lx_role', norm);
      if (data?.address && typeof data.address === 'string') {
        localStorage.setItem('lx_addr', data.address);
        setAddress(data.address);
      }
    } catch (e) {
      console.warn('refreshRole failed:', e);
    }
  };

  // Profile completeness helper
  const isProfileIncomplete = (p: any) => {
    const hasName = !!(p?.vendorName || p?.companyName);
    const hasEmail = !!p?.email;
    return !(hasName && hasEmail);
  };

  // After login, check profile and redirect
  const postLoginProfileRedirect = async () => {
    try {
      const r = await fetch(`${API_BASE}/vendor/profile`, { credentials: 'include' });
      const p = r.ok ? await r.json() : null;

      const url = new URL(window.location.href);
      const nextParam = url.searchParams.get('next');
      const fallback = pathname || '/';

      if (!p || isProfileIncomplete(p)) {
        const dest = `/vendor/profile?next=${encodeURIComponent(nextParam || fallback)}`;
        router.replace(dest);
      } else {
        router.replace(nextParam || '/');
      }
    } catch {
      router.replace('/');
    }
  };

  // Sync role from cookie on mount
  useEffect(() => {
    if (mounted) {
      refreshRole();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const login = async () => {
    if (!web3auth) return;
    try {
      // Connect to a wallet (MetaMask / WalletConnect)
      const web3authProvider = await web3auth.connect();
      if (!web3authProvider) throw new Error('No provider from Web3Auth');

      setProvider(web3authProvider);

      // Resolve address AFTER connect
      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      // Ask server for nonce
      const nonceRes = await fetch(`${API_BASE}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: addr }),
      });
      if (!nonceRes.ok) throw new Error('Failed to get nonce');
      const { nonce } = await nonceRes.json();

      // Sign nonce
      const signature = await (new ethers.BrowserProvider(web3authProvider as any))
        .getSigner()
        .then(s => s.signMessage(nonce));

      // Verify (sets httpOnly cookie)
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: addr, signature }),
      });
      if (!verifyRes.ok) throw new Error('Auth verify failed');

      const { role: srvRole } = await verifyRes.json();
      const normRole = normalizeRole(srvRole);

      setToken(null);
      localStorage.removeItem('lx_jwt');

      setRole(normRole);
      localStorage.setItem('lx_role', normRole);

      await refreshRole();
      await postLoginProfileRedirect();
    } catch (e) {
      console.error('Login error:', e);
    }
  };

  const logout = async () => {
    try {
      await web3auth?.logout();
    } catch {}
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');
    localStorage.removeItem('lx_addr');
    localStorage.removeItem('lx_jwt');
    localStorage.removeItem('lx_role');
    try { router.replace('/'); } catch {}
  };

  // Re-auth on account/network change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const eth = (window as any).ethereum;
    if (!eth?.on) return;

    const onAccountsChanged = async (_accounts: string[]) => {
      try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
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

    const onChainChanged = () => {
      window.location.reload();
    };

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
    <Web3AuthContext.Provider value={{ web3auth, provider, address, role, token, login, logout, refreshRole }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

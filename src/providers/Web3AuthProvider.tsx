'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
import { MetamaskAdapter } from '@web3auth/metamask-adapter';
import { WalletConnectV2Adapter } from '@web3auth/wallet-connect-v2-adapter';
import { ethers } from 'ethers';

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
  token: string | null; // kept for compatibility; server uses cookie
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
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('guest');
  const [token, setToken] = useState<string | null>(null); // not used by server; kept for compatibility
  const [mounted, setMounted] = useState(false);

  // Restore session (normalize role)
  useEffect(() => {
    // We still restore any existing token if you later add Bearer support,
    // but the server today authenticates via the cookie it sets on /auth/verify.
    setToken(localStorage.getItem('lx_jwt') || null);
    setRole(normalizeRole(localStorage.getItem('lx_role')));
    setAddress(localStorage.getItem('lx_addr'));
    setMounted(true);
  }, []);

  // Init Web3Auth
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

        w3a.configureAdapter(new OpenloginAdapter({ adapterSettings: { uxMode: 'popup' } }));
        w3a.configureAdapter(new MetamaskAdapter());

        if (wcProjectId) {
          w3a.configureAdapter(
            new WalletConnectV2Adapter({
              adapterSettings: { projectId: wcProjectId, qrcodeModalOptions: { themeMode: 'dark' } },
            })
          );
        }

        await w3a.initModal();
        setWeb3auth(w3a);

        if (w3a.provider) {
          setProvider(w3a.provider);
          const ethersProvider = new ethers.BrowserProvider(w3a.provider as any);
          const signer = await ethersProvider.getSigner();
          const addr = await signer.getAddress();
          setAddress(addr);
          localStorage.setItem('lx_addr', addr);
        }
      } catch (e) {
        console.error('Web3Auth init error:', e);
      }
    };
    init();
  }, []);

  // Read role from the server (prefers cookie)
  const refreshRole = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/role`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include', // send cookie; server reads auth_token
      });
      if (!res.ok) return;
      const data = await res.json();
      const norm = normalizeRole(data?.role);
      setRole(norm);
      localStorage.setItem('lx_role', norm);
    } catch (e) {
      console.warn('refreshRole failed:', e);
    }
  };

  useEffect(() => {
    if (mounted) {
      // keep frontend role in sync with cookie on first paint
      refreshRole();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const login = async () => {
    if (!web3auth) return;
    try {
      const web3authProvider = await web3auth.connect();
      if (!web3authProvider) throw new Error('No provider from Web3Auth');

      setProvider(web3authProvider);

      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      // 1) Ask server for a nonce (POST /auth/nonce with JSON body)
      const nonceRes = await fetch(`${API_BASE}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: addr }),
      });
      if (!nonceRes.ok) throw new Error('Failed to get nonce');
      const { nonce } = await nonceRes.json();

      // 2) Sign the nonce
      const signature = await signer.signMessage(nonce);

      // 3) Verify on server (sets httpOnly auth_token cookie; returns role)
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // IMPORTANT: set cookie cross-site
        body: JSON.stringify({ address: addr, signature }),
      });
      if (!verifyRes.ok) throw new Error('Auth verify failed');

      const { role: srvRole } = await verifyRes.json();
      const normRole = normalizeRole(srvRole);

      // We keep token support here if you later add Bearer on the server,
      // but for now role is derived from the cookie.
      setToken(null);
      localStorage.removeItem('lx_jwt');

      setRole(normRole);
      localStorage.setItem('lx_role', normRole);

      // extra: confirm with /auth/role (reads cookie)
      await refreshRole();
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
  };

  if (!mounted) return null;

  return (
    <Web3AuthContext.Provider value={{ web3auth, provider, address, role, token, login, logout, refreshRole }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

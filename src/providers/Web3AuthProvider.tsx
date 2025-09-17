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

interface Web3AuthContextType {
  web3auth: Web3Auth | null;
  provider: SafeEventEmitterProvider | null;
  address: string | null;
  role: Role;
  token: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  address: null,
  role: 'guest',
  token: null,
  login: async () => {},
  logout: async () => {},
});

// ---- Env ----
const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;
const rpcUrl =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ||
  'https://rpc.ankr.com/eth_sepolia';
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
  const [token, setToken] = useState<string | null>(null);

  // Restore session
  useEffect(() => {
    setToken(localStorage.getItem('lx_jwt'));
    setRole((localStorage.getItem('lx_role') as Role) || 'guest');
    setAddress(localStorage.getItem('lx_addr'));
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        if (!clientId) {
          console.error('Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }

        // EVM PK provider
        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        const w3a = new Web3Auth({
          clientId,
          web3AuthNetwork: 'sapphire_devnet',
          privateKeyProvider,
          // optional: tweak which sections show
          uiConfig: {
            // appLogo: '/logo.png',
            // theme: 'dark',
          },
        });

        // Openlogin (social/email)
        const openlogin = new OpenloginAdapter({
          adapterSettings: { uxMode: 'popup' },
        });
        w3a.configureAdapter(openlogin);

        // MetaMask
        const metamask = new MetamaskAdapter();
        w3a.configureAdapter(metamask);

        // WalletConnect v2 (required projectId)
        if (wcProjectId) {
          const wc = new WalletConnectV2Adapter({
            adapterSettings: {
              projectId: wcProjectId,
              // optional: show QR modal by default
              qrcodeModalOptions: { themeMode: 'dark' },
            },
          });
          w3a.configureAdapter(wc);
        }

        // (Coinbase adapter removed)

        await w3a.initModal(); // <- init after configuring adapters
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

  const login = async () => {
    if (!web3auth) return;
    try {
      const web3authProvider = await web3auth.connect(); // user picks social OR wallet adapter here
      if (!web3authProvider) throw new Error('No provider from Web3Auth');

      setProvider(web3authProvider);

      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);

      // ---- Secure login with your API (nonce -> sign -> jwt) ----
      const nonceRes = await fetch(`${API_BASE}/auth/nonce?address=${addr}`);
      const { nonce } = await nonceRes.json();

      const sig = await signer.signMessage(nonce);
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, signature: sig }),
      });
      if (!loginRes.ok) throw new Error('Auth login failed');
      const { token: jwt, role: srvRole } = await loginRes.json();

      setToken(jwt);
      setRole(srvRole as Role);
      localStorage.setItem('lx_jwt', jwt);
      localStorage.setItem('lx_role', srvRole);
    } catch (e) {
      console.error('Login error:', e);
    }
  };

  const logout = async () => {
    try {
      await web3auth?.logout();
    } catch {}
    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');
    localStorage.removeItem('lx_addr');
    localStorage.removeItem('lx_jwt');
    localStorage.removeItem('lx_role');
  };

  return (
    <Web3AuthContext.Provider value={{ web3auth, provider, address, role, token, login, logout }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

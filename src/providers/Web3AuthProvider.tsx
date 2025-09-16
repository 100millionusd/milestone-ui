'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
import { ethers } from 'ethers';

interface Web3AuthContextType {
  web3auth: Web3Auth | null;
  provider: SafeEventEmitterProvider | null;
  address: string | null;
  role: 'admin' | 'vendor' | 'guest';
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  address: null,
  role: 'guest',
  login: async () => {},
  logout: async () => {},
});

const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;
const rpcUrl =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ||
  'https://rpc.ankr.com/eth_sepolia/d6eaf3a3cd77223e0e2039350d0795b537ce3e7fb331a34c92d8b3854936ab33';

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0xaa36a7', // Sepolia
  rpcTarget: rpcUrl,
  displayName: 'Sepolia Testnet',
  blockExplorerUrl: 'https://sepolia.etherscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum Sepolia',
};

export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<'admin' | 'vendor' | 'guest'>('guest');

  useEffect(() => {
    const init = async () => {
      try {
        if (!clientId) {
          console.error('🚨 Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }

        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        const web3authInstance = new Web3Auth({
          clientId,
          web3AuthNetwork: 'sapphire_devnet',
          privateKeyProvider,
        });

        const openloginAdapter = new OpenloginAdapter({
          adapterSettings: { uxMode: 'popup' },
        });
        web3authInstance.configureAdapter(openloginAdapter);

        await web3authInstance.initModal();
        setWeb3auth(web3authInstance);

        if (web3authInstance.provider) {
          await hydrateSession(web3authInstance.provider);
        }
      } catch (error) {
        console.error('❌ Web3Auth init error:', error);
      }
    };

    init();
  }, []);

  const hydrateSession = async (prov: SafeEventEmitterProvider) => {
    setProvider(prov);
    const ethersProvider = new ethers.BrowserProvider(prov);
    const signer = await ethersProvider.getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);

    // ✅ ask backend for role
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/auth/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: addr }),
    });

    if (res.ok) {
      const data = await res.json();
      setRole(data.role || 'vendor');
      localStorage.setItem('userRole', data.role || 'vendor');
    } else {
      setRole('vendor');
    }
  };

  const login = async () => {
    if (!web3auth) return;
    try {
      const web3authProvider = await web3auth.connect();
      if (!web3authProvider) throw new Error('No provider returned');
      await hydrateSession(web3authProvider);
    } catch (error) {
      console.error('❌ Login error:', error);
    }
  };

  const logout = async () => {
    if (!web3auth) return;
    try {
      await web3auth.logout();
      setProvider(null);
      setAddress(null);
      setRole('guest');
      localStorage.removeItem('userRole');
      console.log('✅ Logged out');
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
  };

  return (
    <Web3AuthContext.Provider value={{ web3auth, provider, address, role, login, logout }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

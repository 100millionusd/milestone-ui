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
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  address: null,
  login: async () => {},
  logout: async () => {},
});

// 🔑 Read from env, fallback to a safe public endpoint
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

  useEffect(() => {
    const init = async () => {
      try {
        if (!clientId) {
          console.error('🚨 Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }

        console.log('🚀 Initializing Web3Auth with Sepolia...');

        // 👇 Create the EVM private key provider
        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        const web3authInstance = new Web3Auth({
          clientId,
          web3AuthNetwork: 'sapphire_devnet',
          privateKeyProvider,
        });

        // 👇 Add Openlogin adapter for Google/social login
        const openloginAdapter = new OpenloginAdapter({
          adapterSettings: {
            uxMode: 'popup',
          },
        });
        web3authInstance.configureAdapter(openloginAdapter);

        await web3authInstance.initModal();
        console.log('✅ Web3Auth initialized');

        setWeb3auth(web3authInstance);

        if (web3authInstance.provider) {
          setProvider(web3authInstance.provider);
          const ethersProvider = new ethers.BrowserProvider(web3authInstance.provider);
          const signer = await ethersProvider.getSigner();
          setAddress(await signer.getAddress());
        }
      } catch (error) {
        console.error('❌ Web3Auth init error:', error);
      }
    };

    init();
  }, []);

  const login = async () => {
    if (!web3auth) return;
    try {
      console.log('🔑 Opening Web3Auth modal...');
      const web3authProvider = await web3auth.connect();
      if (!web3authProvider) {
        throw new Error('No provider returned from Web3Auth connect()');
      }

      setProvider(web3authProvider);

      const ethersProvider = new ethers.BrowserProvider(web3authProvider);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);

      console.log('✅ Logged in as:', addr);
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
      console.log('✅ Logged out');
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
  };

  return (
    <Web3AuthContext.Provider value={{ web3auth, provider, address, login, logout }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

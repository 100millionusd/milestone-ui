'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
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

const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;
const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC || '';

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
  // ... state setup omitted for brevity

  useEffect(() => {
    const init = async () => {
      if (!clientId) {
        console.error('🚨 Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
        return;
      }
      if (!rpcUrl) {
        console.error('🚨 Missing NEXT_PUBLIC_SEPOLIA_RPC');
        return;
      }

      console.log('🚀 Initializing Web3Auth...');

      const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });
      const web3authInstance = new Web3Auth({
        clientId,
        web3AuthNetwork: 'sapphire_devnet',
        privateKeyProvider,
      });

      await web3authInstance.initModal();
      // ... finish initialization
    };

    init();
  }, []);

  // ... login/logout logic omitted for brevity

  return (
    <Web3AuthContext.Provider value={{ /* ... values */ }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => useContext(Web3AuthContext);

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, SafeEventEmitterProvider } from '@web3auth/base';
import { OpenloginAdapter } from '@web3auth/openlogin-adapter';
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

// ---- Environment Variables ----
const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string;
const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC || 'https://rpc.ankr.com/eth_sepolia';
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0xaa36a7', // Sepolia
  rpcTarget: rpcUrl,
  displayName: 'Sepolia Testnet',
  blockExplorer: 'https://sepolia.etherscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum',
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

  // Restore session from localStorage
  useEffect(() => {
    try {
      setToken(localStorage.getItem('lx_jwt') || null);
      setRole(normalizeRole(localStorage.getItem('lx_role')));
      setAddress(localStorage.getItem('lx_addr'));
    } finally {
      setMounted(true);
    }
  }, []);

  // Initialize Web3Auth - FIXED VERSION
  useEffect(() => {
    const initWeb3Auth = async () => {
      try {
        if (!clientId) {
          console.error('❌ Missing NEXT_PUBLIC_WEB3AUTH_CLIENT_ID');
          return;
        }

        console.log('🔄 Initializing Web3Auth...');

        // Initialize Web3Auth core
        const web3authInstance = new Web3Auth({
          clientId,
          web3AuthNetwork: 'cyan', // Use 'cyan' for testnet instead of 'sapphire_devnet'
          chainConfig,
          uiConfig: {
            theme: 'dark',
            loginMethodsOrder: ['google', 'github', 'facebook', 'twitter'],
            appLogo: '/logo.png', // Make sure this file exists in your public folder
          },
          enableLogging: true, // Helpful for debugging
        });

        // Configure OpenLogin Adapter - FIXED
        const openloginAdapter = new OpenloginAdapter({
          adapterSettings: {
            network: 'cyan', // Must match web3AuthNetwork
            clientId,
            uxMode: 'popup',
            whiteLabel: {
              name: "Milestone App",
              logoLight: "https://your-app.com/logo-light.png",
              logoDark: "https://your-app.com/logo-dark.png",
              defaultLanguage: "en",
              dark: true,
            },
          },
        });

        // Configure MetaMask Adapter
        const metamaskAdapter = new MetamaskAdapter({
          clientId,
          sessionTime: 3600,
          web3AuthNetwork: 'cyan',
          chainConfig,
        });

        // Configure WalletConnect Adapter
        let walletConnectAdapter: WalletConnectV2Adapter | null = null;
        if (wcProjectId) {
          walletConnectAdapter = new WalletConnectV2Adapter({
            clientId,
            sessionTime: 3600,
            web3AuthNetwork: 'cyan',
            chainConfig,
            adapterSettings: {
              projectId: wcProjectId,
              qrcodeModalOptions: {
                themeMode: 'dark',
              },
            },
          });
        }

        // Configure all adapters
        web3authInstance.configureAdapter(openloginAdapter);
        web3authInstance.configureAdapter(metamaskAdapter);
        if (walletConnectAdapter) {
          web3authInstance.configureAdapter(walletConnectAdapter);
        }

        console.log('🔄 Initializing Web3Auth modal...');
        await web3authInstance.initModal();
        
        setWeb3auth(web3authInstance);
        console.log('✅ Web3Auth initialized successfully');

        // Check if user is already connected
        if (web3authInstance.connected && web3authInstance.provider) {
          console.log('🔄 User already connected, setting provider...');
          setProvider(web3authInstance.provider);
          try {
            const ethersProvider = new ethers.BrowserProvider(web3authInstance.provider as any);
            const signer = await ethersProvider.getSigner();
            const addr = await signer.getAddress();
            setAddress(addr);
            localStorage.setItem('lx_addr', addr);
            console.log('✅ Connected address:', addr);
          } catch (error) {
            console.error('❌ Error getting address:', error);
          }
        }
      } catch (error) {
        console.error('❌ Web3Auth initialization error:', error);
      }
    };

    initWeb3Auth();
  }, []);

  // Refresh role from server
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
      console.warn('⚠️ refreshRole failed:', e);
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
  }, [mounted]);

  // Login function
  const login = async () => {
    if (!web3auth) {
      console.error('❌ Web3Auth not initialized');
      return;
    }

    try {
      console.log('🔄 Starting login process...');
      
      // Connect via Web3Auth modal
      const web3authProvider = await web3auth.connect();
      if (!web3authProvider) {
        throw new Error('No provider returned from Web3Auth');
      }

      setProvider(web3authProvider);
      console.log('✅ Web3Auth connected');

      // Get address from provider
      const ethersProvider = new ethers.BrowserProvider(web3authProvider as any);
      const signer = await ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      localStorage.setItem('lx_addr', addr);
      console.log('✅ Address obtained:', addr);

      // Get nonce from server
      console.log('🔄 Getting nonce from server...');
      const nonceRes = await fetch(`${API_BASE}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: addr }),
      });
      
      if (!nonceRes.ok) throw new Error('Failed to get nonce');
      const { nonce } = await nonceRes.json();
      console.log('✅ Nonce received');

      // Sign the nonce
      console.log('🔄 Signing nonce...');
      const signature = await signer.signMessage(nonce);
      console.log('✅ Nonce signed');

      // Verify signature with server
      console.log('🔄 Verifying signature with server...');
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: addr, signature }),
      });
      
      if (!verifyRes.ok) throw new Error('Auth verification failed');

      const { role: srvRole } = await verifyRes.json();
      const normRole = normalizeRole(srvRole);

      // Update local state
      setToken(null);
      localStorage.removeItem('lx_jwt');
      setRole(normRole);
      localStorage.setItem('lx_role', normRole);

      console.log('✅ Authentication successful, role:', normRole);

      await refreshRole();
      await postLoginProfileRedirect();

    } catch (error) {
      console.error('❌ Login error:', error);
      // Clear state on error
      setProvider(null);
      setAddress(null);
      localStorage.removeItem('lx_addr');
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await web3auth?.logout();
      console.log('✅ Web3Auth logout successful');
    } catch (error) {
      console.error('❌ Web3Auth logout error:', error);
    }
    
    try {
      await fetch(`${API_BASE}/auth/logout`, { 
        method: 'POST', 
        credentials: 'include' 
      });
      console.log('✅ Server logout successful');
    } catch (error) {
      console.error('❌ Server logout error:', error);
    }

    // Clear local state
    setProvider(null);
    setAddress(null);
    setToken(null);
    setRole('guest');
    localStorage.removeItem('lx_addr');
    localStorage.removeItem('lx_jwt');
    localStorage.removeItem('lx_role');

    console.log('✅ Local state cleared');

    try { 
      router.replace('/'); 
    } catch (error) {
      console.error('❌ Router redirect error:', error);
    }
  };

  // Handle account/chain changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const eth = (window as any).ethereum;
    if (!eth?.on) return;

    const onAccountsChanged = async (accounts: string[]) => {
      console.log('🔄 Accounts changed:', accounts);
      if (accounts.length === 0) {
        // User disconnected all accounts
        await logout();
      } else {
        // Account changed - reauthenticate
        try {
          await logout();
          window.location.href = '/vendor/login';
        } catch (error) {
          console.error('❌ Account change handling error:', error);
        }
      }
    };

    const onChainChanged = () => {
      console.log('🔄 Chain changed, reloading...');
      window.location.reload();
    };

    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);

    return () => {
      try {
        eth.removeListener?.('accountsChanged', onAccountsChanged);
        eth.removeListener?.('chainChanged', onChainChanged);
      } catch (error) {
        console.error('❌ Error removing listeners:', error);
      }
    };
  }, []);

  if (!mounted) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  return (
    <Web3AuthContext.Provider value={{ 
      web3auth, 
      provider, 
      address, 
      role, 
      token, 
      login, 
      logout, 
      refreshRole 
    }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export const useWeb3Auth = () => {
  const context = useContext(Web3AuthContext);
  if (!context) {
    throw new Error('useWeb3Auth must be used within Web3AuthProvider');
  }
  return context;
};
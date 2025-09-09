'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBids } from '@/lib/api';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { ethers } from 'ethers';
import SendFunds from '@/components/SendFunds';

// ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Sepolia token addresses
const TOKENS: Record<string, string> = {
  USDT: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

export default function VendorDashboard() {
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<{ETH?: string; USDT?: string; USDC?: string}>({});
  const { address, logout, provider } = useWeb3Auth();
  const router = useRouter();

  useEffect(() => {
    if (!address) {
      router.push('/vendor/login');
      return;
    }
    loadBids();
    loadBalances();
  }, [address]);

  const loadBids = async () => {
    try {
      const allBids = await getBids();
      const vendorBids = allBids
        .filter((bid) => bid.walletAddress.toLowerCase() === address?.toLowerCase())
        .map((bid) => ({
          ...bid,
          proofs: bid.proofs || []
        }));

      setBids(vendorBids);
    } catch (error) {
      console.error('Error loading bids:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBalances = async () => {
    if (!address) return;
    try {
      let ethersProvider: ethers.Provider;

      if (provider) {
        ethersProvider = new ethers.BrowserProvider(provider as any);
      } else {
        ethersProvider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth_sepolia');
      }

      // ETH balance
      const rawBalance = await ethersProvider.getBalance(address);
      const ethBal = ethers.formatEther(rawBalance);

      // ERC20 balances
      const results: any = { ETH: ethBal };
      for (const [symbol, tokenAddr] of Object.entries(TOKENS)) {
        try {
          const contract = new ethers.Contract(tokenAddr, ERC20_ABI, ethersProvider);
          const [raw, decimals] = await Promise.all([
            contract.balanceOf(address),
            contract.decimals()
          ]);
          results[symbol] = ethers.formatUnits(raw, decimals);
        } catch (err) {
          console.error(`Error fetching ${symbol} balance:`, err);
        }
      }

      setBalances(results);
    } catch (err) {
      console.error('Error fetching balances:', err);
      setBalances({});
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/vendor/login');
  };

  const getBidStatus = (bid: any) => {
    if (bid.status === 'completed') return 'Completed';
    if (bid.status === 'approved') {
      const completed = bid.milestones.filter((m: any) => m.completed).length;
      const total = bid.milestones.length;
      return `In Progress (${completed}/${total} milestones)`;
    }
    return bid.status.charAt(0).toUpperCase() + bid.status.slice(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading your bids...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold mb-2">Vendor Dashboard</h1>
              <p className="text-gray-600">Wallet: {address}</p>
              {balances.ETH && <p>ETH: {balances.ETH}</p>}
              {balances.USDT && <p>USDT: {balances.USDT}</p>}
              {balances.USDC && <p>USDC: {balances.USDC}</p>}
            </div>
            <button
              onClick={handleLogout}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Send Funds UI */}
        <SendFunds />

        {/* Bid List */}
        <div className="grid gap-6 mt-6">
          {bids.map((bid) => (
            <div key={bid.bidId} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold">{bid.title}</h2>
                  <p className="text-gray-600">Bid ID: {bid.bidId}</p>
                  <p className="text-gray-600">Organization: {bid.orgName}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    bid.status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : bid.status === 'completed'
                      ? 'bg-blue-100 text-blue-800'
                      : bid.status === 'rejected'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {getBidStatus(bid)}
                </span>
              </div>

              {/* … rest of your bid details unchanged … */}
            </div>
          ))}

          {bids.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 text-center">
              <div className="text-4xl mb-4">💼</div>
              <h2 className="text-xl font-semibold mb-2">No Bids Yet</h2>
              <p className="text-gray-600 mb-4">
                You haven't submitted any bids yet.
              </p>
              <Link
                href="/projects"
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
              >
                Browse Projects
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

// ---- ERC20 minimal ABI ----
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

// ---- Sepolia stablecoins ----
const TOKENS: Record<string, string> = {
  USDT: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", // Sepolia USDT
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
};

export default function SendFunds() {
  const { provider, address } = useWeb3Auth();
  const [token, setToken] = useState<'USDT' | 'USDC'>('USDT');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!provider) {
      return alert("Please login with Web3Auth first");
    }
    if (!ethers.isAddress(to)) {
      return alert("Invalid recipient address");
    }

    try {
      setLoading(true);
      setStatus("Preparing transaction...");

      const ethersProvider = new ethers.BrowserProvider(provider as any);
      const signer = await ethersProvider.getSigner();

      const tokenAddress = TOKENS[token];
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      const decimals = await contract.decimals();
      const value = ethers.parseUnits(amount, decimals);

      const tx = await contract.transfer(to, value);
      setStatus(`Sending... TX: ${tx.hash}`);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        setStatus(`✅ Sent ${amount} ${token} to ${to}. Tx: ${tx.hash}`);
      } else {
        setStatus("❌ Transaction failed.");
      }
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white shadow p-6 rounded-lg mt-6">
      <h2 className="text-lg font-semibold mb-4">Send Funds</h2>

      <p className="text-sm text-gray-600 mb-3">
        Logged in as: <span className="font-mono">{address || "Not connected"}</span>
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Token</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={token}
            onChange={(e) => setToken(e.target.value as 'USDT' | 'USDC')}
          >
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Recipient Address</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x..."
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Amount</label>
          <input
            type="number"
            step="0.000001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.5"
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded w-full"
        >
          {loading ? "Sending..." : "Send"}
        </button>
      </div>

      {status && (
        <p className="mt-4 text-sm text-gray-700 break-words">{status}</p>
      )}
    </div>
  );
}

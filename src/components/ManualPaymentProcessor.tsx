// src/components/ManualPaymentProcessor.tsx
'use client';

import React, { useState } from 'react';
import { sendTokens } from '@/lib/api';

interface ManualPaymentProcessorProps {
  bid: any;
  onPaymentComplete: () => void;
}

const ManualPaymentProcessor: React.FC<ManualPaymentProcessorProps> = ({ bid, onPaymentComplete }) => {
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState(bid.walletAddress || '');
  const [token, setToken] = useState(bid.preferredStablecoin || 'USDT');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const paymentResult = await sendTokens(toAddress, parseFloat(amount), token as 'USDC' | 'USDT');
      setResult(paymentResult);
      
      if (paymentResult.success) {
        setAmount('');
        onPaymentComplete();
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send payment'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg border mt-6">
      <h3 className="font-semibold text-lg mb-3">💸 Manual Payment Processor</h3>
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Recipient Address</label>
          <input
            type="text"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder="0x..."
            className="w-full p-2 border rounded"
            required
          />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
              step="0.01"
              min="0"
              className="w-full p-2 border rounded"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Token</label>
            <select
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
            </select>
          </div>
        </div>
        
        <button
          type="submit"
          disabled={loading || !amount || !toAddress}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Send Payment'}
        </button>
      </form>

      {result && (
        <div className={`mt-4 p-3 rounded ${
          result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {result.success ? (
            <div>
              <p className="font-semibold">✅ Payment Successful!</p>
              <p>Transaction: {result.transactionHash}</p>
              <p>Amount: {result.amount} {result.currency}</p>
              <p>To: {result.toAddress}</p>
            </div>
          ) : (
            <div>
              <p className="font-semibold">❌ Payment Failed</p>
              <p>{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ManualPaymentProcessor;
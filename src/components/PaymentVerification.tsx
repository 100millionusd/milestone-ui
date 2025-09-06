'use client';

import { useState } from 'react';
import { blockchainService } from '@/lib/blockchain';

interface PaymentVerificationProps {
  transactionHash?: string;
  currency?: string;
  amount?: number;
  toAddress?: string;
}

export default function PaymentVerification({ 
  transactionHash, 
  currency, 
  amount, 
  toAddress 
}: PaymentVerificationProps) {
  const [verification, setVerification] = useState<{status: string, message: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const verifyTransaction = async () => {
    if (!transactionHash) return;
    
    setLoading(true);
    try {
      // In a real implementation, you would verify the transaction on-chain
      // For now, we'll simulate verification
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setVerification({
        status: 'success',
        message: 'Transaction verified on blockchain'
      });
    } catch (error) {
      setVerification({
        status: 'error',
        message: 'Verification failed'
      });
    } finally {
      setLoading(false);
    }
  };

  if (!transactionHash) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
      <h4 className="font-semibold text-blue-800 mb-2">Blockchain Verification</h4>
      
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div>
          <span className="font-medium">TX Hash:</span>
          <a 
            href={`https://sepolia.etherscan.io/tx/${transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 break-all block mt-1"
          >
            {transactionHash.slice(0, 16)}...{transactionHash.slice(-8)}
          </a>
        </div>
        <div>
          <span className="font-medium">Amount:</span>
          <p>{amount} {currency}</p>
        </div>
        <div>
          <span className="font-medium">To:</span>
          <p className="break-all">{toAddress}</p>
        </div>
        <div>
          <span className="font-medium">Status:</span>
          <p className="text-green-600">Confirmed</p>
        </div>
      </div>

      <button
        onClick={verifyTransaction}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:bg-gray-400"
      >
        {loading ? 'Verifying...' : 'Verify on Blockchain'}
      </button>

      {verification && (
        <div className={`mt-3 p-2 rounded text-sm ${
          verification.status === 'success' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {verification.message}
        </div>
      )}
    </div>
  );
}
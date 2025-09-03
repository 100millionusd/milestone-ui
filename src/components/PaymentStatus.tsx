// src/components/PaymentStatus.tsx
'use client';

import { useState, useEffect } from 'react';
import { getPaymentHistory, type Milestone } from '@/lib/api';

interface PaymentStatusProps {
  bidId: number;
}

export default function PaymentStatus({ bidId }: PaymentStatusProps) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPaymentHistory();
  }, [bidId]);

  const loadPaymentHistory = async () => {
    try {
      const paymentHistory = await getPaymentHistory(bidId);
      setPayments(paymentHistory);
    } catch (error) {
      console.error('Error loading payment history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">Payment Status</h3>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-lg font-semibold mb-4">Payment Status</h3>
      
      {payments.length === 0 ? (
        <p className="text-gray-500">No payments processed yet.</p>
      ) : (
        <div className="space-y-4">
          {payments.map((payment, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-medium">{payment.milestone.name}</h4>
                  <p className="text-sm text-gray-600">
                    Amount: ${payment.milestone.amount.toLocaleString()} USDT
                  </p>
                  {payment.milestone.completionDate && (
                    <p className="text-sm text-gray-600">
                      Completed: {new Date(payment.milestone.completionDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs ${
                    payment.paymentTxHash ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {payment.paymentTxHash ? 'Paid' : 'Pending Payment'}
                  </span>
                </div>
              </div>

              {payment.paymentTxHash && (
                <div className="mt-2 p-2 bg-gray-50 rounded">
                  <p className="text-sm font-medium">Transaction Hash:</p>
                  <p className="text-sm font-mono text-blue-600 break-all">
                    {payment.paymentTxHash}
                  </p>
                  {payment.paymentDate && (
                    <p className="text-xs text-gray-500 mt-1">
                      Paid on: {new Date(payment.paymentDate).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {payment.milestone.proof && !payment.paymentTxHash && (
                <div className="mt-2 p-2 bg-yellow-50 rounded">
                  <p className="text-sm text-yellow-800">
                    ✅ Proof submitted. Waiting for payment processing.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
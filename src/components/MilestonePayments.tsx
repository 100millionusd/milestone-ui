// src/components/MilestonePayments.tsx
'use client';

import React, { useState } from 'react';
// FIXED IMPORT: Use correct functions
import { completeMilestone, payMilestone, type Bid, type Milestone } from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
}

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate }) => {
  const [completingIndex, setCompletingIndex] = useState<number | null>(null);
  const [proof, setProof] = useState('');
  const [paymentResult, setPaymentResult] = useState<any>(null);

  const handleCompleteMilestone = async (index: number) => {
    try {
      setCompletingIndex(index);
      
      // FIXED: Use completeMilestone for proof submission
      await completeMilestone(bid.bidId, index, proof);
      
      setProof('');
      alert('Proof submitted successfully! Admin will review and release payment.');
      
      onUpdate(); // Refresh the data
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to submit proof');
    } finally {
      setCompletingIndex(null);
    }
  };

  const handleReleasePayment = async (index: number) => {
    try {
      setCompletingIndex(index);
      
      // FIXED: Use payMilestone for payment release
      const result = await payMilestone(bid.bidId, index);
      
      setPaymentResult(result);
      alert('Payment released successfully!');
      
      onUpdate(); // Refresh the data
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to release payment');
    } finally {
      setCompletingIndex(null);
    }
  };

  const totalAmount = bid.milestones.reduce((sum, m) => sum + m.amount, 0);
  const completedAmount = bid.milestones
    .filter(m => m.completed)
    .reduce((sum, m) => sum + m.amount, 0);

  const paidAmount = bid.milestones
    .filter(m => m.paymentTxHash)
    .reduce((sum, m) => sum + m.amount, 0);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold mb-4">💰 Milestone Payments</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded border">
          <p className="text-sm text-blue-600">Total Contract Value</p>
          <p className="text-2xl font-bold">${totalAmount.toLocaleString()}</p>
          <p className="text-sm">{bid.preferredStablecoin}</p>
        </div>
        <div className="bg-green-50 p-4 rounded border">
          <p className="text-sm text-green-600">Completed Work</p>
          <p className="text-2xl font-bold">${completedAmount.toLocaleString()}</p>
          <p className="text-sm">
            {bid.milestones.filter(m => m.completed).length}/{bid.milestones.length} milestones
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded border">
          <p className="text-sm text-purple-600">Amount Paid</p>
          <p className="text-2xl font-bold">${paidAmount.toLocaleString()}</p>
          <p className="text-sm">
            {bid.milestones.filter(m => m.paymentTxHash).length} payments
          </p>
        </div>
      </div>

      <div className="mb-4 p-3 bg-gray-50 rounded">
        <p className="font-medium text-gray-600">Vendor Wallet Address</p>
        <p className="font-mono text-sm bg-white p-2 rounded mt-1 border">{bid.walletAddress}</p>
        <p className="text-xs text-gray-500 mt-1">
          Payments are sent to this {bid.preferredStablecoin} address
        </p>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold">Payment Milestones:</h4>
        {bid.milestones.map((milestone, index) => (
          <div key={index} className={`border rounded p-4 ${
            milestone.completed ? 
              milestone.paymentTxHash ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
              : 'bg-gray-50'
          }`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-medium">{milestone.name}</p>
                <p className="text-sm text-gray-600">
                  Due: {new Date(milestone.dueDate).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-green-600">
                  ${milestone.amount.toLocaleString()}
                </p>
                <span className={`px-2 py-1 rounded text-xs ${
                  milestone.paymentTxHash ? 'bg-green-100 text-green-800' :
                  milestone.completed ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {milestone.paymentTxHash ? 'Paid' : 
                   milestone.completed ? 'Completed (Unpaid)' : 'Pending'}
                </span>
              </div>
            </div>

            {milestone.paymentTxHash ? (
              <div className="mt-2">
                <div className="p-2 bg-white rounded border">
                  <p className="text-sm text-green-600">
                    ✅ Paid on {milestone.paymentDate ? new Date(milestone.paymentDate).toLocaleDateString() : 'Unknown date'}
                  </p>
                  <p className="text-sm mt-1">
                    <span className="font-medium">TX Hash:</span>{' '}
                    <span className="font-mono text-blue-600">{milestone.paymentTxHash}</span>
                  </p>
                  {milestone.proof && (
                    <p className="text-sm mt-1">
                      <span className="font-medium">Proof:</span> {milestone.proof}
                    </p>
                  )}
                </div>
                
                {/* Payment Verification Component */}
                <PaymentVerification
                  transactionHash={milestone.paymentTxHash}
                  currency={bid.preferredStablecoin}
                  amount={milestone.amount}
                  toAddress={bid.walletAddress}
                />
              </div>
            ) : milestone.completed ? (
              <div className="mt-2 p-2 bg-yellow-50 rounded border">
                <p className="text-sm text-yellow-700">
                  ✅ Completed on {milestone.completionDate ? new Date(milestone.completionDate).toLocaleDateString() : 'Unknown date'}
                </p>
                {milestone.proof && (
                  <p className="text-sm mt-1">
                    <span className="font-medium">Proof:</span> {milestone.proof}
                  </p>
                )}
                <p className="text-sm text-yellow-700 mt-1">
                  Waiting for payment processing...
                </p>
                {/* ADD PAYMENT RELEASE BUTTON FOR ADMINS */}
                <button
                  onClick={() => handleReleasePayment(index)}
                  disabled={completingIndex === index}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm mt-2 disabled:bg-gray-400"
                >
                  {completingIndex === index ? 'Processing...' : 'Release Payment'}
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">
                  Proof of Completion (Required for payment)
                </label>
                <textarea
                  placeholder="Enter proof of work completion (IPFS hash, document reference, GitHub commit, etc.)"
                  value={proof}
                  onChange={(e) => setProof(e.target.value)}
                  className="w-full p-2 border rounded text-sm mb-2"
                  rows={3}
                />
                <button
                  onClick={() => handleCompleteMilestone(index)}
                  disabled={completingIndex === index || !proof.trim()}
                  className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {completingIndex === index ? 'Submitting Proof...' : 'Submit Proof'}
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  Submit proof of work for admin review and payment approval
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Manual Payment Processor */}
      <ManualPaymentProcessor bid={bid} onPaymentComplete={onUpdate} />

      {paidAmount === totalAmount && (
        <div className="mt-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="font-semibold">✅ Project Completed and Fully Paid!</p>
          <p>All milestones have been completed and paid. Total: ${totalAmount.toLocaleString()} {bid.preferredStablecoin}</p>
        </div>
      )}
    </div>
  );
};

export default MilestonePayments;
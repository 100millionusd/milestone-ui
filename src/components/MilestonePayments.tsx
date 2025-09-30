// src/components/MilestonePayments.tsx
'use client';

import React, { useState } from 'react';
import {
  submitProof,
  completeMilestone,
  payMilestone,
  type Bid,
  type Milestone,
} from '@/lib/api';
import { uploadProofFiles } from '@/lib/proofUpload';  // ✅ correct source
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  proposalId?: number; // optional; we’ll derive if not given
}

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [completingIndex, setCompletingIndex] = useState<number | null>(null);
  const [proof, setProof] = useState(''); // legacy text proof
  const [paymentResult, setPaymentResult] = useState<any>(null);

  // Keep selected files per milestone index
  const [pendingFiles, setPendingFiles] = useState<Record<number, File[]>>({});

  const deriveProposalId = () => {
    if (Number.isFinite(proposalId as number)) return Number(proposalId);
    const fromBid = (bid as any)?.proposalId ?? (bid as any)?.proposalID ?? (bid as any)?.proposal_id;
    if (Number.isFinite(fromBid)) return Number(fromBid);
    if (typeof window !== 'undefined') {
      const parts = location.pathname.split('/').filter(Boolean);
      const maybe = Number(parts[parts.length - 1]);
      if (Number.isFinite(maybe)) return maybe;
    }
    return undefined;
  };

  const handleFileChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles((m) => ({ ...m, [index]: files }));
  };

  const handleCompleteMilestone = async (index: number) => {
    try {
      setCompletingIndex(index);

      const pid = deriveProposalId();
      if (!Number.isFinite(pid)) {
        throw new Error('Missing proposalId; cannot attach proof files');
      }

      const files = pendingFiles[index] || [];

      // 1) If vendor selected files, upload them to Pinata via our API
      let uploaded: Array<{ cid: string; url: string; name: string }> = [];
      if (files.length > 0) {
        uploaded = await uploadProofFiles(files);
      }

      // 2) Save proof record so Project/Files can show the assets automatically
      //    (always send note + files; files array may be empty if user submitted only text)
      await submitProof({
        bidId: bid.bidId,
        proposalId: Number(pid),
        milestoneIndex: index, // ZERO-BASED (M1=0)
        note: proof || '',
        files: uploaded.map(u => ({ url: u.url, name: u.name })),
      });

      // 3) Keep legacy path so your existing backend status stays in sync
      await completeMilestone(bid.bidId, index, proof || '');

      // done
      setProof('');
      setPendingFiles((m) => ({ ...m, [index]: [] }));
      alert('Proof submitted! Files are saved and will appear under Project → Files.');
      onUpdate();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Failed to submit proof');
    } finally {
      setCompletingIndex(null);
    }
  };

  const handleReleasePayment = async (index: number) => {
    try {
      setCompletingIndex(index);
      const result = await payMilestone(bid.bidId, index);
      setPaymentResult(result);
      alert('Payment released successfully!');
      onUpdate();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Failed to release payment');
    } finally {
      setCompletingIndex(null);
    }
  };

  const totalAmount = bid.milestones.reduce((sum, m) => sum + m.amount, 0);
  const completedAmount = bid.milestones.filter(m => m.completed).reduce((s, m) => s + m.amount, 0);
  const paidAmount = bid.milestones.filter(m => m.paymentTxHash).reduce((s, m) => s + m.amount, 0);

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
        {bid.milestones.map((milestone: Milestone, index: number) => {
          const files = pendingFiles[index] || [];
          return (
            <div
              key={index}
              className={`border rounded p-4 ${
                milestone.completed
                  ? milestone.paymentTxHash
                    ? 'bg-green-50 border-green-200'
                    : 'bg-yellow-50 border-yellow-200'
                  : 'bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium">{milestone.name}</p>
                  <p className="text-sm text-gray-600">
                    {milestone.dueDate ? `Due: ${new Date(milestone.dueDate).toLocaleDateString()}` : 'No due date'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-600">
                    ${milestone.amount.toLocaleString()}
                  </p>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      milestone.paymentTxHash
                        ? 'bg-green-100 text-green-800'
                        : milestone.completed
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {milestone.paymentTxHash
                      ? 'Paid'
                      : milestone.completed
                      ? 'Completed (Unpaid)'
                      : 'Pending'}
                  </span>
                </div>
              </div>

              {/* ✅ New: file picker for this milestone */}
              {!milestone.completed && (
                <div className="mt-2">
                  <label className="block text-sm font-medium mb-1">
                    Attach proof files (images/PDFs)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(e) => handleFileChange(index, e)}
                    className="block w-full text-sm"
                  />
                  {files.length > 0 && (
                    <ul className="mt-1 text-xs text-gray-600 list-disc pl-5">
                      {files.map((f, i) => <li key={i}>{(f as any).name}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {milestone.paymentTxHash ? (
                <div className="mt-2">
                  <div className="p-2 bg-white rounded border">
                    <p className="text-sm text-green-600">
                      ✅ Paid
                      {milestone.paymentDate
                        ? ` on ${new Date(milestone.paymentDate).toLocaleDateString()}`
                        : ''}
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
                    ✅ Completed
                    {milestone.completionDate
                      ? ` on ${new Date(milestone.completionDate).toLocaleDateString()}`
                      : ''}
                  </p>
                  {milestone.proof && (
                    <p className="text-sm mt-1">
                      <span className="font-medium">Proof:</span> {milestone.proof}
                    </p>
                  )}
                  <p className="text-sm text-yellow-700 mt-1">Waiting for payment processing...</p>
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
                    Proof notes (optional)
                  </label>
                  <textarea
                    placeholder="Add any text note (optional; files are preferred)"
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                    className="w-full p-2 border rounded text-sm mb-2"
                    rows={3}
                  />
                  <button
                    onClick={() => handleCompleteMilestone(index)}
                    disabled={completingIndex === index}
                    className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {completingIndex === index ? 'Submitting Proof...' : 'Submit Proof'}
                  </button>
                  <p className="text-xs text-gray-500 mt-1">
                    Selected files will be uploaded to Pinata and attached automatically.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ManualPaymentProcessor bid={bid} onPaymentComplete={onUpdate} />

      {paidAmount === totalAmount && (
        <div className="mt-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="font-semibold">✅ Project Completed and Fully Paid!</p>
          <p>
            All milestones have been completed and paid. Total: ${totalAmount.toLocaleString()} {bid.preferredStablecoin}
          </p>
        </div>
      )}
    </div>
  );
};

export default MilestonePayments;

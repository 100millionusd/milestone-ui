// src/components/MilestonePayments.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  submitProof,
  completeMilestone,
  payMilestone,
  type Bid,
  type Milestone,
} from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  /** Optional: if parent can pass it. Otherwise we'll derive from bid or URL */
  proposalId?: number;
}

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({
  bid,
  onUpdate,
  proposalId,
}) => {
  const [completingIndex, setCompletingIndex] = useState<number | null>(null);
  const [proof, setProof] = useState(''); // legacy text proof
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [paymentResult, setPaymentResult] = useState<any>(null);

  const derivedProposalId = useMemo(() => {
    if (Number.isFinite(proposalId as number)) return Number(proposalId);
    const fromBid =
      (bid as any)?.proposalId ??
      (bid as any)?.proposalID ??
      (bid as any)?.proposal_id;
    if (Number.isFinite(fromBid)) return Number(fromBid);
    if (typeof window !== 'undefined') {
      const parts = location.pathname.split('/').filter(Boolean);
      const maybeId = Number(parts[parts.length - 1]);
      if (Number.isFinite(maybeId)) return maybeId;
    }
    return undefined;
  }, [proposalId, bid]);

  const totalAmount = bid.milestones.reduce((sum, m) => sum + m.amount, 0);
  const completedAmount = bid.milestones
    .filter((m) => m.completed)
    .reduce((sum, m) => sum + m.amount, 0);
  const paidAmount = bid.milestones
    .filter((m) => m.paymentTxHash)
    .reduce((sum, m) => sum + m.amount, 0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
  };

  const uploadFilesToPinata = async (): Promise<
    { url: string; name?: string }[]
  > => {
    if (!selectedFiles.length) return [];
    const fd = new FormData();
    for (const f of selectedFiles) fd.append('files', f, f.name || 'file');
    const res = await fetch('/api/proofs/upload', {
      method: 'POST',
      body: fd,
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `Upload failed (${res.status}). ${txt.slice(0, 200) || ''}`
      );
    }
    const json = (await res.json()) as {
      uploaded: { cid: string; url: string; name?: string }[];
    };
    return (json.uploaded || []).map((u) => ({ url: u.url, name: u.name }));
  };

  const handleCompleteMilestone = async (index: number) => {
    try {
      setCompletingIndex(index);

      // 1) If files selected, upload them to Pinata via our server route
      let files: { url: string; name?: string }[] = [];
      if (selectedFiles.length > 0) {
        files = await uploadFilesToPinata();
      }

      // 2) Save into /api/proofs so they show up in Project → Files automatically
      if (files.length > 0 && Number.isFinite(derivedProposalId)) {
        await submitProof({
          bidId: bid.bidId,
          proposalId: derivedProposalId as number,
          milestoneIndex: index, // ZERO-BASED (M1=0, M2=1, …)
          note: 'vendor proof',
          files,
        });
      }

      // 3) Keep legacy path so nothing else breaks (admin review/payment flow)
      await completeMilestone(
        bid.bidId,
        index,
        proof || (files.length ? 'files uploaded' : '')
      );

      setProof('');
      setSelectedFiles([]);
      alert('Proof submitted successfully! Admin will review and release payment.');
      onUpdate();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to submit proof');
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
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to release payment');
    } finally {
      setCompletingIndex(null);
    }
  };

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
            {bid.milestones.filter((m) => m.completed).length}/
            {bid.milestones.length} milestones
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded border">
          <p className="text-sm text-purple-600">Amount Paid</p>
          <p className="text-2xl font-bold">${paidAmount.toLocaleString()}</p>
          <p className="text-sm">
            {bid.milestones.filter((m) => m.paymentTxHash).length} payments
          </p>
        </div>
      </div>

      <div className="mb-4 p-3 bg-gray-50 rounded">
        <p className="font-medium text-gray-600">Vendor Wallet Address</p>
        <p className="font-mono text-sm bg-white p-2 rounded mt-1 border">
          {bid.walletAddress}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Payments are sent to this {bid.preferredStablecoin} address
        </p>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold">Payment Milestones:</h4>
        {bid.milestones.map((milestone: Milestone, index: number) => (
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
                  {milestone.dueDate
                    ? `Due: ${new Date(milestone.dueDate).toLocaleDateString()}`
                    : 'No due date'}
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
                    <span className="font-mono text-blue-600">
                      {milestone.paymentTxHash}
                    </span>
                  </p>
                  {milestone.proof && (
                    <p className="text-sm mt-1">
                      <span className="font-medium">Proof:</span>{' '}
                      {milestone.proof}
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
                    <span className="font-medium">Proof:</span>{' '}
                    {milestone.proof}
                  </p>
                )}
                <p className="text-sm text-yellow-700 mt-1">
                  Waiting for payment processing...
                </p>
                <button
                  onClick={() => handleReleasePayment(index)}
                  disabled={completingIndex === index}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm mt-2 disabled:bg-gray-400"
                >
                  {completingIndex === index ? 'Processing...' : 'Release Payment'}
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {/* NEW: file input for vendor proofs */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Attach proof files (images / PDFs)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:bg-white"
                  />
                  {!!selectedFiles.length && (
                    <div className="text-xs text-gray-600 mt-1">
                      {selectedFiles.length} file
                      {selectedFiles.length > 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>

                {/* keep legacy text proof for compatibility */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Proof details (optional if files attached)
                  </label>
                  <textarea
                    placeholder="Notes, reference, or legacy proof text"
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                    rows={3}
                  />
                </div>

                <button
                  onClick={() => handleCompleteMilestone(index)}
                  disabled={completingIndex === index}
                  className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {completingIndex === index
                    ? 'Submitting Proof...'
                    : 'Submit Proof'}
                </button>
                <p className="text-xs text-gray-500">
                  Files are uploaded to Pinata, stored with this milestone,
                  and appear in the project’s Files tab immediately.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <ManualPaymentProcessor bid={bid} onPaymentComplete={onUpdate} />

      {paidAmount === totalAmount && (
        <div className="mt-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="font-semibold">✅ Project Completed and Fully Paid!</p>
          <p>
            All milestones have been completed and paid. Total: $
            {totalAmount.toLocaleString()} {bid.preferredStablecoin}
          </p>
        </div>
      )}
    </div>
  );
};

export default MilestonePayments;

// src/components/MilestonePayments.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  submitProof,            // saves URLs to /api/proofs (DB record the Files tab reads)
  completeMilestone,      // your existing backend call (can take FormData or JSON)
  payMilestone,           // unchanged
  type Bid,
  type Milestone,
} from '@/lib/api';
import { uploadProofFiles } from '@/lib/proofUpload'; // ✅ new helper (client → /api/proofs/upload → Pinata)
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  /** Optional: parent can pass proposalId; otherwise we'll derive from bid or URL */
  proposalId?: number;
}

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [proofText, setProofText] = useState('');                         // legacy text proof (kept)
  const [filesByIndex, setFilesByIndex] = useState<Record<number, File[]>>({}); // new: files chosen per milestone
  const [paymentResult, setPaymentResult] = useState<any>(null);

  // Robust proposalId discovery (no backend change)
  const derivedProposalId = useMemo(() => {
    if (Number.isFinite(proposalId as number)) return Number(proposalId);
    const fromBid =
      (bid as any)?.proposalId ??
      (bid as any)?.proposalID ??
      (bid as any)?.proposal_id;
    if (Number.isFinite(fromBid)) return Number(fromBid);
    if (typeof window !== 'undefined') {
      const parts = location.pathname.split('/').filter(Boolean);
      const maybe = Number(parts[parts.length - 1]);
      if (Number.isFinite(maybe)) return maybe;
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

  // --- New: choose files per milestone
  const onChooseFiles = (idx: number, list: FileList | null) => {
    const arr = list ? Array.from(list) : [];
    setFilesByIndex((m) => ({ ...m, [idx]: arr }));
  };

  // --- Submit proof (images + text) for a milestone
  const handleCompleteMilestone = async (index: number) => {
    const files = filesByIndex[index] || [];
    setBusyIndex(index);
    try {
      // 1) Upload images to Pinata first (so project page Files tab can show immediately)
      let uploaded: Array<{ url: string; name: string }> = [];
      if (files.length > 0) {
        const up = await uploadProofFiles(files); // [{ cid, url, name }]
        uploaded = up.map((u) => ({ url: u.url, name: u.name || (u.url.split('/').pop() || 'file') }));
      }

      // 2) Persist a proof record with those URLs (what /projects/[id] Files tab reads)
      if (uploaded.length > 0 && Number.isFinite(derivedProposalId)) {
        await submitProof({
          bidId: bid.bidId,
          proposalId: Number(derivedProposalId),
          milestoneIndex: index,     // ZERO-BASED: M1=0, M2=1, ...
          note: proofText || 'vendor proof',
          files: uploaded,
        });
      }

      // 3) Call your original backend as before (so old admin/payment flow stays intact)
      //    Use FormData; append files with the field name your backend expects.
      //    Your backend worked when field is "file" (not "files"), so we send "file".
      const fd = new FormData();
      fd.append('milestoneIndex', String(index));
      if (proofText.trim()) fd.append('proof', proofText.trim());
      for (const f of files) fd.append('file', f, (f as any).name || 'upload');
      await completeMilestone(bid.bidId, index, fd);

      // 4) Reset and refresh
      setProofText('');
      setFilesByIndex((m) => ({ ...m, [index]: [] }));
      alert('Proof submitted successfully. Images saved and milestone marked complete.');
      onUpdate();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to submit proof');
    } finally {
      setBusyIndex(null);
    }
  };

  const handleReleasePayment = async (index: number) => {
    setBusyIndex(index);
    try {
      const res = await payMilestone(bid.bidId, index);
      setPaymentResult(res);
      alert('Payment released successfully!');
      onUpdate();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to release payment');
    } finally {
      setBusyIndex(null);
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
            {bid.milestones.filter((m) => m.completed).length}/{bid.milestones.length} milestones
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
        {bid.milestones.map((milestone: Milestone, index: number) => {
          const isPaid = !!milestone.paymentTxHash;
          const isCompleted = !!milestone.completed || isPaid;
          const chosen = filesByIndex[index]?.length || 0;

          return (
            <div
              key={index}
              className={`border rounded p-4 ${
                isPaid
                  ? 'bg-green-50 border-green-200'
                  : isCompleted
                  ? 'bg-yellow-50 border-yellow-200'
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
                      isPaid
                        ? 'bg-green-100 text-green-800'
                        : isCompleted
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {isPaid
                      ? 'Paid'
                      : isCompleted
                      ? 'Completed (Unpaid)'
                      : 'Pending'}
                  </span>
                </div>
              </div>

              {isPaid ? (
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
              ) : isCompleted ? (
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
                  <p className="text-sm text-yellow-700 mt-1">
                    Waiting for payment processing...
                  </p>
                  <button
                    onClick={() => handleReleasePayment(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm mt-2 disabled:bg-gray-400"
                  >
                    {busyIndex === index ? 'Processing...' : 'Release Payment'}
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {/* NEW: file picker for this milestone */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Upload proof files (images, PDFs, etc.)
                    </label>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => onChooseFiles(index, e.target.files)}
                      className="block w-full text-sm"
                    />
                    {!!chosen && (
                      <p className="text-xs text-gray-500 mt-1">
                        {chosen} file{chosen > 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>

                  {/* Legacy text proof (still allowed) */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Proof details (optional if you uploaded files)
                    </label>
                    <textarea
                      placeholder="Notes, references, etc."
                      value={proofText}
                      onChange={(e) => setProofText(e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={3}
                    />
                  </div>

                  <button
                    onClick={() => handleCompleteMilestone(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {busyIndex === index ? 'Submitting Proof...' : 'Submit Proof'}
                  </button>
                  <p className="text-xs text-gray-500 mt-1">
                    We’ll upload your files to Pinata, save them to the project, and mark the
                    milestone complete for admin review.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Manual Payment Processor (unchanged) */}
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

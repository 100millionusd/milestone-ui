// src/components/MilestonePayments.tsx
'use client';

import React, { useState } from 'react';
import {
  // ✅ these must exist in '@/lib/api'
  submitProof,            // POST /api/proofs (saves records in DB)
  uploadProofFiles,       // POST /api/proofs/upload (uploads to Pinata)
  completeMilestone,      // legacy: marks milestone completed with text proof
  payMilestone,           // releases payment
  type Bid,
  type Milestone,
} from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  /** Optional: parent can pass the proposalId; otherwise we derive it */
  proposalId?: number;
}

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [completingIndex, setCompletingIndex] = useState<number | null>(null);
  const [proofText, setProofText] = useState(''); // keep your legacy text proof
  // Keep selected files per milestone index
  const [pickedFiles, setPickedFiles] = useState<Record<number, File[]>>({});

  // ————— helpers —————
  const deriveProposalId = () => {
    if (Number.isFinite(proposalId as number)) return Number(proposalId);
    // try to read from bid
    const fromBid =
      (bid as any)?.proposalId ??
      (bid as any)?.proposalID ??
      (bid as any)?.proposal_id;
    if (Number.isFinite(fromBid)) return Number(fromBid);
    // fallback: parse from URL /projects/[id]
    if (typeof window !== 'undefined') {
      const parts = location.pathname.split('/').filter(Boolean);
      const last = Number(parts[parts.length - 1]);
      if (Number.isFinite(last)) return last;
    }
    return undefined;
  };

  const onPickFiles = (idx: number, list: FileList | null) => {
    const arr = Array.from(list || []);
    setPickedFiles((m) => ({ ...m, [idx]: arr }));
  };

  // ————— main actions —————
  const handleCompleteMilestone = async (index: number) => {
    try {
      setCompletingIndex(index);

      const pid = deriveProposalId();
      if (!Number.isFinite(pid)) {
        throw new Error('Could not determine proposalId.');
      }

      // 1) Upload any newly selected files for this milestone to Pinata
      const filesToUpload = pickedFiles[index] || [];
      let uploaded: Array<{ cid: string; url: string; name: string }> = [];
      if (filesToUpload.length > 0) {
        uploaded = await uploadProofFiles(filesToUpload);
      }

      // 2) Save proof record to DB so the Project page can render it
      //    If nothing was uploaded, we still support text-only legacy proof.
      const filesPayload =
        uploaded.length > 0
          ? uploaded.map((u) => ({ url: u.url, name: u.name }))
          : [];

      await submitProof({
        bidId: bid.bidId,
        proposalId: Number(pid),
        milestoneIndex: index, // ZERO-BASED (M1=0, M2=1, …)
        note: proofText || 'vendor proof',
        files: filesPayload,
      });

      // 3) (Optional but kept for compatibility) mark milestone completed in your legacy API
      //    If you don't need to touch the legacy path, you can remove this call.
      await completeMilestone(bid.bidId, index, proofText || 'proof submitted');

      // 4) Notify the project page to refresh the Files tab immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('proofs:changed', { detail: { proposalId: Number(pid) } })
        );
      }

      // tidy up UI
      setProofText('');
      setPickedFiles((m) => ({ ...m, [index]: [] }));
      alert('Proof submitted! Your files are saved and visible on the project page.');

      onUpdate(); // refresh parent bid data
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
      await payMilestone(bid.bidId, index);
      alert('Payment released successfully!');
      onUpdate();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Failed to release payment');
    } finally {
      setCompletingIndex(null);
    }
  };

  // ————— derived totals —————
  const totalAmount = bid.milestones.reduce((sum, m) => sum + m.amount, 0);
  const completedAmount = bid.milestones
    .filter((m) => m.completed)
    .reduce((sum, m) => sum + m.amount, 0);

  const paidAmount = bid.milestones
    .filter((m) => m.paymentTxHash)
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
        <p className="font-mono text-sm bg-white p-2 rounded mt-1 border">{bid.walletAddress}</p>
        <p className="text-xs text-gray-500 mt-1">
          Payments are sent to this {bid.preferredStablecoin} address
        </p>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold">Payment Milestones:</h4>
        {bid.milestones.map((milestone: Milestone, index: number) => {
          const filesSelected = pickedFiles[index]?.length || 0;
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
              <div className="flex flex-wrap gap-3 items-start justify-between mb-2">
                <div>
                  <p className="font-medium">{milestone.name || `Milestone ${index + 1}`}</p>
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

              {/* File picker always visible when not yet paid */}
              {!milestone.paymentTxHash && (
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-1">
                    Attach proof files (images/PDF). These will be uploaded to Pinata and saved to the project.
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(e) => onPickFiles(index, e.target.files)}
                    className="block w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-slate-800 file:text-white"
                  />
                  {filesSelected > 0 && (
                    <p className="text-xs text-gray-600 mt-1">
                      {filesSelected} file{filesSelected > 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              {milestone.paymentTxHash ? (
                <div className="mt-3">
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
                  <p className="text-sm text-yellow-700 mt-1">Waiting for payment processing…</p>
                  <button
                    onClick={() => handleReleasePayment(index)}
                    disabled={completingIndex === index}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm mt-2 disabled:bg-gray-400"
                  >
                    {completingIndex === index ? 'Processing…' : 'Release Payment'}
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-1">
                    Optional text note
                  </label>
                  <textarea
                    placeholder="Describe your proof (optional — files above are sufficient)"
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    className="w-full p-2 border rounded text-sm mb-2"
                    rows={3}
                  />
                  <button
                    onClick={() => handleCompleteMilestone(index)}
                    disabled={completingIndex === index}
                    className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {completingIndex === index ? 'Submitting Proof…' : 'Submit Proof'}
                  </button>
                  <p className="text-xs text-gray-500 mt-1">
                    When you click “Submit Proof”, selected files are uploaded to Pinata and saved to the
                    project automatically.
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
            All milestones have been completed and paid. Total: ${totalAmount.toLocaleString()}{' '}
            {bid.preferredStablecoin}
          </p>
        </div>
      )}
    </div>
  );
};

export default MilestonePayments;

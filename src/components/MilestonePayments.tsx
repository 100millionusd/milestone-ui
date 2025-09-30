// src/components/MilestonePayments.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { completeMilestone, payMilestone, type Bid, type Milestone } from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  /** Optional: parent can pass proposalId; otherwise we’ll derive it */
  proposalId?: number;
}

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [proofText, setProofText] = useState<string>(''); // legacy text proof (still supported)
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [filesByIndex, setFilesByIndex] = useState<Record<number, File[]>>({});

  // ---- helpers ----
  const derivedProposalId = useMemo(() => {
    if (Number.isFinite(proposalId as number)) return Number(proposalId);
    const fromBid =
      (bid as any)?.proposalId ??
      (bid as any)?.proposalID ??
      (bid as any)?.proposal_id;
    if (Number.isFinite(fromBid)) return Number(fromBid);
    // try from URL /projects/[id]
    if (typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const lastNum = Number(parts[parts.length - 1]);
      if (Number.isFinite(lastNum)) return lastNum;
    }
    return undefined;
  }, [proposalId, bid]);

  const handleFilePick = (msIndex: number, list: FileList | null) => {
    const arr = list ? Array.from(list) : [];
    setFilesByIndex((m) => ({ ...m, [msIndex]: arr }));
  };

  // POST /api/proofs/upload (multipart) — uploads to Pinata AND writes a DB "proof" row in one go
  async function uploadProofFiles(params: {
    proposalId: number;
    bidId: number;
    milestoneIndex: number; // ZERO-BASED
    note: string;
    files: File[];
  }) {
    const fd = new FormData();
    fd.append('proposalId', String(params.proposalId));
    fd.append('bidId', String(params.bidId));
    fd.append('milestoneIndex', String(params.milestoneIndex));
    fd.append('note', params.note || 'vendor proof');
    // Field name "files" — our API accepts both "files" and "file"
    for (const f of params.files) fd.append('files', f, f.name);

    const res = await fetch('/api/proofs/upload', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) {
      let msg = '';
      try { msg = await res.text(); } catch {}
      throw new Error(`Upload failed (${res.status}): ${msg || res.statusText}`);
    }
    return res.json();
  }

  const handleSubmitProof = async (index: number) => {
    try {
      setBusyIndex(index);

      const pid = derivedProposalId;
      const selectedFiles = filesByIndex[index] || [];

      if (pid && selectedFiles.length > 0) {
        // ✅ New path: upload files → Pinata; also create DB proof row automatically
        await uploadProofFiles({
          proposalId: pid,
          bidId: bid.bidId,
          milestoneIndex: index, // ZERO-BASED (M1=0, M2=1, …)
          note: proofText || 'vendor proof',
          files: selectedFiles,
        });

        // Keep old flow too so nothing else breaks: mark milestone completed with a small note
        await completeMilestone(bid.bidId, index, proofText || '(files uploaded)');

        // clear selected files for this milestone
        setFilesByIndex((m) => ({ ...m, [index]: [] }));
      } else {
        // 🔁 Legacy fallback (no files picked): just send text proof like before
        await completeMilestone(bid.bidId, index, proofText);
      }

      setProofText('');
      alert('Proof submitted! Admin can now review and release payment.');
      onUpdate();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to submit proof');
    } finally {
      setBusyIndex(null);
    }
  };

  const handleReleasePayment = async (index: number) => {
    try {
      setBusyIndex(index);
      const result = await payMilestone(bid.bidId, index);
      setPaymentResult(result);
      alert('Payment released!');
      onUpdate();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to release payment');
    } finally {
      setBusyIndex(null);
    }
  };

  // ---- computed ----
  const totalAmount = bid.milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const completedAmount = bid.milestones
    .filter((m) => m.completed)
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const paidAmount = bid.milestones
    .filter((m) => m.paymentTxHash)
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

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
          const selected = filesByIndex[index] || [];
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
                    {milestone.dueDate
                      ? `Due: ${new Date(milestone.dueDate).toLocaleDateString()}`
                      : 'No due date'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-600">
                    ${Number(milestone.amount || 0).toLocaleString()}
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
                    amount={Number(milestone.amount || 0)}
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

                  {/* Admin releases payment */}
                  <button
                    onClick={() => handleReleasePayment(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm mt-2 disabled:bg-gray-400"
                  >
                    {busyIndex === index ? 'Processing...' : 'Release Payment'}
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {/* NEW: file input for proof (images / pdf) */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Attach proof files (images / PDFs)
                    </label>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => handleFilePick(index, e.target.files)}
                      className="block w-full text-sm"
                    />
                    {selected.length > 0 && (
                      <p className="text-xs text-gray-600 mt-1">
                        {selected.length} file{selected.length > 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>

                  {/* Legacy text proof (still works; optional when files are attached) */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Proof (text) — optional if you attached files
                    </label>
                    <textarea
                      placeholder="Enter proof details (optional if you uploaded files)"
                      value={proofText}
                      onChange={(e) => setProofText(e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={3}
                    />
                  </div>

                  <button
                    onClick={() => handleSubmitProof(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {busyIndex === index ? 'Submitting…' : 'Submit Proof'}
                  </button>
                  <p className="text-xs text-gray-500">
                    Files are uploaded to Pinata and saved to the project automatically.
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

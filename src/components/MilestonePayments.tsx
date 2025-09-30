'use client';

import React, { useState } from 'react';
import {
  submitProof,             // stores file URLs in /api/proofs so Files tab shows them
  completeMilestone,       // your existing backend endpoint (now can send FormData)
  payMilestone,
  type Bid,
  type Milestone,
} from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  proposalId?: number; // optional, we’ll derive if missing
}

type SelectedFilesMap = Record<number, File[]>;

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [proofText, setProofText] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFilesMap>({});

  const deriveProposalId = () => {
    if (Number.isFinite(proposalId as number)) return Number(proposalId);
    const fromBid =
      (bid as any)?.proposalId ??
      (bid as any)?.proposalID ??
      (bid as any)?.proposal_id;
    if (Number.isFinite(fromBid)) return Number(fromBid);
    if (typeof window !== 'undefined') {
      const parts = location.pathname.split('/').filter(Boolean);
      const last = Number(parts[parts.length - 1]);
      if (Number.isFinite(last)) return last;
    }
    return undefined;
  };

  // Normalize a bunch of possible response shapes from your backend
  function extractUploadedFiles(json: any): Array<{ url: string; name?: string }> {
    const candidates: any[] = []
      .concat(json?.files ?? [])
      .concat(json?.proof?.files ?? [])
      .concat(json?.proofFiles ?? [])
      .concat(json?.data?.files ?? []);
    const out: Array<{ url: string; name?: string }> = [];

    for (const f of candidates) {
      if (!f) continue;
      const cid = f.cid || f.IpfsHash || f.hash;
      const url =
        (f.url && String(f.url)) ||
        (cid ? `https://${(process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY || 'gateway.pinata.cloud'}/ipfs/${cid}` : undefined);
      if (!url) continue;
      out.push({ url, name: f.name || url.split('/').pop() || 'file' });
    }
    return out;
  }

  const handleCompleteMilestone = async (index: number) => {
    try {
      setBusyIndex(index);
      const pid = deriveProposalId();

      // Build FormData if user selected files; otherwise fall back to JSON
      const files = selectedFiles[index];
      if (files && files.length > 0) {
        const fd = new FormData();
        fd.append('milestoneIndex', String(index));
        if (proofText) fd.append('proof', proofText);
        for (const f of files) fd.append('files', f, f.name);

        // 1) Send files to your existing backend (no server.js change)
        const resp = await completeMilestone(bid.bidId, index, fd);
        // 2) Parse any file info backend returns (CIDs or URLs)
        const uploaded = extractUploadedFiles(resp) || [];

        // 3) Persist to /api/proofs so the Files tab updates automatically
        if (uploaded.length > 0 && Number.isFinite(pid)) {
          await submitProof({
            bidId: bid.bidId,
            proposalId: Number(pid),
            milestoneIndex: index, // ZERO-BASED (M1=0, M2=1, …)
            note: 'vendor proof',
            files: uploaded,
          });
        }
      } else {
        // No files selected: keep your legacy “text proof” path
        await completeMilestone(bid.bidId, index, proofText || '');
      }

      // Reset UI
      setSelectedFiles((m) => {
        const next = { ...m };
        delete next[index];
        return next;
      });
      setProofText('');

      onUpdate();
      alert('Proof submitted!');
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
      await payMilestone(bid.bidId, index);
      onUpdate();
      alert('Payment released!');
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to release payment');
    } finally {
      setBusyIndex(null);
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
          const isPaid = !!milestone.paymentTxHash;
          const isCompleted = !!milestone.completed || isPaid;

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
                  <p className="font-medium">{milestone.name || `Milestone ${index + 1}`}</p>
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
                      isPaid
                        ? 'bg-green-100 text-green-800'
                        : isCompleted
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {isPaid ? 'Paid' : isCompleted ? 'Completed (Unpaid)' : 'Pending'}
                  </span>
                </div>
              </div>

              {/* Uncompleted → allow selecting files + optional text, then submit */}
              {!isCompleted && (
                <div className="mt-3 space-y-2">
                  <label className="block text-sm font-medium">
                    Upload proof files (images, PDFs)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const arr = Array.from(e.target.files || []);
                      setSelectedFiles((m) => ({ ...m, [index]: arr }));
                    }}
                    className="block w-full text-sm"
                  />
                  {!!selectedFiles[index]?.length && (
                    <ul className="text-xs text-gray-600 list-disc ml-4">
                      {selectedFiles[index].map((f, i) => (
                        <li key={i}>{f.name}</li>
                      ))}
                    </ul>
                  )}

                  <label className="block text-sm font-medium">Optional text proof</label>
                  <textarea
                    placeholder="Notes or links (optional)"
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                    rows={3}
                  />

                  <button
                    onClick={() => handleCompleteMilestone(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {busyIndex === index ? 'Submitting…' : 'Submit Proof'}
                  </button>

                  <p className="text-xs text-gray-500">
                    Files go to your existing backend (Pinata) and appear automatically on the project Files tab.
                  </p>
                </div>
              )}

              {/* Completed & unpaid → admin can release */}
              {!isPaid && isCompleted && (
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
                  <button
                    onClick={() => handleReleasePayment(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm mt-2 disabled:bg-gray-400"
                  >
                    {busyIndex === index ? 'Processing…' : 'Release Payment'}
                  </button>
                </div>
              )}

              {/* Paid → receipt */}
              {isPaid && (
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

// src/components/MilestonePayments.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  // keep existing imports
  completeMilestone,
  payMilestone,
  type Bid,
  type Milestone,
  // ✅ new helpers (already exported from your api.ts)
  uploadProofFiles,
  saveProofFilesToDb,
} from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
}

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [textProofByIndex, setTextProofByIndex] = useState<Record<number, string>>({});
  const [filesByIndex, setFilesByIndex] = useState<Record<number, File[]>>({});

  const totalAmount = useMemo(
    () => bid.milestones.reduce((sum, m) => sum + Number(m.amount || 0), 0),
    [bid.milestones],
  );
  const completedAmount = useMemo(
    () =>
      bid.milestones
        .filter((m) => m.completed)
        .reduce((sum, m) => sum + Number(m.amount || 0), 0),
    [bid.milestones],
  );
  const paidAmount = useMemo(
    () =>
      bid.milestones
        .filter((m) => m.paymentTxHash)
        .reduce((sum, m) => sum + Number(m.amount || 0), 0),
    [bid.milestones],
  );

  const onPickFiles = (index: number, list: FileList | null) => {
    const arr = list ? Array.from(list) : [];
    setFilesByIndex((prev) => ({ ...prev, [index]: arr }));
  };

  const onChangeProof = (index: number, val: string) => {
    setTextProofByIndex((prev) => ({ ...prev, [index]: val }));
  };

  const handleCompleteMilestone = async (index: number) => {
    try {
      setBusyIndex(index);

      // 1) Gather text proof + picked files
      const pickedFiles = filesByIndex[index] || [];
      const textProof = (textProofByIndex[index] || '').trim();

      // 2) If there are files, upload to Pinata via Next API, then save into DB (/api/proofs)
      let uploaded: Array<{ cid: string; url: string; name: string }> = [];
      if (pickedFiles.length > 0) {
        uploaded = await uploadProofFiles(pickedFiles); // → [{ cid, url, name }]
        if (!uploaded || uploaded.length === 0) {
          throw new Error('File upload failed or returned empty result');
        }

        // Save those URLs so the Files tab can show them
        await saveProofFilesToDb({
          proposalId: Number(bid.proposalId),
          milestoneIndex: index, // ZERO-BASED (M1=0, M2=1, …)
          files: uploaded.map((u) => ({ url: u.url, name: u.name, cid: u.cid })),
          note: textProof || 'vendor proof',
        });
      }

      // 3) Always call legacy completeMilestone so your existing backend state stays in sync
      //    Include attachment links in the legacy text if we uploaded any
      const proofForLegacy =
        uploaded.length > 0
          ? [
              textProof,
              '',
              'Attachments:',
              ...uploaded.map((u) => `- ${u.name || 'file'}: ${u.url}`),
            ]
              .filter(Boolean)
              .join('\n')
          : textProof;

      await completeMilestone(bid.bidId, index, proofForLegacy);

      // 4) Cleanup UI + refresh
      setTextProofByIndex((prev) => ({ ...prev, [index]: '' }));
      setFilesByIndex((prev) => ({ ...prev, [index]: [] }));
      onUpdate();
      alert('Proof submitted successfully. Files were saved and will appear on the Files tab.');
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
      alert('Payment released successfully!');
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
          <p className="text-sm">{bid.milestones.filter((m) => m.paymentTxHash).length} payments</p>
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
          const busy = busyIndex === index;

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
                  <p className="text-lg font-bold text-green-600">${milestone.amount.toLocaleString()}</p>
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
                    disabled={busy}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm mt-2 disabled:bg-gray-400"
                  >
                    {busy ? 'Processing…' : 'Release Payment'}
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {/* NEW: file picker → these get uploaded and saved into /api/proofs automatically */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Proof attachments</label>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => onPickFiles(index, e.target.files)}
                      className="block w-full text-sm"
                      accept="image/*,.pdf"
                    />
                    {!!(filesByIndex[index]?.length || 0) && (
                      <div className="text-xs text-gray-600 mt-1">
                        {filesByIndex[index]!.length} file(s) selected
                      </div>
                    )}
                  </div>

                  {/* Keep your legacy text proof (optional if files are attached) */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Proof details (optional if you attached files)
                    </label>
                    <textarea
                      placeholder="Notes, links, etc."
                      value={textProofByIndex[index] || ''}
                      onChange={(e) => onChangeProof(index, e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={3}
                    />
                  </div>

                  <button
                    onClick={() => handleCompleteMilestone(index)}
                    disabled={busy}
                    className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {busy ? 'Submitting…' : 'Submit Proof'}
                  </button>
                  <p className="text-xs text-gray-500">
                    We’ll upload files to Pinata, save them to the project, and mark the milestone
                    as completed in one step.
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

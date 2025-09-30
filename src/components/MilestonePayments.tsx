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
  /** Optional: parent can pass it. Otherwise we derive from bid or URL */
  proposalId?: number;
}

type FileMap = Record<number, File[]>;

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [textProof, setTextProof] = useState(''); // legacy text proof
  const [selectedFiles, setSelectedFiles] = useState<FileMap>({});
  const [paymentResult, setPaymentResult] = useState<any>(null);

  const totalAmount = useMemo(
    () => bid.milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0),
    [bid.milestones]
  );
  const completedAmount = useMemo(
    () => bid.milestones.filter(m => m.completed).reduce((s, m) => s + (Number(m.amount) || 0), 0),
    [bid.milestones]
  );
  const paidAmount = useMemo(
    () => bid.milestones.filter(m => m.paymentTxHash).reduce((s, m) => s + (Number(m.amount) || 0), 0),
    [bid.milestones]
  );

  const deriveProposalId = () => {
    if (Number.isFinite(proposalId as number)) return Number(proposalId);
    const fromBid = (bid as any)?.proposalId ?? (bid as any)?.proposalID ?? (bid as any)?.proposal_id;
    if (Number.isFinite(fromBid)) return Number(fromBid);
    if (typeof window !== 'undefined') {
      const parts = location.pathname.split('/').filter(Boolean);
      const last = Number(parts[parts.length - 1]);
      if (Number.isFinite(last)) return last;
    }
    return undefined;
  };

  const onPickFiles = (idx: number, list: FileList | null) => {
    const arr = list ? Array.from(list) : [];
    setSelectedFiles(prev => ({ ...prev, [idx]: arr }));
  };

  const uploadToPinata = async (files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f); // our route accepts "files"
    const r = await fetch('/api/proofs/upload', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`/api/proofs/upload failed ${r.status}: ${txt}`);
    }
    const j = await r.json();
    const uploads = Array.isArray(j?.uploads) ? j.uploads : [];
    return uploads.map((u: any) => ({
      url: String(u?.url || '').trim(),
      name: u?.name || (String(u?.url || '').split('/').pop() || 'file'),
    })) as { url: string; name?: string }[];
  };

  const handleCompleteMilestone = async (index: number) => {
    try {
      setBusyIndex(index);

      const pid = deriveProposalId();
      const localFiles = selectedFiles[index] || [];

      // 1) If user picked files, upload them to Pinata first
      let uploadedFiles: { url: string; name?: string }[] = [];
      if (localFiles.length > 0) {
        uploadedFiles = await uploadToPinata(localFiles);
      }

      // 2) If we have uploaded files + a resolvable proposalId, persist proof rows
      if (uploadedFiles.length > 0 && Number.isFinite(pid)) {
        await submitProof({
          bidId: bid.bidId,
          proposalId: Number(pid),
          milestoneIndex: index, // ZERO-BASED
          note: 'vendor proof',
          files: uploadedFiles,
        });
      }

      // 3) Always call legacy completeMilestone to keep your existing flow intact
      //    (text proof optional; if files exist, send a short marker)
      const proofString =
        uploadedFiles.length > 0
          ? `files:${uploadedFiles.map(f => f.name || f.url).join(', ')}`
          : (textProof || '');

      await completeMilestone(bid.bidId, index, proofString);

      // Reset UI
      setTextProof('');
      setSelectedFiles(prev => {
        const next = { ...prev };
        delete next[index];
        return next;
      });

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
        <p className="text-xs text-gray-500 mt-1">Payments are sent to this {bid.preferredStablecoin} address</p>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold">Payment Milestones:</h4>
        {bid.milestones.map((milestone: Milestone, index: number) => {
          const isPaid = !!milestone.paymentTxHash;
          const isCompleted = !!milestone.completed || isPaid;
          const filesPicked = selectedFiles[index]?.length || 0;

          return (
            <div
              key={index}
              className={`border rounded p-4 ${
                isPaid ? 'bg-green-50 border-green-200' :
                isCompleted ? 'bg-yellow-50 border-yellow-200' :
                'bg-gray-50'
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
                    ${Number(milestone.amount || 0).toLocaleString()}
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
                  <p className="text-sm text-yellow-700 mt-1">Waiting for payment processing…</p>
                  <button
                    onClick={() => handleReleasePayment(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm mt-2 disabled:bg-gray-400"
                  >
                    {busyIndex === index ? 'Processing…' : 'Release Payment'}
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Attach proof files (images/PDFs) — they’ll be uploaded to Pinata
                    </label>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => onPickFiles(index, e.target.files)}
                      className="block w-full text-sm"
                    />
                    {filesPicked > 0 && (
                      <p className="text-xs text-gray-600 mt-1">{filesPicked} file(s) selected</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Text proof (optional if you attached files)
                    </label>
                    <textarea
                      placeholder="Enter any extra notes (optional)"
                      value={textProof}
                      onChange={(e) => setTextProof(e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={3}
                    />
                  </div>

                  <button
                    onClick={() => handleCompleteMilestone(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {busyIndex === index ? 'Submitting…' : 'Submit Proof'}
                  </button>
                  <p className="text-xs text-gray-500">
                    We’ll upload any files to Pinata and attach them to this milestone automatically.
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

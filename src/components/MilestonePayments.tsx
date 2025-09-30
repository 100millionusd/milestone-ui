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
  /** Optional: parent-supplied proposal id; otherwise derived from bid or URL */
  proposalId?: number;
}

type FilesMap = Record<number, File[]>;
type NotesMap = Record<number, string>;

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<FilesMap>({});
  const [notes, setNotes] = useState<NotesMap>({});

  const derivedProposalId = useMemo(() => {
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
  }, [proposalId, bid]);

  const totalAmount = bid.milestones.reduce((sum, m) => sum + m.amount, 0);
  const completedAmount = bid.milestones.filter(m => m.completed).reduce((s, m) => s + m.amount, 0);
  const paidAmount = bid.milestones.filter(m => m.paymentTxHash).reduce((s, m) => s + m.amount, 0);

  const onFilesChange = (idx: number, files: FileList | null) => {
    setSelectedFiles(prev => ({
      ...prev,
      [idx]: files ? Array.from(files) : [],
    }));
  };

  const onNoteChange = (idx: number, value: string) => {
    setNotes(prev => ({ ...prev, [idx]: value }));
  };

  const handleCompleteMilestone = async (index: number) => {
    try {
      setBusyIndex(index);

      const files = selectedFiles[index] || [];
      const note = (notes[index] || '').trim();
      const pid = derivedProposalId;

      if (files.length > 0) {
        // 1) Upload files to Pinata through your server route
        const fd = new FormData();
        for (const f of files) fd.append('files', f, f.name);

        const upRes = await fetch('/api/proofs/upload', {
          method: 'POST',
          body: fd,
          credentials: 'include',
          cache: 'no-store',
        });

        if (!upRes.ok) {
          const errTxt = await upRes.text();
          throw new Error(`Upload failed (${upRes.status}): ${errTxt.slice(0, 300)}`);
        }

        const upJson = await upRes.json();
        const uploads = (upJson?.uploads || []) as Array<{ url: string; name?: string }>;

        if (!Array.isArray(uploads) || uploads.length === 0) {
          throw new Error('Upload returned no files.');
        }

        // 2) Save proof rows (so Files tab shows them)
        if (!Number.isFinite(pid)) {
          throw new Error('Could not determine proposalId to save proof.');
        }

        await submitProof({
          bidId: bid.bidId,
          proposalId: Number(pid),
          milestoneIndex: index, // ZERO-BASED (M1=0, M2=1, M3=2, …)
          note: note || 'vendor proof',
          files: uploads.map(u => ({ url: u.url, name: u.name || u.url.split('/').pop() })),
        });
      } else {
        // 3) Fallback to legacy path if no files chosen
        await completeMilestone(bid.bidId, index, note);
      }

      // Clear UI
      setSelectedFiles(prev => ({ ...prev, [index]: [] }));
      setNotes(prev => ({ ...prev, [index]: '' }));

      alert('Proof submitted! It will appear in the project Files tab.');
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
      await payMilestone(bid.bidId, index);
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
        <StatCard label="Total Contract Value" value={`$${totalAmount.toLocaleString()}`} sub={bid.preferredStablecoin} variant="blue" />
        <StatCard
          label="Completed Work"
          value={`$${completedAmount.toLocaleString()}`}
          sub={`${bid.milestones.filter(m => m.completed).length}/${bid.milestones.length} milestones`}
          variant="green"
        />
        <StatCard
          label="Amount Paid"
          value={`$${paidAmount.toLocaleString()}`}
          sub={`${bid.milestones.filter(m => m.paymentTxHash).length} payments`}
          variant="purple"
        />
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
        {bid.milestones.map((m: Milestone, index: number) => {
          const state = m.paymentTxHash ? 'paid' : m.completed ? 'completed' : 'pending';
          return (
            <div
              key={index}
              className={[
                'border rounded p-4',
                state === 'paid' ? 'bg-green-50 border-green-200' :
                state === 'completed' ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50',
              ].join(' ')}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium">{m.name || `Milestone ${index + 1}`}</p>
                  <p className="text-sm text-gray-600">
                    {m.dueDate ? `Due: ${new Date(m.dueDate).toLocaleDateString()}` : 'No due date'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-600">${m.amount.toLocaleString()}</p>
                  <span className={[
                    'px-2 py-1 rounded text-xs',
                    state === 'paid' ? 'bg-green-100 text-green-800'
                    : state === 'completed' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                  ].join(' ')}>
                    {state === 'paid' ? 'Paid' : state === 'completed' ? 'Completed (Unpaid)' : 'Pending'}
                  </span>
                </div>
              </div>

              {state === 'paid' && (
                <div className="mt-2">
                  <div className="p-2 bg-white rounded border">
                    <p className="text-sm text-green-600">
                      ✅ Paid{m.paymentDate ? ` on ${new Date(m.paymentDate).toLocaleDateString()}` : ''}
                    </p>
                    <p className="text-sm mt-1">
                      <span className="font-medium">TX Hash:</span>{' '}
                      <span className="font-mono text-blue-600">{m.paymentTxHash}</span>
                    </p>
                    {m.proof && (
                      <p className="text-sm mt-1">
                        <span className="font-medium">Proof:</span> {m.proof}
                      </p>
                    )}
                  </div>

                  <PaymentVerification
                    transactionHash={m.paymentTxHash!}
                    currency={bid.preferredStablecoin}
                    amount={m.amount}
                    toAddress={bid.walletAddress}
                  />
                </div>
              )}

              {state === 'completed' && (
                <div className="mt-2 p-2 bg-yellow-50 rounded border">
                  <p className="text-sm text-yellow-700">
                    ✅ Completed{m.completionDate ? ` on ${new Date(m.completionDate).toLocaleDateString()}` : ''}
                  </p>
                  {m.proof && (
                    <p className="text-sm mt-1">
                      <span className="font-medium">Proof:</span> {m.proof}
                    </p>
                  )}
                  <p className="text-sm text-yellow-700 mt-1">Waiting for payment processing...</p>
                  <button
                    onClick={() => handleReleasePayment(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm mt-2 disabled:bg-gray-400"
                  >
                    {busyIndex === index ? 'Processing…' : 'Release Payment'}
                  </button>
                </div>
              )}

              {state === 'pending' && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Attach files (images/PDFs)</label>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => onFilesChange(index, e.target.files)}
                      className="block w-full text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      You can attach one or more files. They’ll be uploaded to Pinata and stored as proof.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                    <textarea
                      placeholder="Add a short note"
                      value={notes[index] || ''}
                      onChange={(e) => onNoteChange(index, e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={3}
                    />
                  </div>

                  <button
                    onClick={() => handleCompleteMilestone(index)}
                    disabled={busyIndex === index}
                    className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {busyIndex === index ? 'Submitting Proof…' : 'Submit Proof'}
                  </button>
                  <p className="text-xs text-gray-500">
                    If you don’t attach files, we’ll submit the note as legacy proof so nothing breaks.
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
          <p>All milestones have been completed and paid. Total: ${totalAmount.toLocaleString()} {bid.preferredStablecoin}</p>
        </div>
      )}
    </div>
  );
};

function StatCard({ label, value, sub, variant }:{
  label: string; value: string; sub?: string; variant: 'blue'|'green'|'purple'
}) {
  const map = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    green: 'bg-green-50 border-green-200 text-green-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
  } as const;
  const cls = map[variant];
  return (
    <div className={`${cls} p-4 rounded border`}>
      <p className="text-sm">{label}</p>
      <p className="text-2xl font-bold text-black">{value}</p>
      {sub && <p className="text-sm text-gray-700">{sub}</p>}
    </div>
  );
}

export default MilestonePayments;

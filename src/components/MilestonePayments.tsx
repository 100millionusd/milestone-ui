// src/components/MilestonePayments.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  completeMilestone,
  payMilestone,
  submitProof,
  uploadProofFiles,    // POST /api/proofs/upload → Pinata
  saveProofFilesToDb,  // POST /api/proofs → persists for Files tab
  type Bid,
  type Milestone,
} from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  /** Optional: if parent doesn’t pass it we’ll derive from bid or URL */
  proposalId?: number;
}

type FilesMap = Record<number, File[]>;     // per-milestone selected files
type TextMap  = Record<number, string>;     // per-milestone notes

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [textByIndex, setTextByIndex] = useState<TextMap>({});
  const [filesByIndex, setFilesByIndex] = useState<FilesMap>({});

  // -------- helpers --------
  const setText = (i: number, v: string) =>
    setTextByIndex(prev => ({ ...prev, [i]: v }));

  const setFiles = (i: number, files: FileList | null) =>
    setFilesByIndex(prev => ({ ...prev, [i]: files ? Array.from(files) : [] }));

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

  /**
   * Detect if there’s an open change request for this proposal/milestone.
   * If the route isn’t available, returns false (keeps legacy behavior).
   */
  async function hasOpenChangeRequest(proposalId: number, milestoneIndex: number) {
    try {
      const q = new URLSearchParams({
        proposalId: String(proposalId),
        milestoneIndex: String(milestoneIndex),
        status: 'open',
      });
      const r = await fetch(`/api/proofs/change-requests?${q.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok) return false;
      const list = await r.json().catch(() => []);
      const openStates = new Set(['open', 'needs_changes', 'in_review', 'response_submitted']);
      return Array.isArray(list) && list.some((cr: any) => {
        const samePid = Number(cr?.proposalId) === Number(proposalId);
        const sameMs  = Number(cr?.milestoneIndex) === Number(milestoneIndex);
        const st = String(cr?.status || '').toLowerCase();
        return samePid && sameMs && openStates.has(st);
      });
    } catch {
      // If the endpoint doesn’t exist yet, keep old behavior
      return false;
    }
  }

  // -------- actions --------
  async function handleSubmitProof(index: number) {
    const pid = deriveProposalId();
    if (!Number.isFinite(pid)) {
      alert('Cannot determine proposalId.');
      return;
    }

    const note = (textByIndex[index] || '').trim();

    try {
      setBusyIndex(index);

      // Gather files from local input
      const localFiles: File[] = filesByIndex[index] || [];

      // 1) Upload to Pinata via Next upload route
      const uploaded = localFiles.length ? await uploadProofFiles(localFiles) : [];

      // 2) Map uploaded → filesToSave (full URL, name, cid)
      const filesToSave = uploaded.map(u => ({ url: u.url, name: u.name, cid: u.cid }));

      // 3) Save to /api/proofs so Files tab updates
      await saveProofFilesToDb({
        proposalId: Number(pid),
        milestoneIndex: index,  // ZERO-BASED
        files: filesToSave,
        note: note || 'vendor proof',
      });

      // 4) Notify page to refresh immediately (send both event names + proposalId)
      if (typeof window !== 'undefined') {
        const detail = { proposalId: Number(pid) };
        window.dispatchEvent(new CustomEvent('proofs:updated', { detail }));
        window.dispatchEvent(new CustomEvent('proofs:changed', { detail })); // backward-compat
      }

      // 5) Only auto-complete if there is NO open change request for this milestone
      const inDispute = await hasOpenChangeRequest(Number(pid), index);
      if (!inDispute) {
        await completeMilestone(bid.bidId, index, note || 'vendor submitted');
      } else {
        console.debug('[proof] Open change request detected → NOT auto-completing milestone');
      }

      // 6) Optional: backend proofs for legacy readers
      await submitProof({
        bidId: bid.bidId,
        milestoneIndex: index,
        description: note || 'vendor proof',
        files: filesToSave.map(f => ({
          name: f.name || (f.url.split('/').pop() || 'file'),
          url: f.url,
        })),
      }).catch(() => { /* ignore if server rejects duplicate schema */ });

      // clear local inputs
      setText(index, '');
      setFiles(index, null);

      alert('Proof submitted. Files saved' + (inDispute ? ' (awaiting admin review)' : ' and milestone marked completed.'));
      onUpdate();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to submit proof');
    } finally {
      setBusyIndex(null);
    }
  }

  async function handleReleasePayment(index: number) {
    try {
      setBusyIndex(index);
      await payMilestone(bid.bidId, index);
      alert('Payment released.');
      onUpdate();
    } catch (e: any) {
      alert(e?.message || 'Failed to release payment');
    } finally {
      setBusyIndex(null);
    }
  }

  // -------- computed --------
  const totals = useMemo(() => {
    const total = bid.milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const completed = bid.milestones.filter(m => m.completed).reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const paid = bid.milestones.filter(m => m.paymentTxHash).reduce((s, m) => s + (Number(m.amount) || 0), 0);
    return { total, completed, paid };
  }, [bid.milestones]);

  // -------- render --------
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold mb-4">💰 Milestone Payments</h3>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded border">
          <p className="text-sm text-blue-600">Total Contract Value</p>
          <p className="text-2xl font-bold">${totals.total.toLocaleString()}</p>
          <p className="text-sm">{bid.preferredStablecoin}</p>
        </div>
        <div className="bg-green-50 p-4 rounded border">
          <p className="text-sm text-green-600">Completed Work</p>
          <p className="text-2xl font-bold">${totals.completed.toLocaleString()}</p>
          <p className="text-sm">
            {bid.milestones.filter(m => m.completed).length}/{bid.milestones.length} milestones
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded border">
          <p className="text-sm text-purple-600">Amount Paid</p>
          <p className="text-2xl font-bold">${totals.paid.toLocaleString()}</p>
          <p className="text-sm">
            {bid.milestones.filter(m => m.paymentTxHash).length} payments
          </p>
        </div>
      </div>

      {/* Wallet */}
      <div className="mb-4 p-3 bg-gray-50 rounded">
        <p className="font-medium text-gray-600">Vendor Wallet Address</p>
        <p className="font-mono text-sm bg-white p-2 rounded mt-1 border">{bid.walletAddress}</p>
        <p className="text-xs text-gray-500 mt-1">
          Payments are sent to this {bid.preferredStablecoin} address.
        </p>
      </div>

      {/* Milestones list */}
      <div className="space-y-4">
        <h4 className="font-semibold">Payment Milestones</h4>

        {bid.milestones.map((m: Milestone, i: number) => {
          const isPaid = !!m.paymentTxHash;
          const isDone = !!m.completed || isPaid;

          return (
            <div
              key={i}
              className={`border rounded p-4 ${
                isPaid ? 'bg-green-50 border-green-200'
                : isDone ? 'bg-yellow-50 border-yellow-200'
                : 'bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{m.name || `Milestone ${i + 1}`}</div>
                  {m.dueDate && (
                    <div className="text-xs text-gray-600">
                      Due: {new Date(m.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-700">
                    ${Number(m.amount || 0).toLocaleString()}
                  </div>
                  <span className={`px-2 py-1 rounded text-xs inline-block mt-1 ${
                    isPaid ? 'bg-green-100 text-green-800'
                    : isDone ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                  }`}>
                    {isPaid ? 'Paid' : isDone ? 'Completed (Unpaid)' : 'Pending'}
                  </span>
                </div>
              </div>

              {/* Paid → show verification / details */}
              {isPaid && (
                <div className="mt-3 space-y-2">
                  <div className="p-2 bg-white rounded border text-sm">
                    <div className="text-green-700">
                      ✅ Paid{m.paymentDate ? ` on ${new Date(m.paymentDate).toLocaleDateString()}` : ''}
                    </div>
                    {m.paymentTxHash && (
                      <div className="mt-1">
                        <span className="font-medium">TX Hash: </span>
                        <span className="font-mono text-blue-700">{m.paymentTxHash}</span>
                      </div>
                    )}
                    {m.proof && (
                      <div className="mt-1">
                        <span className="font-medium">Proof: </span>{m.proof}
                      </div>
                    )}
                  </div>

                  <PaymentVerification
                    transactionHash={m.paymentTxHash as string}
                    currency={bid.preferredStablecoin}
                    amount={Number(m.amount || 0)}
                    toAddress={bid.walletAddress}
                  />
                </div>
              )}

              {/* Not paid → allow proof submission / payment release */}
              {!isPaid && (
                <div className="mt-3">
                  {!isDone && (
                    <>
                      <label className="block text-sm font-medium mb-1">
                        Proof of completion (text optional)
                      </label>
                      <textarea
                        value={textByIndex[i] || ''}
                        onChange={e => setText(i, e.target.value)}
                        rows={3}
                        className="w-full p-2 border rounded text-sm mb-2"
                        placeholder="Notes (optional, files will be attached automatically)"
                      />
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="file"
                          multiple
                          onChange={e => setFiles(i, e.target.files)}
                          className="text-sm"
                        />
                        {!!(filesByIndex[i]?.length) && (
                          <span className="text-xs text-gray-600">
                            {filesByIndex[i].length} file(s) selected
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleSubmitProof(i)}
                        disabled={busyIndex === i}
                        className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60"
                      >
                        {busyIndex === i ? 'Submitting…' : 'Submit Proof'}
                      </button>
                      <p className="text-[11px] text-gray-500 mt-1">
                        If you picked files above, they’ll be uploaded to Pinata and saved to the project automatically.
                      </p>
                    </>
                  )}

                  {isDone && !isPaid && (
                    <div className="mt-3">
                      <button
                        onClick={() => handleReleasePayment(i)}
                        disabled={busyIndex === i}
                        className="bg-indigo-600 text-white px-3 py-2 rounded disabled:opacity-60"
                      >
                        {busyIndex === i ? 'Processing…' : 'Release Payment'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Manual Payment Processor (unchanged) */}
      <div className="mt-6">
        <ManualPaymentProcessor bid={bid} onPaymentComplete={onUpdate} />
      </div>
    </div>
  );
};

export default MilestonePayments;

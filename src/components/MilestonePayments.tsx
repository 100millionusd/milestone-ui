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
  /** Strongly recommended: pass the project (proposal) id explicitly */
  proposalId?: number;
}

type FilesMap = Record<number, File[]>;
type TextMap  = Record<number, string>;

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [textByIndex, setTextByIndex] = useState<TextMap>({});
  const [filesByIndex, setFilesByIndex] = useState<FilesMap>({});

  const setText = (i: number, v: string) =>
    setTextByIndex(prev => ({ ...prev, [i]: v }));

  const setFiles = (i: number, files: FileList | null) =>
    setFilesByIndex(prev => ({ ...prev, [i]: files ? Array.from(files) : [] }));

  /** Robust proposalId resolver */
  const deriveProposalId = () => {
    // 1) explicit prop wins
    if (Number.isFinite(proposalId as number)) return Number(proposalId);

    // 2) from bid object (should always be present if API returns it)
    const fromBid =
      (bid as any)?.proposalId ??
      (bid as any)?.proposalID ??
      (bid as any)?.proposal_id;
    if (Number.isFinite(fromBid)) return Number(fromBid);

    // 3) from URL path: prefer /projects/<id> or /proposals/<id>, not the last segment
    if (typeof window !== 'undefined') {
      const parts = location.pathname.split('/').filter(Boolean);

      // try /projects/<id>
      let i = parts.indexOf('projects');
      if (i >= 0 && Number.isFinite(Number(parts[i + 1]))) {
        return Number(parts[i + 1]);
      }

      // try /proposals/<id> (including /admin/proposals/<id>/bids/<bidId>)
      i = parts.indexOf('proposals');
      if (i >= 0 && Number.isFinite(Number(parts[i + 1]))) {
        return Number(parts[i + 1]);
      }
    }

    return undefined;
  };

  /** Submit proof for a milestone (uploads → DB → legacy → complete) */
  async function handleSubmitProof(index: number) {
    const pid = deriveProposalId();
    if (!Number.isFinite(pid)) {
      alert('Cannot determine proposalId.');
      return;
    }

    const note = (textByIndex[index] || '').trim();
    const ms: any = Array.isArray(bid.milestones) ? bid.milestones[index] : undefined;

    try {
      setBusyIndex(index);

      // Gather local files from input
      const localFiles: File[] = filesByIndex[index] || [];

      // Upload selected files to Pinata
      const uploaded = localFiles.length ? await uploadProofFiles(localFiles) : [];

      // Include any preset URLs that might already be attached to the milestone
      const presetUrls: Array<{ url: string; name?: string }> = [];
      const rawList: any[] = []
        .concat(ms?.files || [])
        .concat(ms?.proofFiles || [])
        .concat(ms?.proofs || []);

      for (const f of rawList) {
        if (typeof f === 'string') {
          const url = f.trim();
          if (url && !/[<>]/.test(url)) {
            presetUrls.push({ url, name: decodeURIComponent((url.split('/').pop() || '').trim()) });
          }
        } else if (f && typeof f === 'object' && f.url) {
          const url = String(f.url);
          if (url && !/[<>]/.test(url)) {
            presetUrls.push({ url, name: f.name ? String(f.name) : undefined });
          }
        }
      }

      // Build + de-duplicate the list for DB
      const byKey = new Map<string, { url: string; name?: string; cid?: string }>();
      for (const u of uploaded) {
        const k = (u.url || '').toLowerCase();
        if (k) byKey.set(k, { url: u.url, name: u.name, cid: u.cid });
      }
      for (const p of presetUrls) {
        const k = (p.url || '').toLowerCase();
        if (k && !byKey.has(k)) byKey.set(k, { url: p.url, name: p.name });
      }
      const filesToSave = Array.from(byKey.values());

      // Save files to local /api/proofs DB (this drives the Files tab)
      if (filesToSave.length) {
        const payload = {
          proposalId: Number(pid),
          milestoneIndex: index, // ZERO-BASED
          files: filesToSave,
          note: note || 'vendor proof',
        };
        const res = await saveProofFilesToDb(payload);
        // Debug
        console.log('[proofs] saved to DB', res);
        // Let any open project page refresh immediately
        if (typeof window !== 'undefined') {
          const detail = { proposalId: Number(pid) };
          window.dispatchEvent(new CustomEvent('proofs:updated', { detail }));
          window.dispatchEvent(new CustomEvent('proofs:changed', { detail })); // legacy
        }
      } else {
        console.log('[proofs] no files to save to DB for milestone', index);
      }

      // Mark milestone completed (legacy)
      await completeMilestone(bid.bidId, index, note || 'vendor submitted');

      // Also call the legacy /proofs endpoint so Admin tab shows them
      await submitProof({
        bidId: bid.bidId,
        milestoneIndex: index,
        description: note || 'vendor proof',
        files: filesToSave.map(f => ({
          name: f.name || (f.url.split('/').pop() || 'file'),
          url: f.url,
        })),
      }).catch(() => { /* ignore if server rejects duplicate schema */ });

      // Clear local state
      setText(index, '');
      setFiles(index, null);

      alert('Proof submitted. Files saved and milestone marked completed.');
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
                        Files are uploaded to Pinata and saved to the project automatically.
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

// src/components/MilestonePayments.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
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

// 🔶 CHANGE REQUESTS: local type
type ChangeRequest = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  comment?: string | null;
  checklist?: string[] | null;
  status: 'open' | 'resolved';
  createdAt: string;
  resolvedAt?: string | null;
};

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [textByIndex, setTextByIndex] = useState<TextMap>({});
  const [filesByIndex, setFilesByIndex] = useState<FilesMap>({});

  // 🔶 CHANGE REQUESTS: state + loader
  const [changeReqs, setChangeReqs] = useState<ChangeRequest[]>([]);
  function deriveProposalId() {
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
  }
  async function loadChangeReqs(pid: number) {
    try {
      const r = await fetch(`/api/proofs/change-requests?proposalId=${pid}`, { credentials:'include', cache:'no-store' });
      if (!r.ok) { setChangeReqs([]); return; }
      const rows = await r.json();
      setChangeReqs(Array.isArray(rows) ? rows : []);
    } catch { setChangeReqs([]); }
  }
  useEffect(() => {
    const pid = deriveProposalId();
    if (Number.isFinite(pid)) loadChangeReqs(Number(pid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- helpers --------
  const setText = (i: number, v: string) =>
    setTextByIndex(prev => ({ ...prev, [i]: v }));

  const setFiles = (i: number, files: FileList | null) =>
    setFilesByIndex(prev => ({ ...prev, [i]: files ? Array.from(files) : [] }));

  // -------- actions --------
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

      // 0) Gather files from local input
      const localFiles: File[] = filesByIndex[index] || [];

      // Allow pre-set URLs on milestone (if present)
      const presetUrls: Array<{ url: string; name?: string }> = [];
      const raw = ([] as any[]).concat(ms?.files || [], ms?.proofFiles || [], ms?.proofs || []);
      for (const f of raw) {
        if (typeof f === 'string') {
          presetUrls.push({ url: f, name: decodeURIComponent((f.split('/').pop() || '').trim()) });
        } else if (f && typeof f === 'object' && f.url) {
          presetUrls.push({ url: String(f.url), name: f.name ? String(f.name) : undefined });
        }
      }

      // 1) Upload File objects to Pinata via Next route
      const uploaded = localFiles.length ? await uploadProofFiles(localFiles) : [];

      // 2) Build DB payload
      const filesToSave: Array<{ url: string; name?: string; cid?: string }> = [
        ...presetUrls,
        ...uploaded.map(u => ({ url: u.url, name: u.name, cid: u.cid })),
      ];

      // 3) Save to /api/proofs so Files tab updates
      if (filesToSave.length) {
        await saveProofFilesToDb({
          proposalId: Number(pid),
          milestoneIndex: index,  // ZERO-BASED
          files: filesToSave,
          note: note || 'vendor proof',
        });
        // nudge the project page to refresh its Files tab
        if (typeof window !== 'undefined') {
          const detail = { proposalId: Number(pid) };
          window.dispatchEvent(new CustomEvent('proofs:updated', { detail }));
          window.dispatchEvent(new CustomEvent('proofs:changed', { detail })); // backward-compat
        }
      }

      // 4) Keep legacy path (mark milestone completed with text proof)
      await completeMilestone(bid.bidId, index, note || 'vendor submitted');

      // 5) Optional: legacy submitProof (for old readers)
      await submitProof({
        bidId: bid.bidId,
        milestoneIndex: index,
        description: note || 'vendor proof',
        files: filesToSave.map(f => ({
          name: f.name || (f.url.split('/').pop() || 'file'),
          url: f.url,
        })),
      }).catch(() => {});

      // 🔶 CHANGE REQUESTS: auto-resolve any open requests for this milestone
      try {
        const open = changeReqs.filter(cr => cr.milestoneIndex === index && cr.status === 'open');
        await Promise.all(open.map(cr =>
          fetch(`/api/proofs/change-requests/${cr.id}/resolve`, { method:'POST', credentials:'include' })
        ));
        if (Number.isFinite(pid)) await loadChangeReqs(Number(pid));
      } catch {}

      // clear local inputs
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

          const openReq = changeReqs.find(cr => cr.milestoneIndex === i && cr.status === 'open');

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

              {/* 🔶 CHANGE REQUESTS: show banner if any */}
              {openReq && (
                <div className="mt-3 p-3 rounded border border-amber-300 bg-amber-50 text-sm">
                  <div className="font-medium mb-1">Changes requested by admin</div>
                  {openReq.comment && <div className="mb-1">{openReq.comment}</div>}
                  {Array.isArray(openReq.checklist) && openReq.checklist.length > 0 && (
                    <ul className="list-disc list-inside">
                      {openReq.checklist.map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                  )}
                </div>
              )}

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

// src/components/MilestonePayments.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  // DO NOT import completeMilestone here; we no longer auto-complete on vendor submit.
  payMilestone,
  submitProof,          // still send a "proof" row to your backend (status=pending)
  uploadProofFiles,     // POST /api/proofs/upload → Pinata
  saveProofFilesToDb,   // POST /api/proofs → persists for Files tab
  type Bid,
  type Milestone,
} from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  /** REQUIRED so we can:
   *  - save proof files into project (/api/proofs)
   *  - load / reply to change requests for this project
   */
  proposalId: number;
}

type FilesMap = Record<number, File[]>;     // per-milestone selected files
type TextMap  = Record<number, string>;     // per-milestone notes

// Change-requests API types used locally
type CRFile = { url: string; name?: string; cid?: string };
type CRResponse = {
  id: number;
  requestId: number;
  createdAt: string;
  comment?: string | null;
  files?: CRFile[];
};
type ChangeRequest = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  status: 'open' | 'resolved' | 'closed';
  comment?: string | null;
  checklist?: string[];
  createdAt: string;
  responses?: CRResponse[];
};

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [textByIndex, setTextByIndex] = useState<TextMap>({});
  const [filesByIndex, setFilesByIndex] = useState<FilesMap>({});

  // change-requests state
  const [crs, setCrs] = useState<ChangeRequest[]>([]);
  const [crLoading, setCrLoading] = useState(false);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [replyFiles, setReplyFiles] = useState<Record<number, File[]>>({});
  const setReplyTextFor = (rid: number, v: string) =>
    setReplyText(prev => ({ ...prev, [rid]: v }));
  const setReplyFilesFor = (rid: number, list: FileList | null) =>
    setReplyFiles(prev => ({ ...prev, [rid]: list ? Array.from(list) : [] }));

  // -------- helpers --------
  const setText = (i: number, v: string) =>
    setTextByIndex(prev => ({ ...prev, [i]: v }));

  const setFiles = (i: number, files: FileList | null) =>
    setFilesByIndex(prev => ({ ...prev, [i]: files ? Array.from(files) : [] }));

  // -------- change-requests fetch --------
  async function loadChangeRequests() {
    if (!Number.isFinite(proposalId)) return;
    setCrLoading(true);
    try {
      const url = `/api/proofs/change-requests?proposalId=${encodeURIComponent(
        proposalId
      )}&include=responses&status=open&_=${Date.now()}`;
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const list = (await r.json()) as ChangeRequest[] | { error?: string };
      if (Array.isArray(list)) setCrs(list);
      else setCrs([]);
    } catch {
      setCrs([]);
    } finally {
      setCrLoading(false);
    }
  }

  useEffect(() => {
    loadChangeRequests().catch(() => {});
    const onPing = (ev: any) => {
      const pid = Number(ev?.detail?.proposalId);
      if (!Number.isFinite(pid) || pid === proposalId) loadChangeRequests();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('proofs:updated', onPing);
      window.addEventListener('proofs:changed', onPing);
      return () => {
        window.removeEventListener('proofs:updated', onPing);
        window.removeEventListener('proofs:changed', onPing);
      };
    }
  }, [proposalId]);

  // -------- vendor replies to a change-request --------
  async function handleSendReply(requestId: number) {
    try {
      setBusyIndex(-requestId); // show busy on this reply form
      const comment = (replyText[requestId] || '').trim();
      const localFiles = replyFiles[requestId] || [];

      // 1) Upload files to Pinata (optional)
      const uploaded = localFiles.length ? await uploadProofFiles(localFiles) : [];
      const replyFilesPayload: CRFile[] = uploaded.map(u => ({
        url: u.url, name: u.name, cid: u.cid
      }));

      // 2) Save this reply to the change-requests thread
      const res = await fetch('/api/proofs/change-requests/responses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId,
          comment,
          files: replyFilesPayload,
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(msg);
      }

      // 3) (Optional, but helpful) also persist reply files to Files tab
      if (replyFilesPayload.length) {
        await saveProofFilesToDb({
          proposalId,
          // attach to the same milestone as the request:
          milestoneIndex: crs.find(c => c.id === requestId)?.milestoneIndex ?? 0,
          files: replyFilesPayload.map(f => ({ url: f.url, name: f.name, cid: f.cid })),
          note: comment || 'vendor change-request reply',
        }).catch(() => {});
      }

      // 4) Clear local state and refresh thread
      setReplyTextFor(requestId, '');
      setReplyFilesFor(requestId, null as any);
      await loadChangeRequests();
      // nudge any project page listeners
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('proofs:updated', { detail: { proposalId } }));
      }
      alert('Reply sent.');
    } catch (e: any) {
      console.error('Reply failed:', e);
      alert(e?.message || 'Failed to send reply');
    } finally {
      setBusyIndex(null);
    }
  }

  // -------- vendor submits initial proof (NO auto-complete anymore) --------
  async function handleSubmitProof(index: number) {
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
        proposalId: Number(proposalId),
        milestoneIndex: index,  // ZERO-BASED
        files: filesToSave,
        note: note || 'vendor proof',
      });

      // 4) Notify page to refresh immediately
      if (typeof window !== 'undefined') {
        const detail = { proposalId: Number(proposalId) };
        window.dispatchEvent(new CustomEvent('proofs:updated', { detail }));
        window.dispatchEvent(new CustomEvent('proofs:changed', { detail })); // backward-compat
      }

      // 5) DO NOT auto-complete milestone anymore.
      //    Admin must approve; we only log a proof row for the admin view.
      await submitProof({
        bidId: bid.bidId,
        milestoneIndex: index,
        description: note || 'vendor proof',
        files: filesToSave.map(f => ({
          name: f.name || (f.url.split('/').pop() || 'file'),
          url: f.url,
        })),
      }).catch(() => {});

      // clear local inputs
      setText(index, '');
      setFiles(index, null);

      alert('Proof submitted. Awaiting admin review.');
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

          // Change-requests for this milestone
          const openForThis = crs.filter(c => c.milestoneIndex === i && c.status === 'open');

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

              {/* Paid → verification */}
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
                        Your proof goes to admin review. It won’t auto-complete the milestone anymore.
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

              {/* ---------- Vendor replies to change-requests (if any open) ---------- */}
              {openForThis.length > 0 && (
                <div className="mt-4 rounded border bg-white p-3">
                  <div className="font-semibold text-sm mb-2">
                    Admin requested changes ({openForThis.length})
                    {crLoading && <span className="ml-2 text-xs text-gray-500">refreshing…</span>}
                  </div>
                  <div className="space-y-4">
                    {openForThis.map((req) => (
                      <div key={req.id} className="rounded border p-2 bg-amber-50">
                        <div className="text-sm">
                          {req.comment ? <div><b>Admin:</b> {req.comment}</div> : null}
                          {!!req.checklist?.length && (
                            <ul className="list-disc list-inside text-xs mt-1">
                              {req.checklist.map((c, ci) => <li key={ci}>{c}</li>)}
                            </ul>
                          )}
                        </div>

                        {/* prior replies */}
                        {!!req.responses?.length && (
                          <div className="mt-2 space-y-1">
                            {req.responses.map(r => (
                              <div key={r.id} className="text-xs bg-white rounded border p-2">
                                <div className="opacity-70">{new Date(r.createdAt).toLocaleString()}</div>
                                {r.comment && <div className="mt-1 whitespace-pre-wrap">{r.comment}</div>}
                                {!!r.files?.length && (
                                  <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {r.files.map((f, fi) => (
                                      <a key={fi} href={f.url} target="_blank" className="text-blue-600 underline truncate">
                                        {f.name || f.url.split('/').pop()}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* reply form */}
                        <div className="mt-3">
                          <label className="block text-xs font-medium">Your reply</label>
                          <textarea
                            className="w-full border rounded p-2 text-sm"
                            rows={3}
                            placeholder="Add details or clarifications…"
                            value={replyText[req.id] || ''}
                            onChange={e => setReplyTextFor(req.id, e.target.value)}
                          />
                          <div className="flex items-center gap-3 mt-2">
                            <input
                              type="file"
                              multiple
                              onChange={e => setReplyFilesFor(req.id, e.target.files)}
                              className="text-sm"
                            />
                            {!!(replyFiles[req.id]?.length) && (
                              <span className="text-xs text-gray-600">
                                {replyFiles[req.id].length} file(s)
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleSendReply(req.id)}
                            disabled={busyIndex === -req.id}
                            className="mt-2 bg-amber-700 text-white px-3 py-1 rounded text-sm disabled:opacity-60"
                          >
                            {busyIndex === -req.id ? 'Sending…' : 'Send Reply'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
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

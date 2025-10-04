// src/components/MilestonePayments.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  completeMilestone,
  payMilestone,
  submitProof,
  saveProofFilesToDb,  // POST /api/proofs → persists for Files tab
  type Bid,
  type Milestone,
} from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

// ---- upload helpers (shrink big images, retry on 504) ----
async function shrinkImageIfNeeded(file: File): Promise<File> {
  if (!/^image\//.test(file.type) || file.size < 3_000_000) return file; // only >~3MB

  const bitmap = await createImageBitmap(file);
  const maxSide = 2000;
  let { width, height } = bitmap;
  if (width > height && width > maxSide) {
    height = Math.round((height / width) * maxSide);
    width = maxSide;
  } else if (height > maxSide) {
    width = Math.round((width / height) * maxSide);
    height = maxSide;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob(resolve as any, 'image/jpeg', 0.85),
  );
  return new File([blob!], (file.name || 'image').replace(/\.(png|webp)$/i, '') + '.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

async function postWithRetry(url: string, fd: FormData): Promise<any> {
  const go = async () => {
    const r = await fetch(url, { method: 'POST', body: fd, credentials: 'include' });
    if (!r.ok) throw new Error(`Upload HTTP ${r.status}`);
    return r.json();
  };
  try {
    return await go();
  } catch (e: any) {
    if (!/504/.test(String(e?.message))) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return await go();
  }
}

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  /** Optional: if parent doesn’t pass it we’ll derive from bid or URL */
  proposalId?: number;
}

type FilesMap = Record<number, File[]>;     // per-milestone selected files
type TextMap  = Record<number, string>;     // per-milestone notes

type ChangeRequest = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  comment?: string | null;
  checklist?: any;
  status?: string;
  createdAt?: string;
  resolvedAt?: string | null;
};

const MilestonePayments: React.FC<MilestonePaymentsProps> = ({ bid, onUpdate, proposalId }) => {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [textByIndex, setTextByIndex] = useState<TextMap>({});
  const [filesByIndex, setFilesByIndex] = useState<FilesMap>({});
  // mark milestones as submitted locally so the chip updates immediately
  const [submittedLocal, setSubmittedLocal] = useState<Record<number, true>>({});


  // Open change requests grouped by milestone index (for vendor visibility)
  const [crByMs, setCrByMs] = useState<Record<number, ChangeRequest[]>>({});

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

  const resolvedProposalId = useMemo(() => deriveProposalId(), [proposalId, bid]);

  /** Fetch open CRs for this proposal (for vendor banner + to find the active CR id) */
  async function loadChangeRequests(pid: number) {
    try {
      const r = await fetch(
        `/api/proofs/change-requests?proposalId=${encodeURIComponent(String(pid))}`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!r.ok) { setCrByMs({}); return; }
      const list: ChangeRequest[] = await r.json().catch(() => []);
      const openStates = new Set(['open','needs_changes','in_review','response_submitted']);
      const map: Record<number, ChangeRequest[]> = {};
      for (const cr of list) {
        const st = String(cr?.status || '').toLowerCase();
        if (!openStates.has(st)) continue;
        const mi = Number(cr.milestoneIndex);
        if (!Number.isFinite(mi)) continue;
        (map[mi] ||= []).push(cr);
      }
      Object.keys(map).forEach(k =>
        map[+k].sort((a,b) => (new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime()))
      );
      setCrByMs(map);
    } catch {
      setCrByMs({});
    }
  }

  /** Return the newest open CR id for this milestone (if any) */
  function pickOpenCrId(msIndex: number): number | null {
    const list = crByMs[msIndex] || [];
    if (!list.length) return null;
    const sorted = [...list].sort((a,b) =>
      new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime()
    );
    return sorted[sorted.length - 1]?.id ?? null;
  }

  /** Append a response (text + files) to an open CR */
  async function appendCrResponse(crId: number, note: string, files: Array<{url:string; name?:string; cid?:string}>) {
    try {
      const r = await fetch(`/api/proofs/change-requests/${encodeURIComponent(String(crId))}/respond`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: note || '',
          files: files.map(f => ({ url: f.url, name: f.name ?? (f.url.split('/').pop() || 'file'), cid: f.cid })),
        }),
      });
      // If the route isn’t implemented yet, ignore errors so nothing breaks
      if (!r.ok) {
        // swallow but log (optional)
        console.debug('[cr] respond non-OK:', r.status);
      }
    } catch (e) {
      console.debug('[cr] respond failed (ignored):', (e as any)?.message || e);
    }
  }

  // Load CRs on mount + refresh on proofs events
  useEffect(() => {
    const pid = Number(resolvedProposalId);
    if (!Number.isFinite(pid)) return;
    loadChangeRequests(pid);
    const onAnyProofUpdate = () => loadChangeRequests(pid);
    window.addEventListener('proofs:updated', onAnyProofUpdate);
    window.addEventListener('proofs:changed', onAnyProofUpdate);
    return () => {
      window.removeEventListener('proofs:updated', onAnyProofUpdate);
      window.removeEventListener('proofs:changed', onAnyProofUpdate);
    };
  }, [resolvedProposalId]);

  // -------- actions --------
  async function handleSubmitProof(index: number) {
    const pid = resolvedProposalId;
    if (!Number.isFinite(pid as number)) {
      alert('Cannot determine proposalId.');
      return;
    }

    const note = (textByIndex[index] || '').trim();

    try {
      setBusyIndex(index);

      // Gather files from local input
      const localFiles: File[] = filesByIndex[index] || [];

      // 1) Upload to Pinata via Next upload route (sequential, shrink + retry)
const uploaded: Array<{ name: string; cid: string; url: string }> = [];
for (const original of localFiles) {
  const file = await shrinkImageIfNeeded(original);

  const fd = new FormData();
  // IMPORTANT: the field name must be exactly "files" (plural)
  fd.append('files', file, file.name || 'file');

  const json = await postWithRetry('/api/proofs/upload', fd);
  // /api/proofs/upload returns: { ok: true, uploads: [{cid,url,name}, ...] }
  if (json?.uploads?.length) {
    uploaded.push(...json.uploads);
  } else if (json?.cid && json?.url) {
    // defensive fallback if handler ever returns single file
    uploaded.push({ cid: json.cid, url: json.url, name: file.name || 'file' });
  }
}

      // 2) Map uploaded → filesToSave (full URL, name, cid)
      const filesToSave = uploaded.map(u => ({ url: u.url, name: u.name, cid: u.cid }));

      // 3) Save to /api/proofs so Files tab updates
      await saveProofFilesToDb({
        proposalId: Number(pid),
        milestoneIndex: index,  // ZERO-BASED
        files: filesToSave,
        note: note || 'vendor proof',
      });

      // 👉 mark submitted locally so the vendor sees it instantly
      setSubmittedLocal(prev => ({ ...prev, [index]: true }));

      // 4) Notify page to refresh immediately (send both event names + proposalId) + emit precise submitted event
if (typeof window !== 'undefined') {
  const detail = { proposalId: Number(pid) };
  window.dispatchEvent(new CustomEvent('proofs:updated', { detail }));
  window.dispatchEvent(new CustomEvent('proofs:changed', { detail })); // backward-compat
  window.dispatchEvent(new CustomEvent('proofs:submitted', {
    detail: {
      proposalId: Number(pid),
      bidId: Number(bid.bidId),
      milestoneIndex: Number(index),
    }
  }));
}


      // 5) If there is an OPEN change request → append a response (so admin sees every reply)
//    If there is NO open CR, DO NOT auto-complete. Leave as "awaiting review".
const crId = pickOpenCrId(index);
if (crId) {
  await appendCrResponse(crId, note, filesToSave);
}
// (no else; do NOT call completeMilestone here)

      // 6) Optional: backend proofs for legacy readers
      await submitProof({
        bidId: bid.bidId,
        milestoneIndex: index,
        description: note || 'vendor proof',
        files: filesToSave.map(f => ({
          name: f.name || (f.url.split('/').pop() || 'file'),
          url: f.url,
        })),
      }).catch(() => {});

      // reload CRs (if status changed server-side)
      if (Number.isFinite(pid as number)) await loadChangeRequests(Number(pid));

      // clear local inputs
      setText(index, '');
      setFiles(index, null);

      alert(crId
        ? 'Update sent. Admin will review your response to the change request.'
        : 'Proof submitted. Files saved and milestone marked completed.'
      );
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

  // -------- UI helpers --------
  function renderChangeRequestBanner(msIndex: number) {
    const list = crByMs[msIndex] || [];
    if (!list.length) return null;
    const latest = list[list.length - 1];
    const comment = latest?.comment || '';

    let raw = latest?.checklist as any;
    if (raw && typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { /* keep as string */ }
    }
    const itemsArr =
      Array.isArray(raw) ? raw :
      Array.isArray(raw?.items) ? raw.items :
      [];
    const items = (itemsArr as any[]).map(x =>
      typeof x === 'string'
        ? { text: x, done: false }
        : { text: String(x?.text ?? x?.title ?? ''), done: !!(x?.done ?? x?.checked) }
    ).filter(it => it.text);

    return (
      <div className="mt-3 border rounded bg-amber-50 p-3">
        <div className="text-sm font-semibold text-amber-900">
          ⚠️ Changes requested by admin
        </div>
        {comment && (
          <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">
            {comment}
          </p>
        )}
        {!!items.length && (
          <ul className="mt-2 list-disc list-inside text-sm text-amber-900">
            {items.map((it, i) => (
              <li key={i} className={it.done ? 'line-through opacity-70' : ''}>
                {it.text}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-amber-800 mt-2">
          Re-upload the requested files and press <b>Submit Proof</b> again. Admin will see each response in the thread.
        </p>
      </div>
    );
  }

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

  // 👉 show "Submitted" immediately after upload on this device
  const submitted = !!submittedLocal[i];
  const statusText = isPaid
    ? 'Paid'
    : isDone
      ? 'Completed (Unpaid)'
      : submitted
        ? 'Submitted'
        : 'Pending';

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

        {/* Status chip (uses submittedLocal for instant feedback) */}
        <span
          className={`px-2 py-1 rounded text-xs inline-block mt-1 ${
            isPaid ? 'bg-green-100 text-green-800'
            : isDone ? 'bg-yellow-100 text-yellow-800'
            : 'bg-gray-100 text-gray-800'
          }`}
        >
          {statusText}
        </span>
      </div>
    </div>

    {/* Show admin change request (if any) */}
    {renderChangeRequestBanner(i)}

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

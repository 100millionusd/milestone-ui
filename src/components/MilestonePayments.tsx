// src/components/MilestonePayments.tsx
'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  completeMilestone,
  payMilestone,
  submitProof,
  saveProofFilesToDb,
  type Bid,
  type Milestone,
  getAuthRoleOnce,
} from '@/lib/api';
import ManualPaymentProcessor from './ManualPaymentProcessor';
import PaymentVerification from './PaymentVerification';

// ---- upload helpers (shrink big images, retry on 504) ----
async function shrinkImageIfNeeded(file: File): Promise<File> {
  if (!/^image\//.test(file.type) || file.size < 3_000_000) return file; // only >~3MB

  // FIX: Wrap in try/catch for older browsers
  try {
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
    
    // FIX: Handle transparency for PNGs to prevent black backgrounds
    if (!file.type.includes('png')) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
    }
    
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob(resolve as any, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85)
    );
    
    // Keep extension consistent with type
    const ext = file.type === 'image/png' ? '.png' : '.jpg';
    return new File([blob!], (file.name || 'image').replace(/\.(png|webp|jpeg|jpg)$/i, '') + ext, {
      type: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (e) {
    console.warn("Image shrinking failed, using original", e);
    return file;
  }
}

// FIX: Added maxRetries to prevent infinite loops on 504 errors
async function postWithRetry(url: string, fd: FormData, retries = 3): Promise<any> {
  try {
    const r = await fetch(url, { method: 'POST', body: fd, credentials: 'include' });
    if (!r.ok) throw new Error(`Upload HTTP ${r.status}`);
    return r.json();
  } catch (e: any) {
    // Stop if we run out of retries OR if it's not a 504
    if (retries <= 0 || !/504/.test(String(e?.message))) throw e;
    
    await new Promise((r) => setTimeout(r, 1500));
    // Decrement retries
    return await postWithRetry(url, fd, retries - 1);
  }
}

interface MilestonePaymentsProps {
  bid: Bid;
  onUpdate: () => void;
  proposalId?: number;
}

type FilesMap = Record<number, File[]>;
type TextMap = Record<number, string>;

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
  const [submittedLocal, setSubmittedLocal] = useState<Record<number, true>>({});
  const [crByMs, setCrByMs] = useState<Record<number, ChangeRequest[]>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [paidLocal, setPaidLocal] = useState<Record<number, true>>({});
  
  // FIX: Move ID resolution to state to avoid side-effects in render
  const [activeProposalId, setActiveProposalId] = useState<number | undefined>(undefined);

  // -------- helpers --------
  const setText = (i: number, v: string) =>
    setTextByIndex((prev) => ({ ...prev, [i]: v }));

  const setFiles = (i: number, files: FileList | null) =>
    setFilesByIndex((prev) => ({ ...prev, [i]: files ? Array.from(files) : [] }));

  // FIX: Correctly derive Proposal ID inside useEffect to prevent hydration mismatches
  useEffect(() => {
    let pid: number | undefined = undefined;

    if (Number.isFinite(proposalId)) {
      pid = Number(proposalId);
    } else {
      const fromBid = (bid as any)?.proposalId ?? (bid as any)?.proposalID ?? (bid as any)?.proposal_id;
      if (Number.isFinite(fromBid)) {
        pid = Number(fromBid);
      } else if (typeof window !== 'undefined') {
        // Safe to check window here
        const parts = window.location.pathname.split('/');
        // Scan parts for a valid number (more robust than hardcoded index)
        for (const p of parts) {
             const val = parseInt(p);
             if (!isNaN(val) && val > 0) { // Assuming IDs are positive
                 pid = val; 
                 // We take the last valid number or first? Usually logic dictates specific position, 
                 // but this fallback is safer than parts[length-1] which might be empty string
             }
        }
        // Fallback to legacy logic if scan fails but we need specific index behavior
        if (!pid) {
             const validParts = parts.filter(Boolean);
             const last = Number(validParts[validParts.length - 1]);
             if (Number.isFinite(last)) pid = last;
        }
      }
    }
    setActiveProposalId(pid);
  }, [proposalId, bid]);

  /** Fetch open CRs for this proposal */
  async function loadChangeRequests(pid: number) {
    try {
      const r = await fetch(
        `/api/proofs/change-requests?proposalId=${encodeURIComponent(String(pid))}`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!r.ok) { setCrByMs({}); return; }
      const list: ChangeRequest[] = await r.json().catch(() => []);
      const openStates = new Set(['open', 'needs_changes', 'in_review', 'response_submitted']);
      const map: Record<number, ChangeRequest[]> = {};
      for (const cr of list) {
        const st = String(cr?.status || '').toLowerCase();
        if (!openStates.has(st)) continue;
        const mi = Number(cr.milestoneIndex);
        if (!Number.isFinite(mi)) continue;
        (map[mi] ||= []).push(cr);
      }
      Object.keys(map).forEach((k) =>
        map[+k].sort(
          (a, b) =>
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
        )
      );
      setCrByMs(map);
    } catch {
      setCrByMs({});
    }
  }

  function pickOpenCrId(msIndex: number): number | null {
    const list = crByMs[msIndex] || [];
    if (!list.length) return null;
    // Sort explicitly just in case
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );
    return sorted[sorted.length - 1]?.id ?? null;
  }

  async function appendCrResponse(
    crId: number,
    note: string,
    files: Array<{ url: string; name?: string; cid?: string }>
  ) {
    try {
      await fetch(
        `/api/proofs/change-requests/${encodeURIComponent(String(crId))}/respond`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment: note || '',
            files: files.map((f) => ({
              url: f.url,
              name: f.name ?? (f.url.split('/').pop() || 'file'),
              cid: f.cid,
            })),
          }),
        }
      );
    } catch (e) {
      console.debug('[cr] respond failed (ignored):', e);
    }
  }

  // Load CRs only when activeProposalId is resolved
  useEffect(() => {
    if (!Number.isFinite(activeProposalId)) return;
    const pid = activeProposalId!;

    loadChangeRequests(pid);
    
    const onAnyProofUpdate = () => loadChangeRequests(pid);
    window.addEventListener('proofs:updated', onAnyProofUpdate);
    window.addEventListener('proofs:changed', onAnyProofUpdate);
    return () => {
      window.removeEventListener('proofs:updated', onAnyProofUpdate);
      window.removeEventListener('proofs:changed', onAnyProofUpdate);
    };
  }, [activeProposalId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await getAuthRoleOnce();
        const role = String(j?.role || '').toLowerCase();
        if (!cancelled) setIsAdmin(role === 'admin');
      } catch { /* keep default vendor */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // -------- actions --------
  async function handleSubmitProof(index: number) {
    const pid = activeProposalId;
    if (!Number.isFinite(pid)) {
      alert('Cannot determine proposalId.');
      return;
    }

    const note = (textByIndex[index] || '').trim();

    try {
      setBusyIndex(index);

      const localFiles: File[] = filesByIndex[index] || [];

      const uploaded: Array<{ name: string; cid: string; url: string }> = [];
      for (const original of localFiles) {
        const file = await shrinkImageIfNeeded(original);
        const fd = new FormData();
        fd.append('files', file, file.name || 'file');

        // This now has a retry limit
        const json = await postWithRetry('/api/proofs/upload', fd);
        
        if (json?.uploads?.length) {
          uploaded.push(...json.uploads);
        } else if (json?.cid && json?.url) {
          uploaded.push({ cid: json.cid, url: json.url, name: file.name || 'file' });
        }
      }

      const filesToSave = uploaded.map((u) => ({ url: u.url, name: u.name, cid: u.cid }));

      await saveProofFilesToDb({
        proposalId: Number(pid),
        milestoneIndex: index,
        files: filesToSave,
        note: note || 'vendor proof',
      });

      setSubmittedLocal((prev) => ({ ...prev, [index]: true }));

      if (typeof window !== 'undefined') {
        const detail = { proposalId: Number(pid) };
        window.dispatchEvent(new CustomEvent('proofs:updated', { detail }));
        window.dispatchEvent(new CustomEvent('proofs:changed', { detail })); 
        window.dispatchEvent(
          new CustomEvent('proofs:submitted', {
            detail: { proposalId: Number(pid), bidId: Number(bid.bidId), milestoneIndex: Number(index) },
          })
        );
      }

      const crId = pickOpenCrId(index);
      if (crId) {
        await appendCrResponse(crId, note, filesToSave);
      }

      await submitProof({
        bidId: bid.bidId,
        milestoneIndex: index,
        description: note || 'vendor proof',
        files: filesToSave.map((f) => ({
          name: f.name || (f.url.split('/').pop() || 'file'),
          url: f.url,
        })),
      }).catch(() => {});

      if (Number.isFinite(pid)) await loadChangeRequests(Number(pid));

      setText(index, '');
      setFiles(index, null);

      alert(
        crId
          ? 'Update sent. Admin will review your response to the change request.'
          : 'Proof submitted. Files saved; awaiting review.'
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
      setPaidLocal((prev) => ({ ...prev, [index]: true }));
      alert('Payment released.');
      onUpdate();
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/\b409\b/.test(msg) || /already paid|already in progress/i.test(msg)) {
        setPaidLocal((prev) => ({ ...prev, [index]: true }));
        alert('Already paid.');
        onUpdate();
      } else {
        alert(msg || 'Failed to release payment');
      }
    } finally {
      setBusyIndex(null);
    }
  }

  // -------- computed --------
  const totals = useMemo(() => {
    const total = bid.milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const completed = bid.milestones
      .filter((m) => m.completed)
      .reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const paid = bid.milestones
      .filter((m, i) =>
        !!m.paymentTxHash || !!m.paymentDate || String(m.status || '').toLowerCase() === 'paid' || !!paidLocal[i]
      )
      .reduce((s, m) => s + (Number(m.amount) || 0), 0);
    return { total, completed, paid };
  }, [bid.milestones, paidLocal]);

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
    
    // Safe mapping
    const items = (itemsArr as any[]).map((x) => ({
        text: typeof x === 'string' ? x : String(x?.text ?? x?.title ?? ''), 
        done: !!(x?.done ?? x?.checked)
    })).filter((it) => it.text);

    return (
      <div className="mt-3 border rounded bg-amber-50 p-3">
        <div className="text-sm font-semibold text-amber-900">⚠️ Changes requested by admin</div>
        {comment && <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{comment}</p>}
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

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold mb-4">💰 Milestone Payments</h3>

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
            {bid.milestones.filter((m) => m.completed).length}/{bid.milestones.length} milestones
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded border">
          <p className="text-sm text-purple-600">Amount Paid</p>
          <p className="text-2xl font-bold">${totals.paid.toLocaleString()}</p>
          <p className="text-sm">
            {
              bid.milestones.filter((m, i) =>
                !!m.paymentTxHash || !!m.paymentDate || String(m.status || '').toLowerCase() === 'paid' || !!paidLocal[i]
              ).length
            } payments
          </p>
        </div>
      </div>

      <div className="mb-4 p-3 bg-gray-50 rounded">
        <p className="font-medium text-gray-600">Vendor Wallet Address</p>
        <p className="font-mono text-sm bg-white p-2 rounded mt-1 border">{bid.walletAddress}</p>
        <p className="text-xs text-gray-500 mt-1">
          Payments are sent to this {bid.preferredStablecoin} address.
        </p>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold">Payment Milestones</h4>

        {bid.milestones.map((m: Milestone, i: number) => {
          const paidTruth =
            !!m.paymentTxHash ||
            !!m.paymentDate ||
            String(m.status || '').toLowerCase() === 'paid' ||
            !!paidLocal[i];

          const isPaid = paidTruth;
          const isDone = !!m.completed || isPaid;
          const submitted = !!submittedLocal[i];
          const hasOpenCR = !!(crByMs[i]?.length);
          const canSubmit = !isPaid && !isDone && (hasOpenCR || !submittedLocal[i]);
          
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
                isPaid
                  ? 'bg-green-50 border-green-200'
                  : isDone
                    ? 'bg-yellow-50 border-yellow-200'
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
                  <span
                    className={`px-2 py-1 rounded text-xs inline-block mt-1 ${
                      isPaid
                        ? 'bg-green-100 text-green-800'
                        : isDone
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {statusText}
                  </span>
                </div>
              </div>

              {renderChangeRequestBanner(i)}

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
                        <span className="font-medium">Proof: </span>
                        {m.proof}
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

              {!isPaid && (
                <div className="mt-3">
                  {canSubmit ? (
                    <>
                      <label className="block text-sm font-medium mb-1">
                        Proof of completion (text optional)
                      </label>
                      <textarea
                        value={textByIndex[i] || ''}
                        onChange={(e) => setText(i, e.target.value)}
                        rows={3}
                        className="w-full p-2 border rounded text-sm mb-2"
                        placeholder="Notes (optional, files will be attached automatically)"
                      />
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="file"
                          multiple
                          onChange={(e) => setFiles(i, e.target.files)}
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
                    </>
                  ) : (
                    !isDone && (
                      <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                        Proof submitted — awaiting review.
                      </div>
                    )
                  )}

                  {isDone && !isPaid && isAdmin && (
                    <div className="mt-3">
                      <button
                        onClick={() => handleReleasePayment(i)}
                        disabled={busyIndex === i || !!paidLocal[i]}
                        className="bg-indigo-600 text-white px-3 py-2 rounded disabled:opacity-60"
                      >
                        {busyIndex === i ? 'Processing…' : 'Release Payment'}
                      </button>
                    </div>
                  )}

                  {isDone && !isPaid && !isAdmin && (
                    <div className="mt-3 text-sm text-gray-600 bg-gray-100 border border-gray-200 rounded p-2">
                      Awaiting admin to release payment.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="mt-6">
          <ManualPaymentProcessor bid={bid} onPaymentComplete={onUpdate} />
        </div>
      )}
    </div>
  );
};

export default MilestonePayments;
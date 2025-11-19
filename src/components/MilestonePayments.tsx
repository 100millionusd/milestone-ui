// src/components/MilestonePayments.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
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
    canvas.toBlob(resolve as any, 'image/jpeg', 0.85)
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
  // mark milestones as submitted locally so the chip updates immediately
  const [submittedLocal, setSubmittedLocal] = useState<Record<number, true>>({});
  // open change requests grouped by milestone index (for vendor visibility)
  const [crByMs, setCrByMs] = useState<Record<number, ChangeRequest[]>>({});
  // role gate for cosmetic hiding of admin-only actions
  const [isAdmin, setIsAdmin] = useState(false);
  // local paid latch so button disappears immediately after 200/409
  const [paidLocal, setPaidLocal] = useState<Record<number, true>>({});

  // Collapsible state: key is milestone index, value is boolean (true = expanded)
  const [expandedMilestones, setExpandedMilestones] = useState<Record<number, boolean>>({});

  // -------- helpers --------
  const setText = (i: number, v: string) =>
    setTextByIndex((prev) => ({ ...prev, [i]: v }));

  const setFiles = (i: number, files: FileList | null) =>
    setFilesByIndex((prev) => ({ ...prev, [i]: files ? Array.from(files) : [] }));

  const toggleMilestone = (i: number) => {
    setExpandedMilestones((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  const shorten = (s: string) => (s && s.length > 10 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s || '—');

  const formatDateTime = (d: string | Date | boolean | undefined) => {
    if (!d || d === true) return '—';
    try {
      return new Date(d as any).toLocaleString(undefined, {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch { return '—'; }
  };

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

  /** Return the newest open CR id for this milestone (if any) */
  function pickOpenCrId(msIndex: number): number | null {
    const list = crByMs[msIndex] || [];
    if (!list.length) return null;
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );
    return sorted[sorted.length - 1]?.id ?? null;
  }

  /** Append a response (text + files) to an open CR */
  async function appendCrResponse(
    crId: number,
    note: string,
    files: Array<{ url: string; name?: string; cid?: string }>
  ) {
    try {
      const r = await fetch(
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
      if (!r.ok) {
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

  // Identify admin vs vendor
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
    const pid = resolvedProposalId;
    if (!Number.isFinite(pid as number)) {
      alert('Cannot determine proposalId.');
      return;
    }

    const note = (textByIndex[index] || '').trim();

    try {
      setBusyIndex(index);
      const localFiles: File[] = filesByIndex[index] || [];

      // 1) Upload to Pinata
      const uploaded: Array<{ name: string; cid: string; url: string }> = [];
      for (const original of localFiles) {
        const file = await shrinkImageIfNeeded(original);
        const fd = new FormData();
        fd.append('files', file, file.name || 'file');
        const json = await postWithRetry('/api/proofs/upload', fd);
        if (json?.uploads?.length) {
          uploaded.push(...json.uploads);
        } else if (json?.cid && json?.url) {
          uploaded.push({ cid: json.cid, url: json.url, name: file.name || 'file' });
        }
      }

      // 2) Map to DB objects
      const filesToSave = uploaded.map((u) => ({ url: u.url, name: u.name, cid: u.cid }));

      // 3) Save
      await saveProofFilesToDb({
        proposalId: Number(pid),
        milestoneIndex: index,
        files: filesToSave,
        note: note || 'vendor proof',
      });

      setSubmittedLocal((prev) => ({ ...prev, [index]: true }));

      // 4) Notify
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

      // 5) Respond to CR if open
      const crId = pickOpenCrId(index);
      if (crId) {
        await appendCrResponse(crId, note, filesToSave);
      }

      // 6) Legacy backend
      await submitProof({
        bidId: bid.bidId,
        milestoneIndex: index,
        description: note || 'vendor proof',
        files: filesToSave.map((f) => ({
          name: f.name || (f.url.split('/').pop() || 'file'),
          url: f.url,
        })),
      }).catch(() => {});

      if (Number.isFinite(pid as number)) await loadChangeRequests(Number(pid));

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
    const itemsArr = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    const items = (itemsArr as any[]).map((x) =>
      typeof x === 'string'
        ? { text: x, done: false }
        : { text: String(x?.text ?? x?.title ?? ''), done: !!(x?.done ?? x?.checked) }
    ).filter((it) => it.text);

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
          Re-upload requested files and press <b>Submit Proof</b> again.
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

      {/* Wallet */}
      <div className="mb-6 p-3 bg-gray-50 rounded">
        <p className="font-medium text-gray-600">Vendor Wallet Address</p>
        <p className="font-mono text-sm bg-white p-2 rounded mt-1 border">{bid.walletAddress}</p>
        <p className="text-xs text-gray-500 mt-1">
          Payments are sent to this {bid.preferredStablecoin} address.
        </p>
      </div>

      {/* Table Header */}
      <h4 className="font-semibold mb-3">Milestones</h4>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm text-left text-gray-600">
          {/* --- THEAD is now STRICTLY OUTSIDE the loop --- */}
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3">#</th>
              <th className="px-6 py-3">Title</th>
              <th className="px-6 py-3">Amount</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 whitespace-nowrap">Completed</th>
              <th className="px-6 py-3 whitespace-nowrap">Paid</th>
              <th className="px-6 py-3">Tx</th>
              <th className="px-6 py-3 w-10"></th>
            </tr>
          </thead>
          
          {/* --- TBODY contains the loop --- */}
          <tbody>
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

              const isExpanded = !!expandedMilestones[i];

              // Status Badge Logic
              let statusBadge;
              if (isPaid) {
                statusBadge = <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">Paid</span>;
              } else if (isDone) {
                statusBadge = <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">Completed</span>;
              } else if (submitted) {
                statusBadge = <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">Submitted</span>;
              } else {
                statusBadge = <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-medium">Pending</span>;
              }

              return (
                <React.Fragment key={i}>
                  {/* Summary Row */}
                  <tr 
                    onClick={() => toggleMilestone(i)}
                    className={`bg-white border-b hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}
                  >
                    <td className="px-6 py-4 font-medium text-gray-900">M{i + 1}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{m.name || `Milestone ${i + 1}`}</td>
                    <td className="px-6 py-4">${Number(m.amount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4">{statusBadge}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      {isDone && m.completed ? formatDateTime(m.completed) : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      {isPaid && m.paymentDate ? formatDateTime(m.paymentDate) : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-blue-600">
                      {shorten(m.paymentTxHash as string)}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <svg
                        className={`w-4 h-4 transform transition-transform text-gray-400 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </td>
                  </tr>

                  {/* Details Row (Collapsible) */}
                  {isExpanded && (
                    <tr className="bg-gray-50 border-b">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="max-w-3xl">
                          {renderChangeRequestBanner(i)}

                          {isPaid && (
                            <div className="space-y-2">
                              <PaymentVerification
                                transactionHash={m.paymentTxHash as string}
                                currency={bid.preferredStablecoin}
                                amount={Number(m.amount || 0)}
                                toAddress={bid.walletAddress}
                              />
                              {m.proof && <p className="text-xs text-gray-500">Proof: {m.proof}</p>}
                            </div>
                          )}

                          {!isPaid && (
                            <div className="mt-1">
                              {canSubmit ? (
                                <div className="bg-white p-4 rounded border">
                                  <label className="block text-sm font-medium mb-2 text-gray-900">
                                    Submit Proof
                                  </label>
                                  <textarea
                                    value={textByIndex[i] || ''}
                                    onChange={(e) => setText(i, e.target.value)}
                                    rows={2}
                                    className="w-full p-2 border rounded text-sm mb-3"
                                    placeholder="Notes (optional)..."
                                  />
                                  <div className="flex items-center gap-3 mb-3">
                                    <input
                                      type="file"
                                      multiple
                                      onChange={(e) => setFiles(i, e.target.files)}
                                      className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                    />
                                    {!!(filesByIndex[i]?.length) && (
                                      <span className="text-xs text-gray-600">
                                        {filesByIndex[i].length} selected
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleSubmitProof(i); }}
                                    disabled={busyIndex === i}
                                    className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-60 hover:bg-green-700 transition-colors"
                                  >
                                    {busyIndex === i ? 'Submitting…' : 'Submit Proof'}
                                  </button>
                                </div>
                              ) : (
                                !isDone && (
                                  <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded p-3 inline-block">
                                    Proof submitted — awaiting review.
                                  </div>
                                )
                              )}

                              {isDone && !isPaid && isAdmin && (
                                <div className="mt-3">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleReleasePayment(i); }}
                                    disabled={busyIndex === i || !!paidLocal[i]}
                                    className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-60 hover:bg-indigo-700 transition-colors"
                                  >
                                    {busyIndex === i ? 'Processing…' : 'Release Payment'}
                                  </button>
                                </div>
                              )}

                              {isDone && !isPaid && !isAdmin && (
                                <div className="mt-3 text-sm text-gray-600 bg-gray-100 border border-gray-200 rounded p-3 inline-block">
                                  Awaiting admin to release payment.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Manual Payment Processor (admin only) */}
      {isAdmin && (
        <div className="mt-6">
          <ManualPaymentProcessor bid={bid} onPaymentComplete={onUpdate} />
        </div>
      )}
    </div>
  );
};

export default MilestonePayments;
// src/app/admin/proofs/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBids, payMilestone, completeMilestone, rejectMilestoneProof } from '@/lib/api';
import Link from 'next/link';

// Tabs
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'needs-approval', label: 'Needs Approval' }, // has proof, not completed
  { key: 'ready-to-pay', label: 'Ready to Pay' },     // completed, not yet paid
  { key: 'paid', label: 'Paid' },                     // paymentTxHash present
  { key: 'no-proof', label: 'No Proof' },             // no proof and not completed
] as const;
type TabKey = typeof TABS[number]['key'];

type LightboxState = { urls: string[]; index: number } | null;

export default function AdminProofsPage() {
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const [lightbox, setLightbox] = useState<LightboxState>(null);

  // NEW: tabs + search
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadProofs();
  }, []);

  async function loadProofs() {
    setLoading(true);
    setError(null);
    try {
      // Keep ALL bids; we filter per tab in the UI.
      const allBids = await getBids();
      setBids(Array.isArray(allBids) ? allBids : []);
    } catch (e: any) {
      console.error('Error fetching proofs:', e);
      setError(e?.message || 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  }

  // ---- Helpers for milestone state ----
  function hasProof(m: any): boolean {
    if (!m?.proof) return false;
    // Try JSON
    try {
      const p = JSON.parse(m.proof);
      if (p && typeof p === 'object') {
        if (typeof p.description === 'string' && p.description.trim()) return true;
        if (Array.isArray(p.files) && p.files.length > 0) return true;
      }
    } catch {
      // not JSON; treat non-empty string as proof
      if (typeof m.proof === 'string' && m.proof.trim().length > 0) return true;
    }
    return false;
  }

  function isCompleted(m: any): boolean {
    return !!m?.completed;
  }

  function isPaid(m: any): boolean {
    return !!m?.paymentTxHash;
  }

  function isReadyToPay(m: any): boolean {
    return isCompleted(m) && !isPaid(m);
  }

  function milestoneMatchesTab(m: any): boolean {
    switch (tab) {
      case 'needs-approval':
        return hasProof(m) && !isCompleted(m);
      case 'ready-to-pay':
        return isReadyToPay(m);
      case 'paid':
        return isPaid(m);
      case 'no-proof':
        return !hasProof(m) && !isCompleted(m);
      case 'all':
      default:
        return true;
    }
  }

  function bidMatchesSearch(bid: any): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay =
      `${bid.vendorName || ''} ${bid.proposalId || ''} ${bid.bidId || ''} ${bid.walletAddress || ''}`
        .toLowerCase();
    // also search milestone names
    const msMatch = (Array.isArray(bid.milestones) ? bid.milestones : [])
      .some((m: any) => (m?.name || '').toLowerCase().includes(q));
    return hay.includes(q) || msMatch;
  }

  // Build a filtered structure: only include bids that have ≥1 milestone matching the current tab,
  // and within each bid, only render the milestones that match the tab (except "All" which shows all).
  const filtered = useMemo(() => {
    return (bids || [])
      .filter(bidMatchesSearch)
      .map((bid) => {
        const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
        const filteredMilestones =
          tab === 'all' ? ms : ms.filter(milestoneMatchesTab);

        return { ...bid, _visibleMilestones: filteredMilestones };
      })
      .filter((b) => (tab === 'all' ? (b.milestones?.length ?? 0) > 0 : b._visibleMilestones.length > 0));
  }, [bids, tab, query]);

  // ---- Actions ----
  const handleApprove = async (bidId: number, milestoneIndex: number, proof: string) => {
    if (!confirm('Approve this proof?')) return;
    try {
      setProcessing(`approve-${bidId}-${milestoneIndex}`);
      await completeMilestone(bidId, milestoneIndex, proof);
      await loadProofs();
    } catch (e: any) {
      console.error('Error approving proof:', e);
      alert(e?.message || 'Failed to approve proof');
    } finally {
      setProcessing(null);
    }
  };

  const handlePay = async (bidId: number, milestoneIndex: number) => {
    if (!confirm('Release payment for this milestone?')) return;
    try {
      setProcessing(`pay-${bidId}-${milestoneIndex}`);
      await payMilestone(bidId, milestoneIndex);
      await loadProofs();
    } catch (e: any) {
      console.error('Error paying milestone:', e);
      alert(e?.message || 'Payment failed');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (bidId: number, milestoneIndex: number) => {
  const reason = prompt('Reason for rejection (optional):') || '';
  if (!confirm('Reject this proof?')) return;
  try {
    setProcessing(`reject-${bidId}-${milestoneIndex}`);
    await rejectMilestoneProof(bidId, milestoneIndex, reason);
    await loadProofs(); // re-fetch list
  } catch (e: any) {
    console.error('Error rejecting proof:', e);
    alert(e?.message || 'Failed to reject proof');
  } finally {
    setProcessing(null);
  }
};

  // ---- Proof renderer (with lightbox support) ----
  const renderProof = (m: any) => {
    if (!m?.proof) return null;

    // 1) Try JSON
    let parsed: any = null;
    try {
      parsed = JSON.parse(m.proof);
    } catch {
      /* not JSON */
    }

    // 2) If JSON with files
    if (parsed && typeof parsed === 'object') {
      return (
        <div className="mt-2 space-y-2">
          {parsed.description && (
            <p className="text-sm text-gray-700">{parsed.description}</p>
          )}
          {parsed.files?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {parsed.files.map((f: any, i: number) => {
                const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(f?.name || f?.url || '');
                if (isImage) {
                  const imageUrls = parsed.files
                    .filter((ff: any) => /\.(png|jpe?g|gif|webp|svg)$/i.test(ff?.name || ff?.url || ''))
                    .map((ff: any) => ff.url);
                  const startIndex = imageUrls.findIndex((u: string) => u === f.url);

                  return (
                    <button
                      key={i}
                      onClick={() => setLightbox({ urls: imageUrls, index: Math.max(0, startIndex) })}
                      className="group relative overflow-hidden rounded border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={f.name || `Proof ${i}`}
                        className="h-32 w-full object-cover group-hover:scale-105 transition"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                        {f.name || 'Image'}
                      </div>
                    </button>
                  );
                }
                return (
                  <div key={i} className="p-3 rounded border bg-gray-50">
                    <p className="truncate text-sm">{f?.name || 'Attachment'}</p>
                    <a
                      href={f?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Open
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // 3) Fallback: plain text with URLs
    const text = String(m.proof);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = [...text.matchAll(urlRegex)].map((match) => match[0]);

    return (
      <div className="mt-2 space-y-2">
        <p className="text-sm text-gray-700 whitespace-pre-line">{text}</p>
        {urls.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {urls.map((url, i) => {
              const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
              if (isImage) {
                const imageUrls = urls.filter((u) => /\.(png|jpe?g|gif|webp|svg)$/i.test(u));
                const startIndex = imageUrls.findIndex((u) => u === url);
                return (
                  <button
                    key={i}
                    onClick={() => setLightbox({ urls: imageUrls, index: Math.max(0, startIndex) })}
                    className="group relative overflow-hidden rounded border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Proof ${i}`}
                      className="h-32 w-full object-cover group-hover:scale-105 transition"
                    />
                  </button>
                );
              }
              return (
                <div key={i} className="p-3 rounded border bg-gray-50">
                  <p className="truncate text-sm">Attachment</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Open
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ---- UI ----
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12">
        <h1 className="text-2xl font-bold mb-6">Submitted Proofs (Admin)</h1>
        <div className="text-center text-gray-600">Loading submitted proofs…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-5xl mx-auto py-12">
        <h1 className="text-2xl font-bold mb-6">Submitted Proofs (Admin)</h1>
        <div className="text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
  <div className="max-w-5xl mx-auto py-8">
    {/* Header + Tabs */}
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
      <h1 className="text-2xl font-bold">Submitted Proofs (Admin)</h1>
      <div className="flex items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'px-3 py-1.5 rounded-full text-sm font-medium border',
              tab === t.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>

    {/* Search */}
    <div className="mb-6">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by vendor, project, wallet, milestone…"
        className="w-full md:w-96 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
      />
    </div>

    {filtered.length === 0 ? (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
        <div className="text-5xl mb-3">🗂️</div>
        <p className="text-slate-700">No items match this view.</p>
      </div>
    ) : (
      <div className="space-y-6">
        {filtered.map((bid) => (
          <div key={bid.bidId} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h2 className="text-lg font-semibold">
                  {bid.vendorName} — Proposal #{bid.proposalId}
                </h2>
                <p className="text-gray-600 text-sm">Bid ID: {bid.bidId}</p>
              </div>
              <Link
                href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`}
                className="text-sm text-blue-600 hover:underline"
              >
                Manage →
              </Link>
            </div>

            <div className="space-y-4">
              {(tab === 'all' ? bid.milestones : bid._visibleMilestones).map((m: any, idx: number) => {
                const showApprove = hasProof(m) && !isCompleted(m);
                const showPay = isReadyToPay(m); // completed & unpaid -> show payment, regardless of bid status

                return (
                  <div key={idx} className="border-t pt-4 mt-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{m.name}</p>
                          {isCompleted(m) && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                              Approved
                            </span>
                          )}
                          {isPaid(m) && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                              Paid
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          Amount: ${m.amount} | Due: {m.dueDate}
                        </p>

                        {renderProof(m)}

                        {m.paymentTxHash && (
                          <p className="text-sm text-green-600 mt-2 break-all">
                            Paid ✅ Tx: {m.paymentTxHash}
                          </p>
                        )}
                        {!hasProof(m) && !isCompleted(m) && (
                          <p className="text-sm text-amber-600 mt-2">
                            No proof submitted yet.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {showApprove && (
                          <button
                            onClick={() => handleApprove(bid.bidId, idx, m.proof)}
                            disabled={processing === `approve-${bid.bidId}-${idx}`}
                            className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50"
                          >
                            {processing === `approve-${bid.bidId}-${idx}` ? 'Approving...' : 'Approve Proof'}
                          </button>
                        )}

                        {/* NEW: Reject button */}
                        {hasProof(m) && !isCompleted(m) && (
                          <button
                            onClick={() => handleReject(bid.bidId, idx)}
                            disabled={processing === `reject-${bid.bidId}-${idx}`}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50"
                          >
                            {processing === `reject-${bid.bidId}-${idx}` ? 'Rejecting...' : 'Reject'}
                          </button>
                        )}

                        {showPay && (
                          <button
                            onClick={() => handlePay(bid.bidId, idx)}
                            disabled={processing === `pay-${bid.bidId}-${idx}`}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
                          >
                            {processing === `pay-${bid.bidId}-${idx}` ? 'Paying...' : 'Release Payment'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    )}

    {/* Lightbox */}
    {lightbox && (
      <div
        className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        onClick={() => setLightbox(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={lightbox.urls[lightbox.index]}
          alt="proof preview"
          className="max-h-full max-w-full rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />

        {lightbox.index > 0 && (
          <button
            className="absolute left-4 text-white text-3xl font-bold"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox({ ...lightbox, index: lightbox.index - 1 });
            }}
          >
            ‹
          </button>
        )}

        {lightbox.index < lightbox.urls.length - 1 && (
          <button
            className="absolute right-4 text-white text-3xl font-bold"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox({ ...lightbox, index: lightbox.index + 1 });
            }}
          >
            ›
          </button>
        )}

        <button
          className="absolute top-4 right-4 text-white text-2xl"
          onClick={() => setLightbox(null)}
        >
          ✕
        </button>
      </div>
    )}
   </div>
);
}

// src/app/admin/bids/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as api from '@/lib/api';
import { API_BASE } from '@/lib/api';
import Agent2Inline from '@/components/Agent2Inline';
import BidChatAgent from '@/components/BidChatAgent';

/* ——— Template/Normal compatibility helpers ——— */
const getMilestoneDescription = (m: any) => m?.notes ?? m?.desc ?? m?.description ?? '';
const getDisplayFiles = (bid: any) =>
  (Array.isArray(bid?.files) && bid.files.length ? bid.files : (bid?.docs ?? []));

/* ——— Reusable Collapsible Wrapper ——— */
function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  action
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode; // Optional extra button in header
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded border bg-white overflow-hidden shadow-sm">
      <div
        className="flex items-center justify-between p-4 bg-slate-50 border-b cursor-pointer select-none hover:bg-slate-100 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <span className={`transform transition-transform text-xs text-slate-500 ${isOpen ? 'rotate-90' : ''}`}>
            ▶
          </span>
          {title}
        </div>
        {/* Prevent parent click when clicking the action */}
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {isOpen && <div className="p-4">{children}</div>}
    </section>
  );
}

export default function AdminBidDetailPage(props: { params?: { id: string } }) {
  const routeParams = useParams();
  const bidId = Number((props.params as any)?.id ?? (routeParams as any)?.id);

  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [proofs, setProofs] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // local action locks (approve/reject) by milestone index
  const [actedByIdx, setActedByIdx] = useState<Record<number, 'approved' | 'rejected'>>({});
  const [lockByIdx, setLockByIdx] = useState<Record<number, boolean>>({});

  // who am I (gate admin-only edit controls)
  const [me, setMe] = useState<{ address?: string; role?: 'admin'|'vendor'|'guest' }>({ role: 'guest' });

  // per-proof prompt + busy state
  const [promptById, setPromptById] = useState<Record<number, string>>({});
  const [busyById, setBusyById] = useState<Record<number, boolean>>({});
  const [proofStatusByIdx, setProofStatusByIdx] = useState<Record<number, string>>({});

  // latest proof_id per milestone (by max id — single source of truth)
  const latestIdByIdx = useMemo(() => {
    const ids: Record<number, number> = {};
    for (const p of proofs) {
      const idx = Number(p.milestoneIndex ?? p.milestone_index);
      const pid = Number(p.proofId ?? p.id ?? 0);
      if (!Number.isFinite(idx) || !Number.isFinite(pid)) continue;
      if (!ids[idx] || pid > ids[idx]) ids[idx] = pid;
    }
    return ids;
  }, [proofs]);

  // fallback latest *status* per milestone (by max id)
  const fallbackLatestByIdx = useMemo(() => {
    const out: Record<number, string> = {};
    const ids: Record<number, number> = {};
    for (const p of proofs) {
      const idx = Number(p.milestoneIndex ?? p.milestone_index);
      const pid = Number(p.proofId ?? p.id ?? 0);
      if (!Number.isFinite(idx) || !Number.isFinite(pid)) continue;
      if (!ids[idx] || pid > ids[idx]) {
        ids[idx] = pid;
        out[idx] = String(p.status || 'pending');
      }
    }
    return out;
  }, [proofs]);

  // only show the latest proof card per milestone in the UI
  const visibleProofs = useMemo(() => {
    const keep = new Set<number>(Object.values(latestIdByIdx));
    return proofs.filter(p => {
      const id = Number(p.proofId ?? p.id);
      const status = String(p.status || '').toLowerCase();
      return keep.has(id) && status !== 'rejected';
    });
  }, [proofs, latestIdByIdx]);

  // chat modal state (bid-level; opened from header or any proof)
  const [chatOpen, setChatOpen] = useState(false);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // load role early to gate UI
        api.getAuthRoleOnce().then(setMe).catch(() => {});

        const b = await api.getBid(bidId);
        setBid(b);

        const p = await api.getProposal(b.proposalId);
        setProposal(p);

        const pf = await api.getProofs(bidId); // admin-only
        setProofs(pf);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load bid');
      } finally {
        setLoading(false);
      }
    })();
  }, [bidId]);

  // Fetch latest per-milestone status map (server truth)
  useEffect(() => {
    if (!bidId) return;
    (async () => {
      try {
        const r = await fetch(
          `${API_BASE}/bids/${bidId}/proofs/latest-status`,
          { credentials: 'include', cache: 'no-store' } // prevent stale cache
        );
        const j = await r.json();
        setProofStatusByIdx(j?.byIndex || {});
      } catch (e) {
        console.warn('latest-status fetch failed', e);
        setProofStatusByIdx({});
      }
    })();
  }, [bidId]);

  // hydrate reject locks from localStorage so buttons stay disabled after refresh/navigation
  useEffect(() => {
    if (!bidId) return;
    try {
      const next: Record<number, boolean> = {};
      for (const p of proofs) {
        const idx = Number(p.milestoneIndex ?? p.milestone_index);
        if (typeof window !== 'undefined' &&
            localStorage.getItem(`rej:${bidId}:${idx}`) === '1') {
          next[idx] = true;
        }
      }
      setLockByIdx(next);
    } catch { /* ignore */ }
  }, [bidId, proofs]);

  async function runProofAnalysis(proofId: number) {
    try {
      setBusyById((prev) => ({ ...prev, [proofId]: true }));
      const prompt = promptById[proofId] || '';
      const updated = await api.analyzeProof(proofId, prompt || undefined);
      setProofs((prev) =>
        prev.map((p) => (Number(p.proofId ?? p.id) === proofId ? updated : p))
      );
    } catch (e: any) {
      alert(e?.message || 'Failed to run Agent 2 on proof');
    } finally {
      setBusyById((prev) => ({ ...prev, [proofId]: false }));
    }
  }

  // refresh latest status map AND the proofs list (no stale cache)
  async function refreshLatest() {
    if (!bidId) return;
    try {
      const [statusRes, proofsRes] = await Promise.all([
        fetch(`${API_BASE}/bids/${bidId}/proofs/latest-status`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch(`${API_BASE}/proofs?bidId=${bidId}`, {
          credentials: 'include',
          cache: 'no-store',
        }),
      ]);

      const statusJson = await statusRes.json();
      const proofsJson = await proofsRes.json();

      setProofStatusByIdx(statusJson?.byIndex || {});
      setProofs(Array.isArray(proofsJson) ? proofsJson : []);
    } catch {
      /* ignore */
    }
  }

  // one-shot reject; disables button + persists lock + flips local status immediately
  async function onRejectOnce(idx: number) {
    // already locked in this session? bail
    if (actedByIdx[idx] === 'rejected' || lockByIdx[idx]) return;

    try {
      await api.rejectProof(bidId, idx); // <-- use api.* (not a bare function)
    } catch {
      // non-fatal — we still lock locally to prevent repeat clicks
    }

    // 1) lock locally & persist
    setActedByIdx(prev => ({ ...prev, [idx]: 'rejected' }));
    setLockByIdx(prev => ({ ...prev, [idx]: true }));
    if (typeof window !== 'undefined') {
      localStorage.setItem(`rej:${bidId}:${idx}`, '1');
    }

    // 2) remove the latest rejected proof from local state immediately
    setProofStatusByIdx(prev => ({ ...prev, [idx]: 'rejected' }));
    setProofs(prev => {
      let latestId = 0;
      for (const q of prev) {
        const qIdx = Number(q.milestoneIndex ?? q.milestone_index);
        const pid  = Number(q.proofId ?? q.id ?? 0);
        if (qIdx === idx && pid > latestId) latestId = pid;
      }
      // drop that row entirely
      return prev.filter(q => {
        const qIdx = Number(q.milestoneIndex ?? q.milestone_index);
        const pid  = Number(q.proofId ?? q.id ?? 0);
        return !(qIdx === idx && pid === latestId);
      });
    });

    // 3) refresh server truth (won’t re-enable the button, local state already flipped)
    refreshLatest(); // fire-and-forget
  }

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Bid #{bidId}</h1>
          <Link href="/admin/bids" className="underline">← Back</Link>
        </div>
        <div className="py-20 text-center text-gray-500">Loading…</div>
      </main>
    );
  }

  if (err || !bid) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Bid #{bidId}</h1>
          <Link href="/admin/bids" className="underline">← Back</Link>
        </div>
        <div className="p-4 rounded border bg-rose-50 text-rose-700">{err || 'Bid not found'}</div>
      </main>
    );
  }

  const ms = Array.isArray(bid.milestones) ? bid.milestones : [];

return (
  <main className="max-w-5xl mx-auto p-6 space-y-6">
    <div className="flex items-center justify-between">
      {/* 1. Header made smaller (text-2xl -> text-xl) */}
      <h1 className="text-xl font-semibold">Bid #{bidId}</h1>
      
      <div className="flex items-center gap-3">
        {/* 2. Chat button made smaller (padding & text reduced) */}
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="px-2.5 py-1 rounded bg-blue-600 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
          title="Ask Agent 2 about this bid"
        >
          Ask Agent 2 (Chat)
        </button>

        {/* 3. Back link made smaller (text-sm -> text-xs) */}
        <Link href="/admin/bids" className="underline text-xs">
          ← Back
        </Link>
      </div>
    </div>

      {/* 1. Collapsible Bid Summary (Closed by default) */}
      <CollapsibleSection title="Bid Summary & Milestones" defaultOpen={false}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Info label="Project" value={`#${bid.proposalId}`} />
          <Info label="Vendor" value={bid.vendorName} />
          <Info
            label="Price"
            value={`$${Number(bid.priceUSD).toLocaleString()} ${bid.preferredStablecoin}`}
          />
          <Info label="Timeline" value={`${bid.days} days`} />
          <div className="sm:col-span-2">
            <div className="text-sm text-gray-500">Notes</div>
            <div className="font-medium whitespace-pre-wrap">{bid.notes || '—'}</div>
          </div>
        </div>
        {/* Attachments */}
        {(() => {
          const files =
            (Array.isArray(bid?.files) && bid.files.length ? bid.files : (bid?.docs ?? []));
          if (!files?.length) return null;
          return (
            <div className="mt-4">
              <div className="text-sm text-gray-500 mb-1">Attachments</div>
              <ul className="list-disc list-inside text-sm">
                {files.map((f: any, i: number) => (
                  <li key={i}>
                    <a
                      className="text-blue-600 hover:underline"
                      href={f.url ?? f.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {f.name ?? f.filename ?? `File ${i + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Admin-only quick edits */}
        {me.role === 'admin' && (
          <div className="mt-4 p-3 rounded-lg bg-slate-50 border">
            <div className="text-sm font-semibold mb-3">Admin: Quick Edit</div>
            <AdminBidEditor bid={bid} onUpdated={setBid} />
          </div>
        )}

        {/* Milestones */}
        <div className="mt-6 border-t pt-4">
          <MilestonesSection
            bid={bid}
            canEdit={me.role === 'admin'}
            onUpdated={(updatedBid) => setBid(updatedBid)}
          />
        </div>
      </CollapsibleSection>

      {/* 2. Collapsible Agent 2 Inline (Closed by default) */}
      {proposal && (
        <CollapsibleSection title="Agent 2 Proposal Analysis" defaultOpen={false}>
          <Agent2Inline bid={bid} proposal={proposal as any} />
        </CollapsibleSection>
      )}

      {/* 3. Collapsible Submitted Proofs (Closed by default) */}
      <CollapsibleSection
        title={`Submitted Proofs (${visibleProofs.length})`}
        defaultOpen={false}
        action={
          <Link
            href={`/proposals/${bid.proposalId}/edit`}
            className="px-3 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
          >
            Edit Proposal
          </Link>
        }
      >
        {visibleProofs.length === 0 && (
          <div className="text-sm text-slate-500 text-center py-4">No proofs submitted yet.</div>
        )}

        {visibleProofs.map((p) => {
          const id = Number(p.proofId ?? p.id);
          const a = p.aiAnalysis ?? p.ai_analysis;
          const idx = Number(p.milestoneIndex ?? p.milestone_index);
          const latestStatus = proofStatusByIdx[idx] ?? fallbackLatestByIdx[idx] ?? p.status;
          const canReview = latestStatus === 'pending';
          const rejectLocked =
            !!lockByIdx[idx] || actedByIdx[idx] === 'rejected' || latestStatus !== 'pending';
          const isLatestCard = id === latestIdByIdx[idx];

          return (
            <div key={id} className="rounded-lg border border-slate-200 bg-white mb-4 shadow-sm transition-shadow hover:shadow-md">
              {/* Card Header - Always visible */}
              <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
                <div>
                  <div className="font-medium text-lg">
                    Milestone {Number(p.milestoneIndex ?? p.milestone_index) + 1}
                  </div>
                  <div className="text-sm text-slate-500">{p.title || `Proof #${id}`}</div>
                </div>
                <span
                  className={`text-xs rounded px-3 py-1 font-medium border ${
                    latestStatus === 'approved'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : latestStatus === 'rejected'
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  {latestStatus.toUpperCase()}
                </span>
              </div>

              <div className="p-4">
                {p.description && (
                  <div className="mb-4">
                    <div className="text-xs text-slate-400 uppercase font-bold mb-1">Description</div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{p.description}</p>
                  </div>
                )}

                {Array.isArray(p.files) && p.files.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-slate-400 uppercase font-bold mb-1">Files</div>
                    <ul className="space-y-1">
                      {p.files.map((f: any, i: number) => (
                        <li key={i} className="text-sm">
                          <a className="text-blue-600 hover:underline flex items-center gap-1" href={f.url} target="_blank" rel="noreferrer">
                            📄 {f.name || f.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-md bg-slate-50 p-3 border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                      🤖 Agent 2 Analysis
                    </div>
                    <button
                      type="button"
                      onClick={() => setChatOpen(true)}
                      className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                      title="Ask Agent 2 about this bid/proof"
                    >
                      Ask Agent2
                    </button>
                  </div>

                  {/* Actions Area */}
                  {(isLatestCard && canReview && !rejectLocked) ? (
                    <div className="mt-3 flex gap-2 mb-4 border-b pb-4 border-slate-200">
                      <button
                        className="px-4 py-2 rounded bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                        onClick={async () => {
                          await api.approveProof(bidId, idx);
                          setProofStatusByIdx(prev => ({ ...prev, [idx]: 'approved' }));
                          await refreshLatest();
                        }}
                      >
                        Approve Proof
                      </button>

                      <button
                        className="px-4 py-2 rounded bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => onRejectOnce(idx)}
                        disabled={rejectLocked}
                        title={rejectLocked ? 'Already rejected' : 'Reject'}
                      >
                        {rejectLocked ? 'Rejected' : 'Reject'}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-500 mb-3">
                      Status: <span className="font-medium text-slate-700">{latestStatus}</span>
                    </div>
                  )}

                  {/* Analysis Body - Always visible now */}
                  {a ? (
                    <AnalysisView a={a} />
                  ) : (
                    <div className="text-sm text-slate-600">No analysis yet for this proof.</div>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <textarea
                      value={promptById[id] || ''}
                      onChange={(e) => setPromptById((prev) => ({ ...prev, [id]: e.target.value }))}
                      className="w-full p-2 rounded border bg-white text-sm"
                      rows={2}
                      placeholder="Add instructions to re-run Agent 2..."
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => runProofAnalysis(id)}
                        disabled={!!busyById[id]}
                        className="px-3 py-1.5 rounded text-sm bg-slate-800 text-white disabled:opacity-50 hover:bg-slate-900"
                      >
                        {busyById[id] ? 'Analyzing…' : 'Re-run Agent 2'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CollapsibleSection>

      {/* One chat modal for the whole page */}
      <BidChatAgent
        bidId={bidId}
        proposal={proposal}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="font-medium text-gray-900">{value}</div>
    </div>
  );
}

// UPDATED: No toggle, details always visible
function AnalysisView({ a }: { a: any }) {
  return (
    <div className="space-y-3">
      {/* Header Stats */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
         {'fit' in a && (
           <span>
             Fit: <b className={fitColor(a.fit)}>{String(a.fit || '').toLowerCase() || '—'}</b>
           </span>
         )}
         {'confidence' in a && (
           <span>Confidence: <b>{Math.round((a.confidence ?? 0) * 100)}%</b></span>
         )}
         {'pdfUsed' in a && (
            <span className="text-slate-500 ml-2">PDF parsed: <b>{a.pdfUsed ? 'Yes' : 'No'}</b></span>
         )}
      </div>

      {/* Details Body */}
      <div className="mt-2">
        {a.summary && (
          <div className="mb-3">
            <div className="text-xs font-bold text-slate-500 uppercase mb-1">Summary</div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800 bg-white p-2 rounded border border-slate-100">{a.summary}</p>
          </div>
        )}

        {Array.isArray(a.risks) && a.risks.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-bold text-rose-600 uppercase mb-1">Risks Detected</div>
            <ul className="list-disc list-inside text-sm space-y-1 bg-rose-50 p-2 rounded border border-rose-100 text-rose-800">
              {a.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}

        {Array.isArray(a.milestoneNotes) && a.milestoneNotes.length > 0 && (
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase mb-1">Milestone Notes</div>
            <ul className="list-disc list-inside text-sm space-y-1 text-slate-700">
              {a.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function fitColor(fit?: string) {
  const f = String(fit || '').toLowerCase();
  if (f === 'high') return 'text-emerald-700';
  if (f === 'medium') return 'text-amber-700';
  if (f === 'low') return 'text-rose-700';
  return 'text-slate-600';
}

/** Admin inline editor for stablecoin, price, days, notes (NOT milestones) */
function AdminBidEditor({ bid, onUpdated }: { bid: any; onUpdated: (b:any)=>void }) {
  const [coin, setCoin]   = useState<'USDC'|'USDT'>(bid.preferredStablecoin || 'USDC');
  const [price, setPrice] = useState<string>(String(bid.priceUSD ?? ''));
  const [days, setDays]   = useState<string>(String(bid.days ?? ''));
  const [notes, setNotes] = useState<string>(bid.notes || '');
  const [saving, setSaving] = useState(false);

  const dirty =
    coin !== (bid.preferredStablecoin || 'USDC') ||
    Number(price) !== Number(bid.priceUSD) ||
    Number(days) !== Number(bid.days) ||
    String(notes || '') !== String(bid.notes || '');

  async function save() {
    const parsedPrice = Number(price);
    const parsedDays  = Number(days);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      alert('Price must be a non-negative number'); return;
    }
    if (!Number.isFinite(parsedDays) || parsedDays < 0) {
      alert('Days must be a non-negative number'); return;
    }

    setSaving(true);
    try {
      const patch: any = {
        preferredStablecoin: coin,
        priceUSD: parsedPrice,
        days: parsedDays,
        notes,
      };
      const updated = await api.updateBid(bid.bidId, patch);
      onUpdated((prev:any) => ({
        ...prev,
        preferredStablecoin: updated.preferredStablecoin,
        priceUSD: updated.priceUSD,
        days: updated.days,
        notes: updated.notes,
      }));
    } catch (e:any) {
      alert(e?.message || 'Failed to update bid');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Stablecoin</label>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={coin}
          onChange={(e) => setCoin(e.target.value as 'USDC'|'USDT')}
        >
          <option value="USDC">USDC</option>
          <option value="USDT">USDT</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Price (USD)</label>
        <input
          type="number"
          className="border rounded px-2 py-1 text-sm w-40"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          min={0}
          step="0.01"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Days</label>
        <input
          type="number"
          className="border rounded px-2 py-1 text-sm w-32"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          min={0}
          step="1"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-sm text-gray-600 mb-1">Notes</label>
        <textarea
          className="w-full border rounded px-2 py-1 text-sm"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="sm:col-span-2 flex gap-2">
        <button
          className="px-3 py-1.5 rounded bg-slate-900 text-white disabled:opacity-50"
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          className="px-3 py-1.5 rounded bg-slate-200"
          onClick={() => {
            setCoin(bid.preferredStablecoin || 'USDC');
            setPrice(String(bid.priceUSD ?? ''));
            setDays(String(bid.days ?? ''));
            setNotes(bid.notes || '');
          }}
          disabled={saving}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// UPDATED: MilestonesSection with visibility toggle (defaults to closed)
function MilestonesSection({
  bid,
  canEdit,
  onUpdated,
}: {
  bid: any;
  canEdit: boolean;
  onUpdated: (b:any)=>void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // New state to collapse the list - defaults to false (closed)
  const [expanded, setExpanded] = useState(false);
  const milestones = useMemo(() => (Array.isArray(bid.milestones) ? bid.milestones : []), [bid?.milestones]);

  // Simple progress calc
  const completedCount = milestones.filter((m: any) => m.completed).length;
  const totalCount = milestones.length;

  return (
    <div className="bg-white rounded">
      <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
           <span className={`text-xs text-gray-400 transform transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
           <div className="text-sm font-bold text-gray-700">Milestones</div>
           <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
             {completedCount} / {totalCount} Completed
           </span>
        </div>
        {canEdit && editingIndex !== null && (
          <button
            className="text-xs underline text-rose-600"
            onClick={(e) => { e.stopPropagation(); setEditingIndex(null); }}
          >
            Cancel edit
          </button>
        )}
      </div>

      {expanded && (
        milestones.length === 0 ? (
          <div className="text-sm text-slate-500 pl-4">No milestones.</div>
        ) : (
          <ul className="space-y-2 pl-2 border-l-2 border-slate-100 ml-1">
            {milestones.map((m: any, i: number) => (
              <li key={i} className="rounded border p-3 bg-slate-50/50">
                {canEdit && editingIndex === i ? (
                  <MilestoneRowEditor
                    bidId={bid.bidId}
                    index={i}
                    value={m}
                    all={milestones}
                    onDone={(updated) => { onUpdated(updated); setEditingIndex(null); }}
                    onCancel={() => setEditingIndex(null)}
                  />
                ) : (
                  <MilestoneRowDisplay
                    m={m}
                    index={i}
                    canEdit={canEdit}
                    onEdit={() => canEdit && setEditingIndex(i)}
                  />
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function MilestoneRowDisplay({
  m, index, canEdit, onEdit,
}: {
  m: any; index: number; canEdit: boolean; onEdit: () => void;
}) {
  const desc = m?.notes ?? m?.desc ?? m?.description ?? '';

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-medium flex items-center gap-2">
          <span className="text-slate-500 text-sm">#{index + 1}</span>
          {m.name || `Milestone ${index + 1}`}
          {m.completed && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✅ Done</span>}
        </div>
        <div className="text-sm text-gray-600 mt-1">
          <span className="font-mono">${Number(m.amount).toLocaleString()}</span> <span className="text-gray-400">|</span> Due: {dateDisplay(m.dueDate)}
        </div>
        {desc && (
          <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap border-l-2 pl-2 border-slate-200">
            {desc}
          </p>
        )}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="text-xs px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
          title="Edit milestone"
        >
          Edit
        </button>
      )}
    </div>
  );
}


function MilestoneRowEditor({
  bidId, index, value, all, onDone, onCancel,
}: {
  bidId: number;
  index: number;
  value: any;
  all: any[];
  onDone: (updatedBid:any)=>void;
  onCancel: ()=>void;
}) {
  const [name, setName] = useState<string>(value?.name || `Milestone ${index + 1}`);
  const [amount, setAmount] = useState<string>(String(value?.amount ?? '0'));
  const [due, setDue] = useState<string>(toDateInput(value?.dueDate));
  const [completed, setCompleted] = useState<boolean>(!!value?.completed);
  const [saving, setSaving] = useState(false);

  async function save() {
    // Validate
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) { alert('Amount must be a non-negative number'); return; }
    if (!due) { alert('Due date is required'); return; }

    // Build new milestones array
    const next = all.map((m, i) => i === index
      ? {
          ...m,
          name: name || `Milestone ${index + 1}`,
          amount: amt,
          dueDate: new Date(due).toISOString(),
          completed,
        }
      : m
    );

    setSaving(true);
    try {
      // Persist via dedicated endpoint
      const updated = await api.updateBidMilestones(bidId, next);
      onDone(updated);
    } catch (e:any) {
      alert(e?.message || 'Failed to update milestone');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Name</label>
        <input
          className="border rounded px-2 py-1 text-sm w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Milestone ${index + 1}`}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Amount (USD)</label>
        <input
          type="number"
          className="border rounded px-2 py-1 text-sm w-40"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={0}
          step="0.01"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Due Date</label>
        <input
          type="date"
          className="border rounded px-2 py-1 text-sm w-48"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Completed</label>
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={completed}
          onChange={(e) => setCompleted(e.target.checked)}
        />
      </div>

      <div className="sm:col-span-2 flex gap-2">
        <button
          className="px-3 py-1.5 rounded bg-slate-900 text-white disabled:opacity-50"
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save milestone'}
        </button>
        <button
          className="px-3 py-1.5 rounded bg-slate-200"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function dateDisplay(d: any) {
  try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}

function toDateInput(d: any) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(+dt)) return '';
    // yyyy-mm-dd
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch { return ''; }
}
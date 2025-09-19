// src/app/admin/bids/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as api from '@/lib/api';
import Agent2Inline from '@/components/Agent2Inline';

export default function AdminBidDetailPage(props: { params?: { id: string } }) {
  const routeParams = useParams();
  const bidId = Number((props.params as any)?.id ?? (routeParams as any)?.id);

  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [proofs, setProofs] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [promptById, setPromptById] = useState<Record<number, string>>({});
  const [busyById, setBusyById] = useState<Record<number, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const b = await api.getBid(bidId);
        setBid(b);

        // fetch proposal context for Agent 2 chat
        const p = await api.getProposal(b.proposalId);
        setProposal(p);

        // admin-only list
        const pf = await api.getProofs(bidId);
        setProofs(pf);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load bid');
      } finally {
        setLoading(false);
      }
    })();
  }, [bidId]);

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

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Bid #{bidId}</h1>
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
          <h1 className="text-2xl font-semibold">Bid #{bidId}</h1>
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
        <h1 className="text-2xl font-semibold">Bid #{bidId}</h1>
        <Link href="/admin/bids" className="underline">← Back</Link>
      </div>

      {/* Bid summary */}
      <section className="rounded border p-4 bg-white">
        <div className="grid sm:grid-cols-2 gap-4">
          <Info label="Project" value={`#${bid.proposalId}`} />
          <Info label="Vendor" value={bid.vendorName} />
          <Info label="Price" value={`$${Number(bid.priceUSD).toLocaleString()} ${bid.preferredStablecoin}`} />
          <Info label="Timeline" value={`${bid.days} days`} />
          <div className="sm:col-span-2">
            <div className="text-sm text-gray-500">Notes</div>
            <div className="font-medium whitespace-pre-wrap">{bid.notes || '—'}</div>
          </div>
        </div>

        {/* Milestones quick view */}
        {ms.length > 0 && (
          <div className="mt-4">
            <div className="text-sm text-gray-500 mb-1">Milestones</div>
            <ul className="space-y-2">
              {ms.map((m: any, i: number) => (
                <li key={i} className="rounded border p-3">
                  <div className="font-medium">{m.name || `Milestone ${i + 1}`}</div>
                  <div className="text-sm text-gray-600">
                    Amount: ${m.amount} · Due: {new Date(m.dueDate).toLocaleDateString()}
                    {m.completed ? ' · Completed' : ''}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ✅ Agent 2 — inline analysis + Run + Ask Agent 2 (Chat) */}
      {proposal && (
        <section className="rounded border p-4 bg-white">
          <Agent2Inline bid={bid} proposal={proposal} />
        </section>
      )}

      {/* Proofs for this bid (with Agent 2 per-proof) */}
      <section className="rounded border p-4 bg-white">
        <h2 className="font-semibold mb-3">Submitted Proofs</h2>

        {proofs.length === 0 && (
          <div className="text-sm text-slate-500">No proofs submitted yet.</div>
        )}

        {proofs.map((p) => {
          const id = Number(p.proofId ?? p.id);
          const a = p.aiAnalysis ?? p.ai_analysis;

          return (
            <div key={id} className="rounded-lg border border-slate-200 p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {p.title || `Proof #${id}`} · Milestone {Number(p.milestoneIndex ?? p.milestone_index) + 1}
                </div>
                <span
                  className={`text-xs rounded px-2 py-0.5 border ${
                    p.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : p.status === 'rejected'
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  {p.status}
                </span>
              </div>

              {p.description && (
                <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{p.description}</p>
              )}

              {Array.isArray(p.files) && p.files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {p.files.map((f: any, i: number) => (
                    <li key={i} className="text-sm">
                      <a className="text-blue-600 hover:underline" href={f.url} target="_blank" rel="noreferrer">
                        {f.name || f.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 rounded-md bg-slate-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Agent 2 Analysis</div>
                </div>

                {a ? <AnalysisView a={a} /> : <div className="text-sm text-slate-600">No analysis yet for this proof.</div>}

                <div className="mt-3">
                  <textarea
                    value={promptById[id] || ''}
                    onChange={(e) => setPromptById((prev) => ({ ...prev, [id]: e.target.value }))}
                    className="w-full p-2 rounded border"
                    rows={3}
                    placeholder="Optional: add a prompt to re-run Agent 2 for this proof"
                  />
                  <div className="mt-2">
                    <button
                      onClick={() => runProofAnalysis(id)}
                      disabled={!!busyById[id]}
                      className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
                    >
                      {busyById[id] ? 'Analyzing…' : 'Run Agent 2'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function AnalysisView({ a }: { a: any }) {
  return (
    <div className="space-y-3">
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
          <span className="text-slate-500">PDF parsed: <b>{a.pdfUsed ? 'Yes' : 'No'}</b></span>
        )}
      </div>

      {a.summary && (
        <div>
          <div className="text-sm font-semibold mb-1">Summary</div>
          <p className="whitespace-pre-line text-sm leading-relaxed">{a.summary}</p>
        </div>
      )}

      {Array.isArray(a.risks) && a.risks.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-1">Risks</div>
          <ul className="list-disc list-inside text-sm space-y-1">
            {a.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {Array.isArray(a.milestoneNotes) && a.milestoneNotes.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-1">Milestone Notes</div>
          <ul className="list-disc list-inside text-sm space-y-1">
            {a.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}
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

'use client';

import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import Agent2PromptBox from '@/components/Agent2PromptBox';

export default function VendorBidDetailPage({ params }: { params: { id: string } }) {
  const bidId = Number(params.id);
  const [bid, setBid] = useState<any>(null);
  const [err, setErr] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const b = await api.getBid(bidId);
      setBid(b);
    } catch (e:any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (Number.isFinite(bidId)) load(); }, [bidId]);

  if (!Number.isFinite(bidId)) return <div>Invalid bid id.</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-semibold">Bid #{bidId}</h1>

      {loading && <div>Loading…</div>}
      {err && <div className="text-rose-700">{err}</div>}

      {bid && (
        <>
          <div className="rounded-xl border p-4">
            <div className="text-sm text-slate-500">Proposal #{bid.proposalId}</div>
            <div className="mt-1 font-medium">{bid.vendorName}</div>
            <div className="mt-2 text-sm">
              <span className="font-medium">Price:</span> ${bid.priceUSD.toLocaleString()} ·{' '}
              <span className="font-medium">Days:</span> {bid.days} ·{' '}
              <span className="font-medium">Status:</span> {bid.status}
            </div>
          </div>

          {/* Agent 2 analysis */}
          <div className="rounded-xl border p-4">
            <div className="font-semibold mb-1">Agent 2 Analysis</div>
            <div className="prose max-w-none whitespace-pre-wrap">
              {bid.aiAnalysis?.summary || 'No analysis yet.'}
            </div>
            <div className="mt-2 text-sm text-slate-600">
              Fit: {bid.aiAnalysis?.fit ?? '—'} · Confidence:{' '}
              {Math.round(((bid.aiAnalysis?.confidence ?? 0) * 100))}%
            </div>

            {!!(bid.aiAnalysis?.risks?.length) && (
              <div className="mt-3">
                <div className="font-medium">Risks</div>
                <ul className="list-disc ml-6">
                  {bid.aiAnalysis.risks.map((r:string, i:number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {!!(bid.aiAnalysis?.milestoneNotes?.length) && (
              <div className="mt-3">
                <div className="font-medium">Milestone Notes</div>
                <ul className="list-disc ml-6">
                  {bid.aiAnalysis.milestoneNotes.map((m:string, i:number) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-3 text-xs text-slate-500">
              PDF parsed: {bid.aiAnalysis?.pdfUsed ? 'Yes' : 'No'}
              {bid.aiAnalysis?.pdfDebug?.name ? <> · File: {bid.aiAnalysis.pdfDebug.name}</> : null}
            </div>
          </div>

          {/* Interactive prompt box (vendor can clarify/re-run if allowed) */}
          <Agent2PromptBox bidId={bidId} onAfter={(updated:any) => setBid(updated)} />
        </>
      )}
    </div>
  );
}

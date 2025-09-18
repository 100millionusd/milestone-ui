'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import * as api from '@/lib/api';
import Agent2PromptBox from '@/components/Agent2PromptBox';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

type Loaded = 'idle' | 'loading' | 'ready' | 'error';

export default function VendorBidDetailPage() {
  const params = useParams<{ id: string }>();
  const bidId = Number(params?.id);
  const router = useRouter();
  const { address } = useWeb3Auth();

  const [status, setStatus] = useState<Loaded>('loading');
  const [error, setError] = useState<string | null>(null);
  const [bid, setBid] = useState<any>(null);
  const [genBusy, setGenBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!Number.isFinite(bidId)) {
        setError('Invalid bid id');
        setStatus('error');
        return;
      }
      try {
        setStatus('loading');
        const b = await api.getBid(bidId);
        setBid(b);
        setStatus('ready');
      } catch (e: any) {
        setError(e?.message || 'Failed to load bid');
        setStatus('error');
      }
    })();
  }, [bidId]);

  const isOwner = useMemo(() => {
    if (!bid?.walletAddress || !address) return false;
    return bid.walletAddress.toLowerCase() === address.toLowerCase();
  }, [bid, address]);

  function onAfterAnalyze(updated: any) {
    setBid(updated);
  }

  async function generateDefaultAnalysis() {
    try {
      setGenBusy(true);
      const updated = await api.analyzeBid(bidId); // no prompt -> default
      setBid(updated);
    } catch (e: any) {
      alert(e?.message || 'Failed to run Agent 2');
    } finally {
      setGenBusy(false);
    }
  }

  if (status === 'loading') {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">My Bid #{bidId}</h1>
          <Link href="/vendor/dashboard" className="underline">← Back</Link>
        </div>
        <div className="py-20 text-center text-gray-500">Loading…</div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">My Bid #{bidId}</h1>
          <Link href="/vendor/dashboard" className="underline">← Back</Link>
        </div>
        <div className="p-4 rounded border bg-rose-50 text-rose-700">
          {error}
        </div>
      </main>
    );
  }

  const analysis = bid?.aiAnalysis || null;
  const ms = Array.isArray(bid?.milestones) ? bid.milestones : [];

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Bid #{bidId}</h1>
        <Link href="/vendor/dashboard" className="underline">← Back</Link>
      </div>

      {/* Bid Summary */}
      <section className="rounded border bg-white p-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Project</div>
            <div className="font-medium">#{bid.proposalId}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Vendor</div>
            <div className="font-medium">{bid.vendorName}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Price</div>
            <div className="font-medium">
              ${bid.priceUSD} {bid.preferredStablecoin}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Timeline</div>
            <div className="font-medium">{bid.days} days</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-sm text-gray-500">Notes</div>
            <div className="font-medium whitespace-pre-wrap">{bid.notes || '—'}</div>
          </div>
        </div>

        {/* Milestones */}
        <div className="mt-4">
          <div className="text-sm text-gray-500 mb-1">Milestones</div>
          <ul className="space-y-2">
            {ms.map((m: any, i: number) => (
              <li key={i} className="rounded border p-3">
                <div className="font-medium">{m.name}</div>
                <div className="text-sm text-gray-600">
                  Amount: ${m.amount} · Due: {new Date(m.dueDate).toLocaleDateString()}
                  {m.completed ? ' · Completed' : ''}
                </div>
                {m.proof && (
                  <div className="text-sm text-gray-500 mt-1">Proof: {m.proof}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Agent 2 Analysis */}
      <section className="rounded border bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Agent 2 Analysis</h2>
          {!analysis && isOwner && (
            <button
              onClick={generateDefaultAnalysis}
              disabled={genBusy}
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-50"
            >
              {genBusy ? 'Generating…' : 'Generate Analysis'}
            </button>
          )}
        </div>

        {!analysis && (
          <div className="text-sm text-gray-500">
            No analysis yet. Generate a default analysis or run with a custom prompt below.
          </div>
        )}

        {analysis && (
          <div className="space-y-3">
            {analysis.summary && (
              <div>
                <div className="text-sm text-gray-500 mb-1">Summary</div>
                <div className="whitespace-pre-wrap">{analysis.summary}</div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 text-sm">
              <span className="px-2 py-1 rounded bg-slate-100">
                Fit: <strong>{analysis.fit}</strong>
              </span>
              {'confidence' in analysis && (
                <span className="px-2 py-1 rounded bg-slate-100">
                  Confidence: <strong>{Math.round((analysis.confidence ?? 0) * 100)}%</strong>
                </span>
              )}
              {'pdfUsed' in analysis && (
                <span className="px-2 py-1 rounded bg-slate-100">
                  PDF parsed: <strong>{analysis.pdfUsed ? 'Yes' : 'No'}</strong>
                </span>
              )}
            </div>

            {Array.isArray(analysis.risks) && analysis.risks.length > 0 && (
              <div>
                <div className="text-sm text-gray-500 mb-1">Risks</div>
                <ul className="list-disc pl-5 space-y-1">
                  {analysis.risks.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(analysis.milestoneNotes) && analysis.milestoneNotes.length > 0 && (
              <div>
                <div className="text-sm text-gray-500 mb-1">Milestone Notes</div>
                <ul className="list-disc pl-5 space-y-1">
                  {analysis.milestoneNotes.map((m: string, i: number) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* debug line, optional */}
            {analysis.pdfDebug?.name && (
              <div className="text-xs text-slate-500">
                File: {analysis.pdfDebug.name}
              </div>
            )}
          </div>
        )}

        {/* Vendor can interact with Agent 2 iff they own the bid */}
        {isOwner ? (
          <Agent2PromptBox bidId={bidId} onAfter={onAfterAnalyze} />
        ) : (
          <div className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            You can view the analysis, but only the bid owner can send prompts to Agent 2.
          </div>
        )}
      </section>
    </main>
  );
}

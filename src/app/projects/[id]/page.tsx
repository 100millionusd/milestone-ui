// src/app/projects/[id]/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids } from '@/lib/api';

const GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

type AnalysisV2 = {
  status?: 'ready' | 'error' | string;
  summary?: string;
  fit?: 'low' | 'medium' | 'high';
  risks?: string[];
  milestoneNotes?: string[];
  confidence?: number;
  pdfUsed?: boolean;
  pdfDebug?: any;
};

type AnalysisV1 = {
  verdict?: string;
  reasoning?: string;
  suggestions?: string[];
  status?: 'ready' | 'error' | string;
};

function coerceAnalysis(a: any): AnalysisV2 & AnalysisV1 | null {
  if (!a) return null;
  if (typeof a === 'string') {
    try { return JSON.parse(a); } catch { return null; }
  }
  return a;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectIdNum = useMemo(() => Number((params as any)?.id), [params]);

  const [project, setProject] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPoll = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  // Initial fetch
  useEffect(() => {
    let active = true;
    if (!Number.isFinite(projectIdNum)) return;
    (async () => {
      try {
        const [projectData, bidsData] = await Promise.all([
          getProposal(projectIdNum),
          getBids(projectIdNum),
        ]);
        if (!active) return;
        setProject(projectData);
        setBids(bidsData);
      } catch (e) {
        console.error('Error fetching project:', e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [projectIdNum]);

  // Poll bids until all analyses are terminal (ready/error) or 90s passes
  useEffect(() => {
    if (!Number.isFinite(projectIdNum)) return;
    let stopped = false;
    const start = Date.now();

    const needsMore = (rows: any[]) => {
      return rows.some((b) => {
        const a = coerceAnalysis(b?.aiAnalysis ?? b?.ai_analysis);
        return !a || (a.status && a.status !== 'ready' && a.status !== 'error');
      });
    };

    const tick = async () => {
      try {
        const next = await getBids(projectIdNum);
        if (stopped) return;
        setBids(next);
        if (Date.now() - start < 90_000 && needsMore(next)) {
          pollTimer.current = setTimeout(tick, 1500);
        } else {
          clearPoll();
        }
      } catch {
        if (Date.now() - start < 90_000) {
          pollTimer.current = setTimeout(tick, 2000);
        } else {
          clearPoll();
        }
      }
    };

    if (needsMore(bids)) {
      clearPoll();
      pollTimer.current = setTimeout(tick, 1500);
    }

    const onFocus = () => {
      if (needsMore(bids)) {
        clearPoll();
        pollTimer.current = setTimeout(tick, 0);
      }
    };
    window.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);

    return () => {
      stopped = true;
      clearPoll();
      window.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [projectIdNum, bids]);

  if (loading) return <div>Loading project...</div>;
  if (!project) return <div>Project not found</div>;

  const isProjectCompleted = (project: any, bids: any[]) => {
    if (project.status === 'completed') return true;
    const acceptedBid = bids.find((b: any) => b.status === 'approved');
    if (!acceptedBid) return false;
    if (!acceptedBid.milestones || acceptedBid.milestones.length === 0) return false;
    return acceptedBid.milestones.every((m: any) => m.completed === true);
  };

  const completed = isProjectCompleted(project, bids);

  const renderAttachment = (doc: any, idx: number) => {
    if (!doc) return null;
    const href = doc.url || (doc.cid ? `${GATEWAY}/${doc.cid}` : '#');
    const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(doc.name || href);

    if (isImage) {
      return (
        <button key={idx} onClick={() => setLightbox(href)} className="group relative overflow-hidden rounded border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={doc.name} className="h-24 w-24 object-cover group-hover:scale-105 transition" />
        </button>
      );
    }

    return (
      <div key={idx} className="p-2 rounded border bg-gray-50 text-xs text-gray-700">
        <p className="truncate">{doc.name}</p>
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open</a>
      </div>
    );
  };

  const renderAnalysis = (raw: any) => {
    const analysis = coerceAnalysis(raw);
    const isPending = !analysis || (analysis.status && analysis.status !== 'ready' && analysis.status !== 'error');

    if (isPending) return <p className="mt-2 text-xs text-gray-400 italic">⏳ Analysis pending…</p>;
    if (!analysis) return <p className="mt-2 text-xs text-gray-400 italic">No analysis.</p>;

    const isV2 = analysis.summary || analysis.fit || analysis.risks || analysis.confidence || analysis.milestoneNotes;
    const isV1 = analysis.verdict || analysis.reasoning || analysis.suggestions;

    return (
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-sm mb-1">Agent 2 Analysis</h4>

        {isV2 && (
          <>
            {analysis.summary && <p className="text-sm mb-1">{analysis.summary}</p>}
            <div className="text-sm">
              {analysis.fit && (<><span className="font-medium">Fit:</span> {String(analysis.fit)} </>)}
              {typeof analysis.confidence === 'number' && (
                <><span className="mx-1">·</span><span className="font-medium">Confidence:</span> {Math.round(analysis.confidence * 100)}%</>
              )}
            </div>
            {Array.isArray(analysis.risks) && analysis.risks.length > 0 && (
              <div className="mt-2">
                <div className="font-medium text-sm">Risks</div>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {analysis.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {Array.isArray(analysis.milestoneNotes) && analysis.milestoneNotes.length > 0 && (
              <div className="mt-2">
                <div className="font-medium text-sm">Milestone Notes</div>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {analysis.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
            {/* ✅ Expanded PDF Debug Info */}
            {typeof analysis.pdfUsed === 'boolean' && (
              <div className="mt-3 text-[11px] text-gray-600 space-y-1">
                <div>PDF parsed: {analysis.pdfUsed ? 'Yes' : 'No'}</div>
                {analysis.pdfDebug?.url && (
                  <div>
                    File:{" "}
                    <a href={analysis.pdfDebug.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                      {analysis.pdfDebug.name || "open"}
                    </a>
                  </div>
                )}
                {analysis.pdfDebug?.bytes !== undefined && <div>Bytes: {analysis.pdfDebug.bytes}</div>}
                {analysis.pdfDebug?.first5 && <div>First bytes: {analysis.pdfDebug.first5}</div>}
                {analysis.pdfDebug?.reason && <div>Reason: {analysis.pdfDebug.reason}</div>}
                {analysis.pdfDebug?.error && <div className="text-rose-600">Error: {analysis.pdfDebug.error}</div>}
              </div>
            )}
          </>
        )}

        {isV1 && (
          <div className={isV2 ? 'mt-3 pt-3 border-t border-blue-100' : ''}>
            {analysis.verdict && (<p className="text-sm"><span className="font-medium">Verdict:</span> {analysis.verdict}</p>)}
            {analysis.reasoning && (<p className="text-sm"><span className="font-medium">Reasoning:</span> {analysis.reasoning}</p>)}
            {Array.isArray(analysis.suggestions) && analysis.suggestions.length > 0 && (
              <ul className="list-disc list-inside mt-1 text-sm text-gray-700">
                {analysis.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>
        )}

        {!isV1 && !isV2 && <p className="text-xs text-gray-500 italic">Unknown analysis format.</p>}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-between mb-4">
  <h1 className="text-2xl font-bold">{proposal.title}</h1>
  <Link
    href={`/proposals/${projectIdNum}/edit`}
    className="px-3 py-1 rounded bg-indigo-600 text-white text-sm"
  >
    Edit
  </Link>
</div>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${completed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {completed ? 'Completed' : 'Active'}
            </span>
          </div>
          <p className="text-gray-600">{project.orgName}</p>
          <p className="text-green-600 font-medium text-lg">Budget: ${project.amountUSD}</p>
        </div>
        {!completed && (
          <Link href={`/bids/new?proposalId=${projectIdNum}`} className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
            Submit Bid
          </Link>
        )}
      </div>

      {/* ✅ Project Description */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Project Description</h2>
        <p className="text-gray-700">{project.summary}</p>
      </div>

      {/* ✅ Project Attachments */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Project Attachments</h2>
        {project.docs?.length > 0 ? (
          <div className="flex flex-wrap gap-3">{project.docs.map((doc: any, i: number) => renderAttachment(doc, i))}</div>
        ) : (
          <p className="text-sm text-gray-500">No attachments provided.</p>
        )}
      </div>

      {/* ✅ Bids */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Bids ({bids.length})</h2>
        {bids.length > 0 ? (
          <div className="space-y-3">
            {bids.map((bid) => {
              const docs = (bid.docs || (bid.doc ? [bid.doc] : [])).filter(Boolean);
              const analysisRaw = bid.aiAnalysis ?? bid.ai_analysis ?? null;

              return (
                <div key={bid.bidId} className="border p-4 rounded">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{bid.vendorName}</h3>
                      <p className="text-gray-600">${bid.priceUSD} • {bid.days} days</p>
                      <p className="text-sm text-gray-500">{bid.notes}</p>

                      {docs.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">{docs.map((d: any, i: number) => renderAttachment(d, i))}</div>
                      ) : (
                        <p className="text-xs text-gray-400 mt-2">No attachments</p>
                      )}

                      {renderAnalysis(analysisRaw)}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      bid.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : bid.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>{bid.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500">No bids yet. Be the first to bid on this project!</p>
        )}
      </div>

      <Link href="/projects" className="text-blue-600 hover:underline">← Back to Projects</Link>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="attachment preview" className="max-h-full max-w-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button className="absolute top-4 right-4 text-white text-2xl" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as api from '@/lib/api';

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

type Props = {
  open: boolean;
  step: Step;
  message?: string | null;
  onClose: () => void;

  // Optional: parent-provided analysis (object or JSON string)
  analysis?: any | null;

  // Optional: if provided, the modal will poll the server for analysis when open
  bidId?: number | null;
};

export default function Agent2ProgressModal({
  open,
  step,
  message,
  onClose,
  analysis,
  bidId,
}: Props) {
  // Local state (for polled analysis + errors)
  const [fetchedAnalysis, setFetchedAnalysis] = useState<any | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Parse parent-provided analysis if it’s a string
  const analysisFromProp = useMemo(() => {
    if (!analysis) return null;
    if (typeof analysis === 'string') {
      try {
        return JSON.parse(analysis);
      } catch {
        return null;
      }
    }
    return analysis;
  }, [analysis]);

  // Prefer parent-provided analysis; otherwise use polled one
  const data = analysisFromProp ?? fetchedAnalysis ?? null;

  // Treat analysis presence as "ready" (even if status === "error")
  const ready = !!data;

  // Compute effective step (so UI reflects error/ready even if parent step lags)
  const effectiveStep: Step = useMemo(() => {
    if (!ready) return step;
    if (data?.status === 'error') return 'error';
    return step === 'analyzing' ? 'done' : step;
  }, [ready, step, data?.status]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // One-shot fetch for a bid
  const fetchOnce = useCallback(async () => {
    if (!bidId) return;
    try {
      const bid = await (api as any).getBid(bidId);
      const a = bid?.aiAnalysis ?? bid?.ai_analysis ?? null;
      if (a) setFetchedAnalysis(a);
      setErrMsg(null);
    } catch (e: any) {
      setErrMsg(String(e?.message ?? e));
    }
  }, [bidId]);

  // Start polling when modal opens without analysis yet
  useEffect(() => {
    if (!open) {
      clearTimer();
      return;
    }
    if (!ready && bidId && !timerRef.current) {
      // Seed immediately, then poll
      fetchOnce();
      timerRef.current = setInterval(fetchOnce, 1500);
    }
    return () => clearTimer();
  }, [open, ready, bidId, fetchOnce]);

  // Stop polling once we have analysis
  useEffect(() => {
    if (ready) clearTimer();
  }, [ready]);

  // Manual retry button: POST /bids/:id/analyze then fetch
  const retryAnalysis = useCallback(async () => {
    if (!bidId) return;
    try {
      setRetrying(true);
      await (api as any).analyzeBid(bidId);
      await fetchOnce();
      // If still not ready, keep polling
      if (!ready && !timerRef.current) {
        timerRef.current = setInterval(fetchOnce, 1500);
      }
    } catch (e: any) {
      setErrMsg(`Retry failed: ${String(e?.message ?? e)}`);
    } finally {
      setRetrying(false);
    }
  }, [bidId, fetchOnce, ready]);

  const statusColor =
    effectiveStep === 'error' ? 'text-rose-700' :
    effectiveStep === 'done' ? 'text-emerald-700' :
    'text-slate-700';

  const stepBadge = (active: boolean, label: string) => (
    <div className="flex items-center gap-2">
      <span
        className={[
          'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
          active ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700',
        ].join(' ')}
      >
        {active ? '✓' : '•'}
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );

  if (!open) return null;

  // -------- Renderers for Agent2 V1 (verdict/reasoning) and V2 (fit/summary) --------
  const AnalysisBlock = ({ a }: { a: any }) => {
    if (!a) return null;
    const isV1 = 'verdict' in a || 'reasoning' in a || 'suggestions' in a;
    const isV2 = 'fit' in a || 'summary' in a || 'risks' in a || 'confidence' in a || 'milestoneNotes' in a;

    return (
      <div className="mt-4 border rounded-xl p-4 bg-slate-50 text-sm">
        <div className="font-medium">Agent2 — Summary</div>

        {/* V2 fields */}
        {isV2 && (
          <>
            {a.summary ? (
              <p className="mt-1 whitespace-pre-wrap">{a.summary}</p>
            ) : (
              <p className="mt-1 text-slate-500">No summary provided.</p>
            )}
            <div className="mt-2">
              <span className="font-medium">Fit:</span> {String(a.fit ?? '—')}
              <span className="mx-2">·</span>
              <span className="font-medium">Confidence:</span>{' '}
              {typeof a.confidence === 'number'
                ? `${Math.round(a.confidence * 100)}%`
                : '—'}
            </div>
            {Array.isArray(a.risks) && a.risks.length > 0 && (
              <div className="mt-2">
                <div className="font-medium">Risks</div>
                <ul className="list-disc pl-5">
                  {a.risks.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(a.milestoneNotes) && a.milestoneNotes.length > 0 && (
              <div className="mt-2">
                <div className="font-medium">Milestone Notes</div>
                <ul className="list-disc pl-5">
                  {a.milestoneNotes.map((m: string, i: number) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* V1 fields */}
        {isV1 && (
          <>
            <div className="mt-4 border-t pt-3">
              <div className="text-sm opacity-70">Agent2 (V1)</div>
              {'verdict' in a && (
                <div className="text-base font-semibold">Verdict: {a.verdict}</div>
              )}
              {'reasoning' in a && (
                <p className="mt-1 whitespace-pre-wrap">{a.reasoning}</p>
              )}
              {Array.isArray(a.suggestions) && a.suggestions.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Suggestions</div>
                  <ul className="list-disc pl-5">
                    {a.suggestions.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* PDF debug (useful during integration) */}
        {a?.pdfUsed !== undefined && (
          <div className="mt-3 text-xs text-slate-500">
            <div>
              PDF used: <b>{String(a.pdfUsed)}</b>
              {a.pdfChars ? ` (${a.pdfChars} chars)` : ''}
            </div>
            {a.pdfDebug?.reason && <div>reason: {a.pdfDebug.reason}</div>}
            {a.pdfDebug?.error && <div>error: {a.pdfDebug.error}</div>}
          </div>
        )}

        {!isV1 && !isV2 && (
          <p className="mt-1 text-slate-500">Analysis format not recognized.</p>
        )}
      </div>
    );
  };

  const showProgressBar =
    (effectiveStep === 'submitting' || effectiveStep === 'analyzing') && !ready;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">Submitting Bid · Agent2 Checking</h3>
          <button
            className="text-slate-500 hover:text-slate-900"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-3">
            {stepBadge(effectiveStep !== 'submitting', 'Submitting your bid')}
            {stepBadge(
              effectiveStep === 'done' ||
                effectiveStep === 'error' ||
                effectiveStep === 'analyzing',
              'Agent2 analyzing',
            )}
            {stepBadge(ready || effectiveStep === 'done', 'Analysis ready')}
          </div>

          <div className={`mt-2 text-sm ${statusColor}`}>
            {message ||
              (effectiveStep === 'submitting'
                ? 'Sending your bid...'
                : effectiveStep === 'analyzing'
                ? 'Agent2 is checking your milestones, timeline, and pricing...'
                : effectiveStep === 'done'
                ? ready
                  ? 'Analysis complete.'
                  : 'Finalizing analysis…'
                : 'Something went wrong.')}
          </div>

          {showProgressBar && (
            <div className="mt-2 w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-2 w-1/2 animate-pulse bg-slate-900 rounded-full" />
            </div>
          )}

          {ready && <AnalysisBlock a={data} />}

          {!ready && (effectiveStep === 'analyzing' || effectiveStep === 'done') && (
            <div className="flex items-center justify-between">
              <div className="mt-2 text-sm text-slate-500">⏳ Analysis pending…</div>
              {bidId ? (
                <button
                  onClick={retryAnalysis}
                  className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-50"
                  disabled={retrying}
                  title="Re-run Agent2 analysis"
                >
                  {retrying ? 'Re-checking…' : 'Retry analysis'}
                </button>
              ) : null}
            </div>
          )}

          {errMsg && <div className="text-sm text-rose-700">{errMsg}</div>}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
            onClick={onClose}
            disabled={effectiveStep === 'submitting' || (effectiveStep === 'analyzing' && !ready)}
          >
            {effectiveStep === 'error'
              ? 'Dismiss'
              : ready || effectiveStep === 'done'
              ? 'Close'
              : 'Running…'}
          </button>
        </div>
      </div>
    </div>
  );
}

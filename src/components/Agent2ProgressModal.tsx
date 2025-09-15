'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as api from '@/lib/api';

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

type Props = {
  open: boolean;
  step: Step;
  message?: string | null;
  onClose: () => void;
  analysis?: any | null;
  bidId?: number;
};

export default function Agent2ProgressModal({
  open,
  step,
  message,
  onClose,
  analysis,
  bidId,
}: Props) {
  const [fetchedAnalysis, setFetchedAnalysis] = useState<any | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const analysisFromProp = useMemo(() => {
    if (!analysis) return null;
    if (typeof analysis === 'string') {
      try { return JSON.parse(analysis); } catch { return null; }
    }
    return analysis;
  }, [analysis]);

  const data = analysisFromProp ?? fetchedAnalysis ?? null;
  const ready = !!data;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

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

  useEffect(() => {
    if (!open) { clearTimer(); return; }
    if (!ready && bidId && !timerRef.current) {
      fetchOnce();
      timerRef.current = setInterval(fetchOnce, 1500);
    }
    return () => { clearTimer(); };
  }, [open, ready, bidId, fetchOnce]);

  useEffect(() => {
    if (ready) clearTimer();
  }, [ready]);

  const retryAnalysis = useCallback(async () => {
    if (!bidId) return;
    try {
      setRetrying(true);
      await (api as any).analyzeBid(bidId);
      await fetchOnce();
      if (!ready && !timerRef.current) {
        timerRef.current = setInterval(fetchOnce, 1500);
      }
    } catch (e: any) {
      setErrMsg(`Retry failed: ${String(e?.message ?? e)}`);
    } finally {
      setRetrying(false);
    }
  }, [bidId, fetchOnce, ready]);

  const AnalysisBlock = ({ a }: { a: any }) => {
    if (!a) return null;

    const isV2 = 'summary' in a || 'fit' in a || 'risks' in a || 'confidence' in a || 'milestoneNotes' in a;
    const isV1 = 'verdict' in a || 'reasoning' in a || 'suggestions' in a;

    return (
      <div className="mt-4 border rounded-xl p-4 bg-slate-50 text-sm">
        <div className="font-medium">Agent2 — Summary</div>

        {isV2 && (
          <>
            {a.summary && <p className="mt-1 whitespace-pre-wrap">{a.summary}</p>}
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
                  {a.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {Array.isArray(a.milestoneNotes) && a.milestoneNotes.length > 0 && (
              <div className="mt-2">
                <div className="font-medium">Milestone Notes</div>
                <ul className="list-disc pl-5">
                  {a.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}

            {/* ✅ PDF info */}
            {typeof a.pdfUsed === 'boolean' && (
              <div className="mt-2 text-xs text-gray-600">
                PDF parsed: {a.pdfUsed ? 'Yes' : 'No'}
                {a.pdfDebug?.reason && (
                  <span> (reason: {a.pdfDebug.reason})</span>
                )}
              </div>
            )}
          </>
        )}

        {isV1 && (
          <div className={isV2 ? 'mt-3 pt-3 border-t border-slate-200' : ''}>
            {a.verdict && (
              <p>
                <span className="font-medium">Verdict:</span> {a.verdict}
              </p>
            )}
            {a.reasoning && (
              <p className="mt-1 whitespace-pre-wrap">{a.reasoning}</p>
            )}
            {Array.isArray(a.suggestions) && a.suggestions.length > 0 && (
              <div className="mt-2">
                <div className="font-medium">Suggestions</div>
                <ul className="list-disc pl-5">
                  {a.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {!isV1 && !isV2 && (
          <p className="mt-1 text-slate-500">Analysis format not recognized.</p>
        )}
      </div>
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">Submitting Bid · Agent2 Checking</h3>
          <button className="text-slate-500 hover:text-slate-900" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="mt-4 space-y-3">
          {!ready && <div className="text-sm text-slate-500">⏳ Analysis pending…</div>}
          {ready && <AnalysisBlock a={data} />}
          {errMsg && <div className="text-sm text-rose-700">{errMsg}</div>}
          {bidId && !ready && (
            <button
              onClick={retryAnalysis}
              className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-50"
              disabled={retrying}
            >
              {retrying ? 'Re-checking…' : 'Retry analysis'}
            </button>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
            onClick={onClose}
            disabled={step === 'submitting' || (step === 'analyzing' && !ready)}
          >
            {(ready || step === 'done') && step !== 'error' ? 'Close' : 'Running…'}
          </button>
        </div>
      </div>
    </div>
  );
}

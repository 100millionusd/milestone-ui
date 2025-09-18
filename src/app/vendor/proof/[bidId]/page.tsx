// src/app/vendor/proof/[bidId]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import * as api from '@/lib/api';

type Loaded = 'idle' | 'loading' | 'ready' | 'error';
type ProofFile = { file: File; previewUrl?: string };

export default function VendorProofPage() {
  const params = useParams<{ bidId: string }>();
  const router = useRouter();
  const bidId = Number(params?.bidId);

  const [bid, setBid] = useState<any>(null);
  const [loadState, setLoadState] = useState<Loaded>('loading');
  const [err, setErr] = useState<string>('');

  // compose proof
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<ProofFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // created proof + analysis (returned from server)
  const [proof, setProof] = useState<any | null>(null);
  const analysis = proof?.aiAnalysis || proof?.ai_analysis || null;

  // re-run Agent2 on this proof
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(bidId)) {
      setErr('Invalid bid id');
      setLoadState('error');
      return;
    }
    (async () => {
      try {
        setLoadState('loading');
        const b = await api.getBid(bidId);
        setBid(b);
        setLoadState('ready');
      } catch (e: any) {
        setErr(e?.message || 'Failed to load bid');
        setLoadState('error');
      }
    })();
  }, [bidId]);

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    const next = picked.map((file) => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setFiles((prev) => [...prev, ...next]);
    e.currentTarget.value = '';
  }
  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submitProof() {
    if (!desc.trim() && files.length === 0) {
      setErr('Please add a description or upload at least one file.');
      return;
    }
    setSubmitting(true);
    setErr('');
    try {
      // NEW: use proofs API (runs Agent2 inline on description + PDFs)
      const created = await api.submitProof(bidId, desc, files.map((f) => f.file));
      setProof(created);
      // optional: clear form
      setFiles([]);
      setDesc('');
    } catch (e: any) {
      setErr(e?.message || 'Failed to submit proof');
    } finally {
      setSubmitting(false);
    }
  }

  async function runAgent2() {
    if (!proof?.proofId && !proof?.id) return;
    setBusy(true);
    setRunErr(null);
    try {
      const updated = await api.analyzeProof(proof.proofId ?? proof.id, prompt.trim() || undefined);
      setProof(updated); // contains updated ai_analysis
    } catch (e: any) {
      setRunErr(e?.message || 'Failed to run Agent 2');
    } finally {
      setBusy(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center text-slate-600">Loading…</div>
    );
  }
  if (loadState === 'error' || !bid) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="max-w-md bg-white rounded-xl border p-6 text-center">
          <div className="text-rose-600 font-semibold mb-2">Error</div>
          <div className="text-slate-700 mb-4">{err || 'Bid not found.'}</div>
          <Link href="/vendor/dashboard" className="underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Submit Proof — Bid #{bid.bidId}</h1>
        <Link href="/vendor/dashboard" className="underline">← Back</Link>
      </div>

      {/* Bid quick facts */}
      <section className="rounded-xl border bg-white p-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Info label="Project" value={`#${bid.proposalId}`} />
          <Info label="Vendor" value={bid.vendorName} />
          <Info label="Payment" value={`${bid.preferredStablecoin} → ${bid.walletAddress}`} />
          <Info label="Your Bid" value={`$${bid.priceUSD}`} />
        </div>
      </section>

      {/* Submit proof (only if we don't have one just created) */}
      {!proof && (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold mb-3">Your Proof</h2>

          <label className="block text-sm text-slate-600 mb-1">Description</label>
          <textarea
            className="w-full min-h-28 rounded-lg border p-3 mb-4"
            placeholder="Describe the work completed. Add links, context, etc."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />

          <label className="block text-sm text-slate-600 mb-1">Files (images / PDFs)</label>
          <input type="file" multiple accept="image/*,.pdf" onChange={onPickFiles} />
          {files.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {files.map((f, i) => (
                <div key={i} className="rounded border p-2">
                  {f.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.previewUrl} alt={f.file.name} className="h-24 w-full object-cover rounded" />
                  ) : (
                    <div className="h-24 grid place-items-center text-xs text-slate-500 bg-slate-50 rounded">
                      {f.file.name}
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="truncate">{f.file.name}</span>
                    <button onClick={() => removeFile(i)} className="text-rose-600 hover:underline">remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {err && <div className="mt-3 text-sm text-rose-700">{err}</div>}

          <div className="mt-4">
            <button
              onClick={submitProof}
              disabled={submitting}
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Proof'}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              After submitting, Agent 2 will analyze your description and any PDFs. You can refine with a custom prompt below.
            </p>
          </div>
        </section>
      )}

      {/* After submit: show analysis + prompt to re-run */}
      {proof && (
        <section className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Agent 2 Analysis (Proof #{proof.proofId ?? proof.id})</h2>
            <div className="text-sm text-slate-600">Admin sees this before paying.</div>
          </div>

          {!analysis && <div className="text-sm text-slate-600">No analysis yet.</div>}

          {analysis && (
            <div className="space-y-3 rounded-lg border bg-slate-50 p-3 mb-4">
              {analysis.summary && (
                <div>
                  <div className="text-sm text-slate-500 mb-1">Summary</div>
                  <p className="whitespace-pre-wrap">{analysis.summary}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-3 text-sm">
                {'fit' in analysis && (
                  <span className="px-2 py-1 rounded bg-white border">Fit: <b>{analysis.fit}</b></span>
                )}
                {'confidence' in analysis && (
                  <span className="px-2 py-1 rounded bg-white border">
                    Confidence: <b>{Math.round((analysis.confidence ?? 0) * 100)}%</b>
                  </span>
                )}
                {'pdfUsed' in analysis && (
                  <span className="px-2 py-1 rounded bg-white border">
                    PDF parsed: <b>{analysis.pdfUsed ? 'Yes' : 'No'}</b>
                  </span>
                )}
              </div>
              {Array.isArray(analysis.risks) && analysis.risks.length > 0 && (
                <div>
                  <div className="text-sm text-slate-500 mb-1">Risks</div>
                  <ul className="list-disc pl-5 space-y-1">
                    {analysis.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(analysis.milestoneNotes) && analysis.milestoneNotes.length > 0 && (
                <div>
                  <div className="text-sm text-slate-500 mb-1">Notes</div>
                  <ul className="list-disc pl-5 space-y-1">
                    {analysis.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Prompt to re-run Agent 2 on this proof */}
          <div className="mt-2">
            <div className="font-semibold mb-2">Custom Prompt</div>
            <textarea
              className="w-full min-h-28 rounded-lg border p-3 text-sm"
              placeholder={`Optional. Use {{CONTEXT}} to inject proof text + PDF extracts.\nExample:\n"Check if the delivered scope matches the milestone. {{CONTEXT}}"\n(Leave blank to use the default prompt)`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={runAgent2}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
              >
                {busy ? 'Analyzing…' : 'Run Agent 2 on this Proof'}
              </button>
              {runErr && <span className="text-sm text-rose-700">{runErr}</span>}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <Link href="/vendor/dashboard" className="underline">Back to Dashboard</Link>
            <Link href={`/vendor/bids/${bidId}`} className="underline">Go to Bid</Link>
          </div>
        </section>
      )}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="font-medium break-all">{value}</div>
    </div>
  );
}

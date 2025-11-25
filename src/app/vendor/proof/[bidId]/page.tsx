// src/app/vendor/proof/[bidId]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getBid,
  uploadFileToIPFS,
  uploadProofFiles,
  submitProof,
  analyzeProof,
  Proof,
  archiveProof,
} from '@/lib/api';
import ChangeRequestsPanel from '@/components/ChangeRequestsPanel';


export default function VendorProofPage() {
  const params = useParams();
  const router = useRouter();
  const [bid, setBid] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // --- form state
  const [selectedPendingIdx, setSelectedPendingIdx] = useState<number>(0);
  const [proofTitle, setProofTitle] = useState('');
  const [proofDescription, setProofDescription] = useState('');
  const [agentPrompt, setAgentPrompt] = useState(''); // optional Agent 2 prompt

  // files & progress
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // last submitted proof returned by server (to show analysis / re-run)
  const [lastProof, setLastProof] = useState<Proof | null>(null);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [error, setError] = useState<string>('');

  const bidId = Number(params.bidId);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');
        const bidData = await getBid(bidId);
        setBid(bidData);
      } catch (e: any) {
        console.error('Error loading bid:', e);
        setError('Failed to load bid details. Please check the bid ID and try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [bidId]);

  // Map pending milestones WITH original index so we submit the correct index
  const pending = useMemo(() => {
    if (!bid?.milestones) return [];
    const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
    return ms
      .map((m, i) => ({ m, originalIndex: i }))
      .filter(({ m }) => !m?.completed);
  }, [bid]);

  const selectedOriginalIndex = useMemo(() => {
    const row = pending[selectedPendingIdx];
    return row ? row.originalIndex : 0;
  }, [pending, selectedPendingIdx]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
    setProofFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setProofFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function handleSubmitProof() {
    if (!bid) return;

    if (!proofDescription.trim() && proofFiles.length === 0) {
      setError('Please provide either a description or upload files as proof');
      return;
    }

    setSubmitting(true);
    setError('');
    setLastProof(null);
    setUploadProgress({});

    // 1) Upload files to IPFS (Batch Mode)
      let structuredFiles: { name: string; url: string }[] = [];
      
      if (proofFiles.length > 0) {
        // Set progress for all files to 50% (Simulated, since batch is 1 request)
        proofFiles.forEach(f => setUploadProgress(prev => ({ ...prev, [f.name]: 50 })));

        try {
          // ✅ FIX: Use the single-request batch uploader
          const uploaded = await uploadProofFiles(proofFiles);
          
          structuredFiles = uploaded.map(u => ({ name: u.name, url: u.url }));
          
          // Set progress to 100%
          proofFiles.forEach(f => setUploadProgress(prev => ({ ...prev, [f.name]: 100 })));
          
        } catch (e) {
          console.error('Proof batch upload failed', e);
          throw e; // Stop execution so we don't submit an empty proof
        }
      }
      
      // 2) Submit proof (sends both new JSON and legacy "proof" internally)
      const res = await submitProof({
        bidId,
        milestoneIndex: selectedOriginalIndex,
        title: proofTitle,
        description: proofDescription,
        files: structuredFiles,
        prompt: agentPrompt || undefined, // server will run Agent 2 if /proofs route is active
      });

      setLastProof(res);

      // 3) Success message
      if (res?.proofId) {
        // New route path: we have a stored proof with id (Agent2 may already be in aiAnalysis)
        alert('Proof submitted successfully! You can review the Agent 2 analysis below.');
      } else {
        // Legacy fallback (no proofId) – analysis not available for this submission
        alert('Proof submitted successfully! (Legacy mode). Admin will review and release payment.');
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to submit proof. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function rerunAnalysis() {
    if (!lastProof?.proofId) return;
    try {
      setRerunBusy(true);
      const updated = await analyzeProof(lastProof.proofId, agentPrompt || undefined);
      setLastProof(updated);
    } catch (e: any) {
      alert(e?.message || 'Failed to run Agent 2');
    } finally {
      setRerunBusy(false);
    }
  }

  async function archiveCurrentProof() {
  if (!lastProof?.proofId) return;
  try {
    const updated = await archiveProof(lastProof.proofId);
    setLastProof(updated);                  // reflect new status
    alert('Proof archived.');
  } catch (e: any) {
    alert(e?.message || 'Archive failed');
  }
}

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading bid details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-4">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-red-600 text-center mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-center mb-4">Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => router.push('/vendor/dashboard')}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!bid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">Bid not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-800 flex items-center text-sm font-medium"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Submit Proof of Work</h1>
          <p className="text-gray-600">Bid ID: {bid.bidId} • {bid.vendorName}</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-blue-800 mb-2">Project: {bid.title}</h2>
          <p className="text-blue-600 text-sm">
            You will be paid in {bid.preferredStablecoin} to: {bid.walletAddress}
          </p>
        </div>

        {pending.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-green-800 font-semibold">✅ All milestones completed!</p>
            <p className="text-green-600">All payments have been processed for this project.</p>
          </div>
        ) : (
          <>
            {/* Milestone select (uses original indices under the hood) */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Milestone to Verify *
              </label>
              <select
                value={selectedPendingIdx}
                onChange={(e) => setSelectedPendingIdx(parseInt(e.target.value))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {pending.map(({ m, originalIndex }, idx) => (
                  <option key={originalIndex} value={idx}>
                    {m.name} - ${m.amount} (Due: {new Date(m.dueDate).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

 {/* Change Requests (history & replies for the selected milestone) */}
<div className="mb-6 rounded-lg border border-slate-200">
  <ChangeRequestsPanel
    proposalId={bid.proposalId}
    initialMilestoneIndex={selectedOriginalIndex}
    // Key forces re-mount when the admin/vendor switches milestone,
    // so the thread always matches the dropdown selection.
    key={`cr-${bid.proposalId}-${selectedOriginalIndex}`}
  />
</div>

            {/* Title (optional) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Proof Title (optional)
              </label>
              <input
                value={proofTitle}
                onChange={(e) => setProofTitle(e.target.value)}
                placeholder="e.g., Milestone 1: Installation completed"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Proof Description
              </label>
              <textarea
                placeholder="Describe the work you completed. Include details, links to repositories, or any other evidence..."
                value={proofDescription}
                onChange={(e) => setProofDescription(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-1">Optional but recommended</p>
            </div>

            {/* Files */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Proof Files *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  id="proof-files"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip,.txt,.xls,.xlsx"
                />
                <label
                  htmlFor="proof-files"
                  className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Choose Files
                </label>
                <p className="text-sm text-gray-500 mt-2">
                  Upload screenshots, documents, or other proof files (Max 50MB each)
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Supported formats: PDF, Word, Images, Excel, ZIP, Text
                </p>
              </div>

              {proofFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Selected files:</p>
                  {proofFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">{file.name}</span>
                        <span className="text-xs text-gray-400">
                          ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {uploadProgress[file.name] > 0 && uploadProgress[file.name] < 100 && (
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${uploadProgress[file.name]}%` }}
                            />
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Agent 2 (optional) */}
            <div className="mb-6 rounded-lg border border-slate-200 p-4 bg-slate-50">
              <div className="font-semibold mb-2">Agent 2 — Optional prompt</div>
              <textarea
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                className="w-full p-3 rounded-lg border"
                placeholder={`Optional. For example:\n"Summarize the attached work and highlight any risks. If a PDF is present, quote 1–2 short excerpts."`}
                rows={3}
              />
              <p className="text-xs text-slate-500 mt-1">
                If your API’s <code>/proofs</code> route is active, Agent 2 will analyze this proof automatically.
              </p>
            </div>

            {/* Info & Submit */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-yellow-800 mb-2">Important Information</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Admin will review your proof before releasing payment</li>
                <li>• Include clear evidence of completed work</li>
                <li>• Payment will be sent in {bid.preferredStablecoin}</li>
                <li>• You&apos;ll receive ${Number(bid?.milestones?.[selectedOriginalIndex]?.amount ?? 0)} upon approval</li>
              </ul>
            </div>

            <button
              onClick={handleSubmitProof}
              disabled={submitting || proofFiles.length === 0}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting Proof...' : 'Submit Proof for Review'}
            </button>

            {proofFiles.length === 0 && (
              <p className="text-red-600 text-sm mt-2 text-center">
                Please upload at least one file as proof of work
              </p>
            )}
          </>
        )}

        {/* Agent 2 result (after submit) */}
        {lastProof && (
          <div className="mt-8 rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Agent 2 Result</h3>
              {lastProof?.proofId ? (
                <span className="text-xs rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 border border-emerald-200">
                  Stored proof #{lastProof.proofId}
                </span>
              ) : lastProof?.aiAnalysis ? (
                <span className="text-xs rounded bg-blue-100 text-blue-800 px-2 py-0.5 border border-blue-200">
                  Analyzed (no id returned)
                </span>
              ) : (
                <span className="text-xs rounded bg-amber-100 text-amber-800 px-2 py-0.5 border border-amber-200">
                  Legacy submit: no proof id
                </span>
              )}
            </div>

            {lastProof.aiAnalysis ? (
              <AnalysisView a={lastProof.aiAnalysis} />
            ) : lastProof.proofId ? (
              <div className="mt-2">
                <p className="text-sm text-slate-600 mb-2">
                  No analysis present yet. You can run Agent 2 now with an optional prompt:
                </p>
                <textarea
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  rows={3}
                  placeholder="Optional prompt for Agent 2…"
                />
                <div className="mt-2">
                  <button
                    onClick={rerunAnalysis}
                    disabled={rerunBusy}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
                  >
                    {rerunBusy ? 'Analyzing…' : 'Run Agent 2'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">
                This submission used a legacy route, so Agent 2 analysis isn’t attached. Future submissions will include analysis when your server’s <code>/proofs</code> route is active.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysisView({ a }: { a: any }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {'fit' in a && <span>Fit: <b className={fitColor(a.fit)}>{String(a.fit || '').toLowerCase() || '—'}</b></span>}
        {'confidence' in a && <span>Confidence: <b>{Math.round((a.confidence ?? 0) * 100)}%</b></span>}
        {'pdfUsed' in a && <span className="text-slate-500">PDF parsed: <b>{a.pdfUsed ? 'Yes' : 'No'}</b></span>}
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

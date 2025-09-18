'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getBid, uploadFileToIPFS, submitProof } from '@/lib/api';

type Uploaded = { name: string; url: string };

export default function VendorProofPage() {
  const params = useParams();
  const router = useRouter();

  const bidId = Number(params.bidId);
  const [bid, setBid] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedIndex, setSelectedIndex] = useState<number>(0); // <- ORIGINAL milestone index
  const [proofDescription, setProofDescription] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState<string>(''); // Optional Agent 2 prompt

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // If the API returns analysis with the proof, show it here
  const [analysis, setAnalysis] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!Number.isFinite(bidId)) {
        setError('Invalid bid id.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError('');
        const b = await getBid(bidId);
        setBid(b);
      } catch (e: any) {
        setError(e?.message || 'Failed to load bid.');
      } finally {
        setLoading(false);
      }
    })();
  }, [bidId]);

  // Build a {index, milestone} list so we keep the ORIGINAL index from bid.milestones
  const pending = useMemo(() => {
    const ms = Array.isArray(bid?.milestones) ? bid.milestones : [];
    return ms.map((m: any, i: number) => ({ i, m })).filter(({ m }) => !m.completed);
  }, [bid]);

  // Default select to the first pending milestone (original index)
  useEffect(() => {
    if (pending.length > 0) {
      setSelectedIndex(pending[0].i);
    }
  }, [pending.length]);

  const selectedMilestone = useMemo(() => {
    if (!bid || !Array.isArray(bid.milestones)) return null;
    return bid.milestones[selectedIndex] || null;
  }, [bid, selectedIndex]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setProofFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  }
  function removeFile(idx: number) {
    setProofFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit() {
    if (!bid) return;

    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      setError('Please select a valid milestone.');
      return;
    }

    if (!proofDescription.trim() && proofFiles.length === 0) {
      setError('Please add a description or upload at least one file as proof.');
      return;
    }

    setError('');
    setSuccessMsg('');
    setUploading(true);

    let uploaded: Uploaded[] = [];
    try {
      // 1) Upload files to IPFS and build the structured array Agent2 expects
      for (const f of proofFiles) {
        const r = await uploadFileToIPFS(f);
        // r typically contains { cid, url, name, size }, keep just name + url
        uploaded.push({ name: f.name || r.name || 'file', url: r.url });
      }
    } catch (e: any) {
      setUploading(false);
      setError(e?.message || 'Failed to upload files.');
      return;
    }
    setUploading(false);

    // 2) Submit proof (server will store it and run Agent2 on the files+text)
    setSubmitting(true);
    try {
      const proofRes = await submitProof({
        bidId,
        milestoneIndex: selectedIndex, // IMPORTANT: original index in bid.milestones
        description: proofDescription,
        files: uploaded,              // structured array Agent2 analyzes
        vendorPrompt: prompt || undefined,
      });

      // Server should echo back saved proof (possibly with ai_analysis)
      if (proofRes?.aiAnalysis || proofRes?.ai_analysis) {
        setAnalysis(proofRes.aiAnalysis || proofRes.ai_analysis);
      } else {
        setAnalysis(null);
      }

      setSuccessMsg('Proof submitted! Admin will review the Agent 2 analysis before releasing payment.');
      // Optional: refresh the bid to reflect completion/proof fields if server updates milestones
      try {
        const fresh = await getBid(bidId);
        setBid(fresh);
      } catch {}

      // Reset form
      setProofFiles([]);
      // keep description/prompt so vendor can tweak and re-run if needed
    } catch (e: any) {
      setError(e?.message || 'Failed to submit proof.');
    } finally {
      setSubmitting(false);
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

  if (error && !bid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-4 bg-white rounded-lg shadow-sm p-6 text-center">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={() => router.push('/vendor/dashboard')} className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const msCount = Array.isArray(bid?.milestones) ? bid.milestones.length : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-blue-600 hover:text-blue-800 flex items-center text-sm font-medium">
            ← Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Submit Proof of Work</h1>
          <p className="text-gray-600">
            Bid ID: {bid.bidId} • {bid.vendorName}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-blue-800 mb-1">Project: {bid.title}</h2>
          <p className="text-blue-600 text-sm">
            Payment in {bid.preferredStablecoin} → {bid.walletAddress}
          </p>
        </div>

        {/* Milestone selector bound to ORIGINAL index */}
        {pending.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center mb-6">
            <p className="text-green-800 font-semibold">✅ All milestones completed!</p>
            <p className="text-green-600">All payments may have been processed for this project.</p>
          </div>
        ) : (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Milestone to Verify *</label>
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(Number(e.target.value))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {pending.map(({ i, m }) => (
                <option key={i} value={i}>
                  {m.name} — ${m.amount} (Due: {new Date(m.dueDate).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Proof Description</label>
          <textarea
            placeholder="Describe what you delivered. Include links, repos, and any relevant details."
            value={proofDescription}
            onChange={(e) => setProofDescription(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={4}
          />
          <p className="text-xs text-gray-500 mt-1">Optional but recommended.</p>
        </div>

        {/* Files */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Upload Proof Files *</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="proof-files"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.zip,.txt,.xls,.xlsx"
            />
            <label htmlFor="proof-files" className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Choose Files
            </label>
            <p className="text-sm text-gray-500 mt-2">Upload screenshots or documents (Max 50MB each)</p>
          </div>

          {proofFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Selected files:</p>
              {proofFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">{file.name}</span>
                    <span className="text-xs text-gray-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                  </div>
                  <button onClick={() => removeFile(idx)} className="text-red-600 hover:text-red-800 text-sm font-medium">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Optional Agent 2 prompt */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Agent 2 Prompt (optional)</label>
          <textarea
            placeholder={`Add clarifications or ask Agent 2 to focus on certain evidence.\nLeave blank to use the default analysis prompt.`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
          />
          <p className="text-xs text-gray-500 mt-1">This prompt is stored with the proof and used for analysis.</p>
        </div>

        {/* Hints */}
        {selectedMilestone && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-2">Important</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Admin will review your proof and the Agent 2 analysis before releasing payment.</li>
              <li>• Payment token: {bid.preferredStablecoin}</li>
              <li>• Milestone amount: ${selectedMilestone.amount}</li>
            </ul>
          </div>
        )}

        {/* Actions */}
        <button
          onClick={onSubmit}
          disabled={submitting || uploading || pending.length === 0}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Submitting Proof…' : uploading ? 'Uploading Files…' : 'Submit Proof for Review'}
        </button>

        {/* Status messages */}
        {error && <p className="mt-3 text-red-600 text-sm text-center">{error}</p>}
        {successMsg && <p className="mt-3 text-emerald-700 text-sm text-center">{successMsg}</p>}

        {/* Show analysis (if server returned it) */}
        {analysis && (
          <div className="mt-8 border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Agent 2 Analysis (for this proof)</h3>
            <div className="space-y-3 text-sm">
              {analysis.summary && (
                <div>
                  <div className="text-slate-500 mb-1">Summary</div>
                  <div className="whitespace-pre-wrap">{analysis.summary}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {'fit' in analysis && <span className="px-2 py-1 rounded bg-slate-100">Fit: <b>{analysis.fit}</b></span>}
                {'confidence' in analysis && <span className="px-2 py-1 rounded bg-slate-100">Confidence: <b>{Math.round((analysis.confidence ?? 0) * 100)}%</b></span>}
              </div>
              {Array.isArray(analysis.risks) && analysis.risks.length > 0 && (
                <div>
                  <div className="text-slate-500 mb-1">Risks</div>
                  <ul className="list-disc pl-5 space-y-1">
                    {analysis.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// src/app/vendor/proof/[bidId]/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getBid, uploadFileToIPFS, submitProof } from '@/lib/api';

type UploadedRow = { name: string; url: string };

export default function VendorProofPage() {
  const params = useParams();
  const router = useRouter();
  const bidId = Number(params.bidId);

  const [bid, setBid] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  // selection uses ORIGINAL index from bid.milestones
  const [selectedOriginalIndex, setSelectedOriginalIndex] = useState<number>(0);

  // proof composer
  const [proofDescription, setProofDescription] = useState('');
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<UploadedRow[]>([]);
  const [uploading, setUploading] = useState(false);

  // Agent 2
  const [a2Prompt, setA2Prompt] = useState('');

  useEffect(() => {
    if (!Number.isFinite(bidId)) return;
    loadBid();
  }, [bidId]);

  async function loadBid() {
    try {
      setLoading(true);
      setError('');
      const bidData = await getBid(bidId);
      setBid(bidData);

      // default to first pending milestone’s ORIGINAL index
      const ms = Array.isArray(bidData?.milestones) ? bidData.milestones : [];
      const firstPendingIdx = ms.findIndex((m: any) => !m.completed);
      setSelectedOriginalIndex(firstPendingIdx >= 0 ? firstPendingIdx : 0);
    } catch (e: any) {
      console.error('Error loading bid:', e);
      setError('Failed to load bid details. Please check the bid ID and try again.');
    } finally {
      setLoading(false);
    }
  }

  const milestones: any[] = Array.isArray(bid?.milestones) ? bid.milestones : [];

  // list shown to user, but KEEP original indices
  const pending = useMemo(
    () =>
      milestones
        .map((m, i) => ({ ...m, _idx: i }))
        .filter((m) => !m.completed),
    [milestones]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setLocalFiles((prev) => [...prev, ...files]);
    }
  };

  const removeLocal = (i: number) => {
    setLocalFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  const removeUploaded = (i: number) => {
    setUploaded((prev) => prev.filter((_, idx) => idx !== i));
  };

  async function uploadAll() {
    if (localFiles.length === 0) return;
    setUploading(true);
    try {
      const rows: UploadedRow[] = [];
      for (const f of localFiles) {
        const res = await uploadFileToIPFS(f); // -> { cid, url }
        if (!res?.url) throw new Error('Upload failed (no URL returned)');
        rows.push({ name: f.name, url: res.url });
      }
      setUploaded((prev) => [...prev, ...rows]);
      setLocalFiles([]); // clear the local queue
    } catch (e: any) {
      alert(e?.message || 'File upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmitProof() {
    try {
      setSubmitting(true);
      setError('');

      if (!Number.isFinite(bidId)) throw new Error('Invalid bid ID');
      if (!Number.isFinite(selectedOriginalIndex)) throw new Error('Select a milestone');
      if (!proofDescription.trim() && uploaded.length === 0) {
        throw new Error('Please provide a description or upload at least one file');
      }

      // Payload EXACTLY as server expects
      const payload = {
        bidId,
        milestoneIndex: selectedOriginalIndex, // ORIGINAL index in bid.milestones
        title: '', // optional; keeping simple; you can add a Title input if you want
        description: proofDescription.trim(),
        files: uploaded, // [{ name, url }]
        prompt: a2Prompt.trim() || undefined, // optional Agent 2 instructions
      };

      // helpful when debugging 400s
      console.log('Submitting proof payload →', payload);

      await submitProof(payload);

      alert('Proof submitted! Admin will review it alongside Agent 2’s analysis.');
      router.push('/vendor/dashboard');
    } catch (e: any) {
      setError(e?.message || 'Failed to submit proof. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
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

  const pendingMilestones = pending; // same visual name as before

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

        {pendingMilestones.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-green-800 font-semibold">✅ All milestones completed!</p>
            <p className="text-green-600">All payments have been processed for this project.</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Milestone to Verify *
              </label>
              <select
                value={selectedOriginalIndex}
                onChange={(e) => setSelectedOriginalIndex(parseInt(e.target.value))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {pendingMilestones.map((m: any) => (
                  <option key={m._idx} value={m._idx}>
                    {m.name} - ${m.amount} (Due: {new Date(m.dueDate).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

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

              {/* local queue */}
              {localFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Selected files (not uploaded yet):</p>
                  {localFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">{file.name}</span>
                        <span className="text-xs text-gray-400">
                          ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                      <button
                        onClick={() => removeLocal(index)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={uploadAll}
                    disabled={uploading}
                    className="mt-2 bg-slate-900 text-white px-4 py-2 rounded-lg disabled:opacity-60"
                  >
                    {uploading ? 'Uploading…' : 'Upload selected'}
                  </button>
                </div>
              )}

              {/* uploaded list */}
              {uploaded.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Attached files:</p>
                  {uploaded.map((row, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm break-all"
                      >
                        {row.name}
                      </a>
                      <button
                        onClick={() => removeUploaded(index)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Agent 2 prompt */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Agent 2 Prompt (optional)
              </label>
              <textarea
                value={a2Prompt}
                onChange={(e) => setA2Prompt(e.target.value)}
                placeholder={`Extra instructions to Agent 2. Use {{CONTEXT}} to inject bid + proof.\nExample: "Ensure screenshots match acceptance criteria for this milestone. {{CONTEXT}}".`}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">
                If left blank, the default proof-analysis prompt will be used.
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-yellow-800 mb-2">Important Information</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Admin will review your proof and the Agent 2 analysis before releasing payment</li>
                <li>• Include clear evidence of completed work</li>
                <li>• Payment will be sent in {bid.preferredStablecoin}</li>
                <li>• You&apos;ll receive ${milestones[selectedOriginalIndex]?.amount ?? 0} upon approval</li>
              </ul>
            </div>

            <button
              onClick={handleSubmitProof}
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting Proof...' : 'Submit Proof for Review'}
            </button>

            {error && (
              <p className="text-red-600 text-sm mt-2 text-center">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

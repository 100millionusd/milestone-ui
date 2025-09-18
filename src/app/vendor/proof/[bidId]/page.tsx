'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getBid, uploadFileToIPFS, submitProof } from '@/lib/api';

export default function VendorProofPage() {
  const params = useParams<{ bidId: string }>();
  const router = useRouter();
  const [bid, setBid] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // we’ll keep originalIndex for each pending milestone
  const [pending, setPending] = useState<Array<{ originalIndex: number; name: string; amount: number; dueDate: string }>>([]);

  const [selectedOriginalIndex, setSelectedOriginalIndex] = useState<number | null>(null);
  const [proofDescription, setProofDescription] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [error, setError] = useState<string>('');

  const bidIdStr = params?.bidId || '';
  const bidId = Number(bidIdStr);

  useEffect(() => {
    if (!Number.isFinite(bidId)) {
      setError('Invalid bid id');
      setLoading(false);
      return;
    }
    loadBid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  async function loadBid() {
    try {
      setLoading(true);
      setError('');
      const b = await getBid(bidId);
      setBid(b);

      // Build pending list with original indices preserved
      const list: Array<{ originalIndex: number; name: string; amount: number; dueDate: string }> = [];
      (Array.isArray(b?.milestones) ? b.milestones : []).forEach((m: any, idx: number) => {
        if (!m?.completed) {
          list.push({ originalIndex: idx, name: m.name, amount: Number(m.amount || 0), dueDate: m.dueDate });
        }
      });
      setPending(list);
      setSelectedOriginalIndex(list.length ? list[0].originalIndex : null);
    } catch (e: any) {
      console.error('Error loading bid:', e);
      setError(e?.message || 'Failed to load bid details. Please check the bid ID and try again.');
    } finally {
      setLoading(false);
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setProofFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setProofFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function handleSubmitProof() {
    if (!Number.isFinite(bidId)) {
      setError('Invalid bid id');
      return;
    }
    if (selectedOriginalIndex == null) {
      setError('Please select a milestone');
      return;
    }
    if (!proofDescription.trim() && proofFiles.length === 0) {
      setError('Please provide either a description or upload files as proof');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // 1) Upload all files to IPFS (collect names + urls)
      const uploaded: { name: string; url: string }[] = [];
      for (const file of proofFiles) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 10 }));
        try {
          const res = await uploadFileToIPFS(file);
          uploaded.push({ name: file.name, url: res.url });
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
        } catch (err) {
          console.error('Error uploading file:', err);
          // still push a failed marker so admin sees it
          uploaded.push({ name: file.name, url: 'upload-failed' });
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
        }
      }

      // 2) Submit proof via API — this CALL sends bidId (non-null) + milestone index (original)
      await submitProof(bidId, selectedOriginalIndex, proofDescription.trim(), uploaded);

      alert('Proof submitted successfully! The admin will review and release payment.');
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
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Milestone to Verify *
              </label>
              <select
                value={selectedOriginalIndex ?? ''}
                onChange={(e) => setSelectedOriginalIndex(Number(e.target.value))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {pending.map((m) => (
                  <option key={m.originalIndex} value={m.originalIndex}>
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
                            ></div>
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

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-yellow-800 mb-2">Important Information</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Admin will review your proof before releasing payment</li>
                <li>• Include clear evidence of completed work</li>
                <li>• Payment will be sent in {bid.preferredStablecoin}</li>
                <li>• You’ll receive ${pending.find(p => p.originalIndex === selectedOriginalIndex)?.amount ?? 0} upon approval</li>
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
      </div>
    </div>
  );
}

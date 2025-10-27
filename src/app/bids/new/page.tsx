// src/app/bids/new/page.tsx
'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Agent2ProgressModal from '@/components/Agent2ProgressModal';
import { API_BASE, createBid, uploadFileToIPFS, getProposal, analyzeBid, getBid } from '@/lib/api';

function NewBidPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proposalId = searchParams.get('proposalId');

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [proposal, setProposal] = useState<any | null>(null);

  // Vendor profile
  type VendorProfile = {
    vendorName: string;
    walletAddress: string;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [formData, setFormData] = useState({
    proposalId: proposalId ? parseInt(proposalId) : '',
    vendorName: '',
    priceUSD: '',
    days: '',
    notes: '',
    walletAddress: '',
    preferredStablecoin: 'USDC',
    milestones: [{ name: 'Milestone 1', amount: '', dueDate: '' }],
  });
  
  // CHANGED: Multi-file state instead of single docFile
  const [docFiles, setDocFiles] = useState<File[]>([]);

  // Agent2 modal state
  type Step = 'submitting' | 'analyzing' | 'done' | 'error';
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<Step>('submitting');
  const [message, setMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [createdBidId, setCreatedBidId] = useState<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- helpers ---
  const clearPoll = () => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
  };

  const pollUntilAnalysis = useCallback((bidId: number, timeoutMs = 60000, intervalMs = 1500) => {
    const stopAt = Date.now() + timeoutMs;
    clearPoll();
    pollTimerRef.current = setInterval(async () => {
      try {
        const b = await getBid(bidId);
        const a = (b as any)?.aiAnalysis ?? (b as any)?.ai_analysis ?? null;
        if (a) {
          setAnalysis(a);
          setStep('done');
          setMessage('Analysis complete.');
          clearPoll();
        } else if (Date.now() > stopAt) {
          setStep('done');
          setMessage('Analysis will appear shortly.');
          clearPoll();
        }
      } catch {
        if (Date.now() > stopAt) {
          setStep('done');
          setMessage('Analysis will appear shortly.');
          clearPoll();
        }
      }
    }, intervalMs);
  }, []);

  useEffect(() => {
    if (proposalId) {
      getProposal(Number(proposalId)).then(setProposal).catch(console.error);
    }
    return clearPoll;
  }, [proposalId]);

  // Load vendor profile and prefill vendorName + walletAddress
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/vendor/profile`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data: VendorProfile = await res.json();
          if (!alive) return;
          setProfile(data);
          setFormData((prev) => ({
            ...prev,
            vendorName: prev.vendorName || data.vendorName || '',
            walletAddress: prev.walletAddress || data.walletAddress || '',
          }));
        } else {
          setProfile(null);
        }
      } catch {
        setProfile(null);
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Guard: only allow submit when the clicked button opts in
  const allowOnlyExplicitSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    const submitter = (e.nativeEvent as any)?.submitter as HTMLElement | undefined;
    if (!submitter || submitter.getAttribute('data-allow-submit') !== 'true') {
      e.preventDefault();
    }
  };

  // NEW: Multi-file handlers
  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const newFiles = Array.from(selectedFiles);
    setDocFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setDocFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setDocFiles([]);
  };

  const missingRequiredProfile =
    !profileLoading &&
    (
      !profile ||
      !profile.vendorName ||
      !profile.walletAddress ||
      !profile.email ||
      !profile.address
    );

  const qs = searchParams?.toString();
  const returnTo = `/bids/new${qs ? `?${qs}` : ''}`;

  // --- submit handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitted) return;
    if (!proposalId) {
      alert('No project selected. Open this page with ?proposalId=<id>.');
      return;
    }
    if (missingRequiredProfile) {
      alert('Please complete your vendor profile first.');
      return;
    }

    setLoading(true);
    setModalOpen(true);
    setStep('submitting');
    setMessage('Submitting your bid…');
    setAnalysis(null);
    setCreatedBidId(null);

    try {
      // CHANGED: Upload multiple files
      let filesPayload: any[] = [];
      if (docFiles.length > 0) {
        setMessage('Uploading files to IPFS...');
        const uploaded = await Promise.all(docFiles.map(uploadFileToIPFS));
        filesPayload = uploaded.map((up, i) => ({
          cid: up.cid,
          url: up.url,
          name: docFiles[i].name,
          size: docFiles[i].size,
        }));
      }

      // Build payload with multiple files
      const body: any = {
        ...formData,
        proposalId: Number(proposalId),
        priceUSD: parseFloat(formData.priceUSD),
        days: parseInt(formData.days),
        milestones: formData.milestones.map((m) => ({
          name: m.name,
          amount: parseFloat(m.amount),
          dueDate: new Date(m.dueDate).toISOString(),
        })),
        files: filesPayload, // NEW: Send array of files
      };

      // For backward compatibility, also set the first file as `doc`
      if (filesPayload[0]) {
        body.doc = filesPayload[0];
      }

      // Create bid
      const created = await createBid(body);
      const bidId = Number((created as any)?.bidId ?? (created as any)?.bid_id);
      if (!bidId) throw new Error('Bid created but no ID returned');

      setCreatedBidId(bidId);
      setStep('analyzing');
      setMessage('Agent2 is analyzing your bid…');

      // Trigger server analysis
      try { await analyzeBid(bidId, undefined); } catch {}

      // Start polling until aiAnalysis appears
      pollUntilAnalysis(bidId);
    } catch (error: any) {
      console.error('Error creating bid:', error);
      setStep('error');
      setMessage(error?.message || 'Failed to create bid');
      alert('Failed to create bid: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // --- UI ---
  if (!proposalId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        No project selected. Please go back to projects and click "Submit Bid".
      </div>
    );
  }

  const disabled = loading || submitted;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Submit Bid</h1>

      {/* Profile gate */}
      {profileLoading && (
        <div className="mb-4 text-slate-500">Loading your profile…</div>
      )}
      {!profileLoading && missingRequiredProfile && (
        <div className="mb-6 rounded border bg-amber-50 text-amber-900 p-4">
          <div className="font-medium mb-1">Complete your vendor profile first</div>
          <p className="text-sm">
            We need your company details (email, address, etc.) once. After that, your bids are prefilled automatically.
          </p>
          <Link
            className="inline-block mt-3 px-3 py-1.5 rounded bg-slate-900 text-white text-sm"
            href={`/vendor/profile?returnTo=${encodeURIComponent(returnTo)}`}
          >
            Go to Profile
          </Link>
        </div>
      )}

      {proposal && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h2 className="font-semibold mb-2">Project: {proposal.title}</h2>
          <p className="text-gray-600">Organization: {proposal.orgName}</p>
          <p className="text-green-600 font-medium">Budget: ${proposal.amountUSD}</p>
        </div>
      )}

      <form
        onSubmit={(e) => { allowOnlyExplicitSubmit(e); handleSubmit(e); }}
        className="space-y-6"
      >
        <fieldset disabled={disabled} className={disabled ? 'opacity-70 pointer-events-none' : ''}>
          {/* Vendor Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Vendor Name *</label>
              <input
                type="text"
                required
                value={formData.vendorName}
                onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
                className="w-full p-2 border rounded"
                placeholder="Your company name"
                readOnly={!!profile?.vendorName}
              />
              {profile?.vendorName && (
                <div className="text-xs text-slate-500 mt-1">
                  Prefilled from your <Link className="underline" href={`/vendor/profile?returnTo=${encodeURIComponent(returnTo)}`}>profile</Link>.
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Wallet Address *</label>
              <input
                type="text"
                required
                value={formData.walletAddress}
                onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
                className="w-full p-2 border rounded"
                placeholder="0x..."
                readOnly={!!profile?.walletAddress}
              />
              {profile?.walletAddress && (
                <div className="text-xs text-slate-500 mt-1">
                  Prefilled from your <Link className="underline" href={`/vendor/profile?returnTo=${encodeURIComponent(returnTo)}`}>profile</Link>.
                </div>
              )}
            </div>
          </div>

          {/* Bid Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Bid Price (USD) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.priceUSD}
                onChange={(e) => setFormData({ ...formData, priceUSD: e.target.value })}
                className="w-full p-2 border rounded"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Completion Days *</label>
              <input
                type="number"
                required
                value={formData.days}
                onChange={(e) => setFormData({ ...formData, days: e.target.value })}
                className="w-full p-2 border rounded"
                placeholder="30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preferred Stablecoin *</label>
              <select
                required
                value={formData.preferredStablecoin}
                onChange={(e) => setFormData({ ...formData, preferredStablecoin: e.target.value })}
                className="w-full p-2 border rounded"
              >
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
          </div>

          {/* Bid Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Bid Proposal Details *</label>
            <textarea
              required
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-2 border rounded"
              rows={4}
              placeholder="Describe your approach, timeline, experience..."
            />
          </div>

          {/* Milestones */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block text-sm font-medium">Project Milestones *</label>
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    milestones: [...prev.milestones, { name: `Milestone ${prev.milestones.length + 1}`, amount: '', dueDate: '' }],
                  }))
                }
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
              >
                + Add Milestone
              </button>
            </div>

            <div className="space-y-4">
              {formData.milestones.map((milestone, index) => (
                <div key={index} className="border p-4 rounded-lg bg-gray-50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium">Milestone {index + 1}</h4>
                    {formData.milestones.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            milestones: prev.milestones.filter((_, i) => i !== index),
                          }))
                        }
                        className="text-red-600 text-sm hover:text-red-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Milestone Name *</label>
                      <input
                        type="text"
                        required
                        value={milestone.name}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            milestones: prev.milestones.map((m, i) => (i === index ? { ...m, name: e.target.value } : m)),
                          }))
                        }
                        className="w-full p-2 border rounded text-sm"
                        placeholder="Design completion"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Amount ($) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={milestone.amount}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            milestones: prev.milestones.map((m, i) => (i === index ? { ...m, amount: e.target.value } : m)),
                          }))
                        }
                        className="w-full p-2 border rounded text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Due Date *</label>
                      <input
                        type="date"
                        required
                        value={milestone.dueDate}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            milestones: prev.milestones.map((m, i) => (i === index ? { ...m, dueDate: e.target.value } : m)),
                          }))
                        }
                        className="w-full p-2 border rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CHANGED: Supporting Documents - Multi-file */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium">Supporting Documents</label>
              {docFiles.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllFiles}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Clear all
                </button>
              )}
            </div>

            <input
              type="file"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              className="w-full p-2 border rounded mb-3"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            />

            {/* Selected files list */}
            {docFiles.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-medium mb-2">
                  Selected files ({docFiles.length}):
                </div>
                <ul className="space-y-2 text-sm">
                  {docFiles.map((file, index) => (
                    <li key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-gray-500 ml-2 text-xs">
                        {Math.round(file.size / 1024)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="ml-2 text-red-500 hover:text-red-700 text-xs"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-sm text-gray-500 mt-2">
              Upload portfolio, previous work, certifications, etc. You can select multiple files.
            </p>
          </div>
        </fieldset>

        {/* Submit / Cancel */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            data-allow-submit="true"
            disabled={loading || submitted || missingRequiredProfile}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg disabled:bg-gray-400 font-medium"
          >
            {submitted ? 'Bid submitted' : (loading ? 'Submitting Bid...' : 'Submit Bid')}
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="bg-gray-500 text-white px-6 py-3 rounded-lg disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Agent2 modal */}
      <Agent2ProgressModal
        open={modalOpen}
        step={step}
        message={message}
        analysis={analysis}
        bidId={createdBidId ?? undefined}
        onClose={() => { setModalOpen(false); clearPoll(); }}
        onFinalized={() => {
          setSubmitted(true);
          clearPoll();
          setModalOpen(false);
        }}
      />
    </div>
  );
}

export default function NewBidPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-6">Loading bid form...</div>}>
      <NewBidPageContent />
    </Suspense>
  );
}
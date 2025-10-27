// src/app/vendor/bids/new/VendorBidNewClient.tsx
'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Agent2ProgressModal from '@/components/Agent2ProgressModal';
import { createBid, getBid, analyzeBid } from '@/lib/api';

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

type LocalMilestone = {
  name: string;
  amount: number;
  dueDate: string;
};

function coerce(a: any) {
  if (!a) return null;
  if (typeof a === 'string') { try { return JSON.parse(a); } catch { return null; } }
  return a;
}

const allowOnlyExplicitSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
  const submitter = (e.nativeEvent as any)?.submitter as HTMLElement | undefined;
  if (!submitter || submitter.getAttribute('data-allow-submit') !== 'true') {
    e.preventDefault();
  }
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
async function uploadIpfsFile(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/ipfs/upload-file`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`IPFS upload failed (${res.status}) ${t}`);
  }
  return res.json();
}

// File validation function
const validateFile = (file: File): string | null => {
  const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const maxSize = 50 * 1024 * 1024; // 50MB

  if (!validTypes.includes(file.type)) {
    return 'File type not supported. Please upload PDF or image files only.';
  }

  if (file.size > maxSize) {
    return 'File size too large. Maximum size is 50MB.';
  }

  return null;
};

export default function VendorBidNewClient({ proposalId }: { proposalId: number }) {
  const router = useRouter();

  const [vendorName, setVendorName] = useState('');
  const [priceUSD, setPriceUSD] = useState<number>(0);
  const [days, setDays] = useState<number>(30);
  const [walletAddress, setWalletAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [milestones, setMilestones] = useState<LocalMilestone[]>([
    { name: 'Milestone 1', amount: 0, dueDate: new Date().toISOString() },
  ]);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('submitting');
  const [message, setMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [bidIdForModal, setBidIdForModal] = useState<number | undefined>(undefined);

  const pollAnalysis = useCallback(async (bidId: number, timeoutMs = 60000, intervalMs = 1500) => {
    const stopAt = Date.now() + timeoutMs;
    while (Date.now() < stopAt) {
      try {
        const b = await getBid(bidId);
        const ai = coerce((b as any)?.aiAnalysis ?? (b as any)?.ai_analysis);
        if (ai) return ai;
      } catch {}
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }, []);

  // File handling functions
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setFileError(null);
    const newFiles: File[] = [];
    const errors: string[] = [];

    Array.from(files).forEach(file => {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        newFiles.push(file);
      }
    });

    if (errors.length > 0) {
      setFileError(errors.join('\n'));
    }

    if (newFiles.length > 0) {
      setSelectedFiles(prev => {
        const updatedFiles = [...prev, ...newFiles];
        // Remove duplicates by name and size
        return updatedFiles.filter((file, index, self) => 
          index === self.findIndex(f => 
            f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
          )
        );
      });
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setFileError(null);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!Number.isFinite(proposalId) || proposalId <= 0) {
      alert('Missing proposalId. Open this page with ?proposalId=<id>.');
      return;
    }

    setOpen(true);
    setStep('submitting');
    setMessage(null);
    setAnalysis(null);
    setBidIdForModal(undefined);

    try {
      let filesPayload: any[] = [];
      if (selectedFiles.length > 0) {
        setMessage('Uploading files...');
        const uploaded = await Promise.all(selectedFiles.map(uploadIpfsFile));
        filesPayload = uploaded.map((u, i) => ({
          name: u.name ?? selectedFiles[i]?.name ?? `file-${i + 1}`,
          cid: u.cid ?? u.ipfsCid ?? null,
          url: u.url ?? (u.cid ? `https://ipfs.io/ipfs/${u.cid}` : null),
          size: u.size ?? selectedFiles[i]?.size ?? null,
          contentType: u.contentType ?? selectedFiles[i]?.type ?? null,
        }));
      }

      const payload: any = {
        proposalId,
        vendorName,
        priceUSD: Number(priceUSD),
        days: Number(days),
        notes,
        walletAddress,
        preferredStablecoin: 'USDT',
        milestones: milestones.map(m => ({
          name: m.name,
          amount: Number(m.amount),
          dueDate: new Date(m.dueDate).toISOString(),
        })),
        doc: null,
        files: filesPayload,
      };
      if (filesPayload[0]) payload.file = filesPayload[0];

      setMessage('Creating bid...');
      const created: any = await createBid(payload);
      const bidId = Number(created?.bidId ?? created?.bid_id);
      if (!bidId) throw new Error('Failed to create bid (no id)');
      setBidIdForModal(bidId);

      let found = coerce(created?.aiAnalysis ?? created?.ai_analysis);

      setStep('analyzing');
      setMessage('Agent2 is analyzing your bid…');

      if (!found) {
        try { await analyzeBid(bidId); } catch {}
        found = await pollAnalysis(bidId);
      }

      if (found) {
        setAnalysis(found);
        setStep('done');
        setMessage('Analysis complete.');
        router.refresh();
      } else {
        setStep('done');
        setMessage('Analysis will appear shortly.');
        router.refresh();
      }
    } catch (err: any) {
      setStep('error');
      setMessage(err?.message || 'Failed to submit bid');
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Submit a Bid</h1>

      <form
        onSubmit={(e) => { allowOnlyExplicitSubmit(e); handleSubmit(e); }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Vendor name"
            value={vendorName}
            onChange={e => setVendorName(e.target.value)}
            required
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Price (USD)"
            type="number"
            min={0}
            value={priceUSD}
            onChange={e => setPriceUSD(Number(e.target.value))}
            required
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Days"
            type="number"
            min={1}
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            required
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Wallet (0x…)"
            value={walletAddress}
            onChange={e => setWalletAddress(e.target.value)}
            required
          />
        </div>

        <textarea
          className="border rounded-lg w-full px-3 py-2"
          placeholder="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />

        {/* Improved Attachments Section */}
        <div className="border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Attachments</div>
            <div className="flex gap-2">
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllFiles}
                  className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 text-red-600"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => document.getElementById('bid-files-input')?.click()}
                className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
              >
                Add files
              </button>
            </div>
          </div>

          <input
            id="bid-files-input"
            type="file"
            multiple
            accept=".pdf,image/*"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />

          <div
            onDragOver={(e) => { 
              e.preventDefault();
              e.currentTarget.classList.add('border-blue-400', 'bg-blue-50');
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
              handleFileSelect(e.dataTransfer.files);
            }}
            className="border border-dashed rounded p-4 text-sm text-gray-600 bg-white/60 transition-colors duration-200"
          >
            <div className="mb-1">
              Drag & drop files here, or click{' '}
              <span 
                className="underline cursor-pointer" 
                onClick={() => document.getElementById('bid-files-input')?.click()}
              >
                Add files
              </span>
            </div>
            <div className="text-xs opacity-70">
              PDFs and images supported. Maximum 50MB per file.
            </div>
          </div>

          {fileError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600 whitespace-pre-wrap">
              {fileError}
            </div>
          )}

          {selectedFiles.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-medium mb-2">
                Selected files ({selectedFiles.length}):
              </div>
              <ul className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <li key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center min-w-0 flex-1">
                      <span className="truncate text-sm">{file.name}</span>
                      <span className="ml-2 text-xs text-gray-500 whitespace-nowrap">
                        {Math.round(file.size / 1024)} KB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="ml-2 text-red-500 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Milestones</div>
          {milestones.map((m, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-3 mb-2">
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Name"
                value={m.name}
                onChange={e => { const n = [...milestones]; n[i].name = e.target.value; setMilestones(n); }}
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Amount"
                type="number"
                min={0}
                value={m.amount}
                onChange={e => { const n = [...milestones]; n[i].amount = Number(e.target.value); setMilestones(n); }}
              />
              <input
                className="border rounded-lg px-3 py-2"
                type="date"
                value={m.dueDate.slice(0,10)}
                onChange={e => { const n = [...milestones]; n[i].dueDate = new Date(e.target.value).toISOString(); setMilestones(n); }}
              />
            </div>
          ))}
        </div>

        <button
          type="submit"
          data-allow-submit="true"
          className="px-4 py-2 rounded-lg bg-slate-900 text-white"
        >
          Submit bid
        </button>
      </form>

      <Agent2ProgressModal
        open={open}
        step={step}
        message={message}
        onClose={() => setOpen(false)}
        analysis={analysis}
        bidId={bidIdForModal}
      />
    </div>
  );
}
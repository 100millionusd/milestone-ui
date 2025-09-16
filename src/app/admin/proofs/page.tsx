// src/app/admin/proofs/page.tsx
'use client';

import { useEffect, useState } from 'react';

interface File {
  name?: string;
  url: string;
}

interface Proof {
  description?: string;
  files?: File[];
}

interface Milestone {
  name: string;
  amount: number;
  dueDate: string;
  proof?: string | Proof;
  completed: boolean;
  paymentTxHash?: string;
}

interface Bid {
  bidId: number;
  proposalId: number;
  vendorName: string;
  vendorWallet?: string;
  milestones: Milestone[];
}

export default function AdminProofsPage() {
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<Bid[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'All' | 'Needs Approval' | 'Ready to Pay' | 'Paid' | 'No Proof'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadProofs();
  }, []);

  const loadProofs = async () => {
    setLoading(true);
    setError(null);
    try {
      const allBids = await getBids();
      setBids(allBids);
    } catch (e: any) {
      console.error('Error fetching proofs:', e);
      setError(e?.message || 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (bidId: number, milestoneIndex: number, proof: string) => {
    if (!confirm('Approve this proof?')) return;
    try {
      setProcessing(`approve-${bidId}-${milestoneIndex}`);
      await completeMilestone(bidId, milestoneIndex, proof);
      alert('Proof approved ✅');
      await loadProofs();
    } catch (e: any) {
      console.error('Error approving proof:', e);
      alert(e?.message || 'Failed to approve proof');
    } finally {
      setProcessing(null);
    }
  };

  const handlePay = async (bidId: number, milestoneIndex: number) => {
    if (!confirm('Release payment for this milestone?')) return;
    try {
      setProcessing(`pay-${bidId}-${milestoneIndex}`);
      await payMilestone(bidId, milestoneIndex);
      alert('Payment released successfully ✅');
      await loadProofs();
    } catch (e: any) {
      console.error('Error paying milestone:', e);
      alert(e?.message || 'Payment failed');
    } finally {
      setProcessing(null);
    }
  };

  const renderProof = (m: Milestone) => {
    if (!m?.proof) return null;

    let parsed: Proof | null = null;
    try {
      parsed = JSON.parse(m.proof as string);
    } catch {
      /* not JSON */
    }

    if (parsed && typeof parsed === 'object') {
      return (
        <div className="mt-2 space-y-2">
          {parsed.description && <p className="text-sm text-gray-700">{parsed.description}</p>}
          {Array.isArray(parsed.files) && parsed.files.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {parsed.files.map((f: File, i: number) => {
                const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(f?.name || f?.url || '');
                if (isImage) {
                  const imageUrls = parsed.files
                    .filter((ff: File) => /\.(png|jpe?g|gif|webp|svg)$/i.test(ff?.name || ff?.url || ''))
                    .map((ff: File) => ff.url);
                  const startIndex = imageUrls.findIndex((u: string) => u === f.url);
                  return (
                    <button
                      key={i}
                      onClick={() => setLightbox({ urls: imageUrls, index: Math.max(0, startIndex) })}
                      className="group relative overflow-hidden rounded border"
                    >
                      <img
                        src={f.url}
                        alt={f.name || `Proof image ${i + 1} for milestone ${m.name}`}
                        className="h-32 w-full object-cover group-hover:scale-105 transition"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                        {f.name || 'Image'}
                      </div>
                    </button>
                  );
                }
                return (
                  <div key={i} className="p-3 rounded border bg-gray-50">
                    <p className="truncate text-sm">{f?.name || 'Attachment'}</p>
                    <a
                      href={f?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Open
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    const text = String(m.proof);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = [...text.matchAll(urlRegex)].map((match) => match[0]);

    return (
      <div className="mt-2 space-y-2">
        <p className="text-sm text-gray-700 whitespace-pre-line">{text}</p>
        {urls.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {urls.map((url, i) => {
              const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
              if (isImage) {
                const imageUrls = urls.filter((u) => /\.(png|jpe?g|gif|webp|svg)$/i.test(u));
                const startIndex = imageUrls.findIndex((u) => u === url);
                return (
                  <button
                    key={i}
                    onClick={() => setLightbox({ urls: imageUrls, index: Math.max(0, startIndex) })}
                    className="group relative overflow-hidden rounded border"
                  >
                    <img
                      src={url}
                      alt={`Proof image ${i + 1} for milestone ${m.name}`}
                      className="h-32 w-full object-cover group-hover:scale-105 transition"
                    />
                  </button>
                );
              }
              return (
                <div key={i} className="p-3 rounded border bg-gray-50">
                  <p className="truncate text-sm">Attachment</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Open
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const filterMilestones = (milestones: Milestone[]): Milestone[] => {
    return milestones.filter((m) => {
      if (activeTab === 'All') return true;
      if (activeTab === 'Needs Approval') return !!m.proof && !m.completed;
      if (activeTab === 'Ready to Pay') return m.completed && !m.paymentTxHash;
      if (activeTab === 'Paid') return !!m.paymentTxHash;
      if (activeTab === 'No Proof') return !m.proof || String(m.proof).length === 0;
      return false;
    });
  };

  const filterBids = (bids: Bid[]): Bid[] => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return bids;

    return bids
      .map((bid) => ({
        ...bid,
        milestones: bid.milestones.filter(
          (m) =>
            bid.vendorName.toLowerCase().includes(query) ||
            bid.proposalId.toString().includes(query) ||
            (bid.vendorWallet?.toLowerCase() || '').includes(query) ||
            m.name.toLowerCase().includes(query)
        ),
      }))
      .filter((bid) => bid.milestones.length > 0);
  };

  const filteredBids = filterBids(bids).map((bid) => ({
    ...bid,
    milestones: filterMilestones(bid.milestones),
  })).filter((bid) => bid.milestones.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading submitted proofs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Submitted Proofs (Admin)</h1>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        {['All', 'Needs Approval', 'Ready to Pay', 'Paid', 'No Proof'].map((tab) => (
          <button
            key={tab}
            className={`px-4 py-2 -mb-px border-b-2 font-medium ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-blue-600'
            }`}
            onClick={() => setActiveTab(tab as any)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search Box */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by vendor, project ID, wallet, or milestone name"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filteredBids.length === 0 ? (
        <p>No milestones match the selected tab or search criteria.</p>
      ) : (
        <div className="space-y-6">
          {filteredBids.map((bid) => (
            <div key={bid.bidId} className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-2">
                {bid.vendorName} — Proposal #{bid.proposalId}
              </h2>
              <p className="text-gray-600 mb-4">Bid ID: {bid.bidId}</p>

              <div className="space-y-4">
                {bid.milestones.map((m, idx) => {
                  const canApprove = !!m.proof && !m.completed;
                  const canPay = m.completed && !m.paymentTxHash;

                  return (
                    <div key={idx} className="border-t pt-4 mt-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{m.name}</p>
                            {m.completed && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                                Approved
                              </span>
                            )}
                            {m.paymentTxHash && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                                Paid
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            Amount: ${m.amount} | Due: {m.dueDate}
                          </p>

                          {renderProof(m)}

                          {m.paymentTxHash && (
                            <p className="text-sm text-green-600 mt-2 break-all">
                              Paid ✅ Tx: {m.paymentTxHash}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          {canApprove && (
                            <button
                              onClick={() => handleApprove(bid.bidId, idx, m.proof as string)}
                              disabled={processing === `approve-${bid.bidId}-${idx}`}
                              className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50"
                            >
                              {processing === `approve-${bid.bidId}-${idx}` ? 'Approving...' : 'Approve Proof'}
                            </button>
                          )}

                          {canPay && (
                            <button
                              onClick={() => handlePay(bid.bidId, idx)}
                              disabled={processing === `pay-${bid.bidId}-${idx}`}
                              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
                            >
                              {processing === `pay-${bid.bidId}-${idx}` ? 'Paying...' : 'Release Payment'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.urls[lightbox.index]}
            alt={`Proof preview ${lightbox.index + 1}`}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {lightbox.index > 0 && (
            <button
              className="absolute left-4 text-white text-3xl font-bold"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox({ ...lightbox, index: lightbox.index - 1 });
              }}
            >
              ‹
            </button>
          )}
          {lightbox.index < lightbox.urls.length - 1 && (
            <button
              className="absolute right-4 text-white text-3xl font-bold"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox({ ...lightbox, index: lightbox.index + 1 });
              }}
            >
              ›
            </button>
          )}
          <button
            className="absolute top-4 right-4 text-white text-2xl"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// Mock API functions (replace with actual implementations)
async function getBids(): Promise<Bid[]> {
  return [];
}
async function completeMilestone(bidId: number, milestoneIndex: number, proof: string): Promise<void> {}
async function payMilestone(bidId: number, milestoneIndex: number): Promise<void> {}

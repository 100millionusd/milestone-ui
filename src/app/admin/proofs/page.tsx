'use client';

import { useEffect, useState } from 'react';
import {
  getBids,
  payMilestone,
  completeMilestone,
} from '@/lib/api';

export default function AdminProofsPage() {
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadProofs();
  }, []);

  const loadProofs = async () => {
    setLoading(true);
    setError(null);
    try {
      const allBids = await getBids();
      const withProofs = allBids.filter((b: any) =>
        b.milestones.some((m: any) => m.proof && m.proof.length > 0)
      );
      setBids(withProofs);
    } catch (e: any) {
      console.error('Error fetching proofs:', e);
      setError(e.message || 'Failed to load proofs');
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
      loadProofs();
    } catch (e: any) {
      console.error('Error approving proof:', e);
      alert(e.message || 'Failed to approve proof');
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
      loadProofs();
    } catch (e: any) {
      console.error('Error paying milestone:', e);
      alert(e.message || 'Payment failed');
    } finally {
      setProcessing(null);
    }
  };

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
      {bids.length === 0 ? (
        <p>No submitted proofs yet.</p>
      ) : (
        <div className="space-y-6">
          {bids.map((bid) => (
            <div key={bid.bidId} className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-2">
                {bid.vendorName} — Proposal #{bid.proposalId}
              </h2>
              <p className="text-gray-600 mb-4">Bid ID: {bid.bidId}</p>
              <div className="space-y-4">
                {bid.milestones.map((m: any, idx: number) => (
                  <div key={idx} className="border-t pt-4 mt-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-sm text-gray-600">
                          Amount: ${m.amount} | Due: {m.dueDate}
                        </p>

                        {/* ✅ Proof rendering */}
                        {m.proof && (() => {
                          let parsed: any = null;
                          try {
                            parsed = JSON.parse(m.proof);
                          } catch {
                            /* not JSON */
                          }

                          if (parsed && typeof parsed === 'object') {
                            return (
                              <div className="mt-2 space-y-2">
                                <p className="text-sm text-gray-700">
                                  {parsed.description || 'No description'}
                                </p>
                                {parsed.files?.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {parsed.files.map((f: any, i: number) => {
                                      const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name || f.url);
                                      if (isImage) {
                                        return (
                                          <a
                                            key={i}
                                            href={f.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group relative overflow-hidden rounded border"
                                          >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={f.url}
                                              alt={f.name}
                                              className="h-32 w-full object-cover group-hover:scale-105 transition"
                                            />
                                            <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                                              {f.name}
                                            </div>
                                          </a>
                                        );
                                      }
                                      return (
                                        <div key={i} className="p-3 rounded border bg-gray-50">
                                          <p className="truncate text-sm">{f.name}</p>
                                          <a
                                            href={f.url}
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

                          return (
                            <p className="text-sm text-blue-600 break-words">
                              Proof: {m.proof}
                            </p>
                          );
                        })()}

                        {/* ✅ Status pill */}
                        {typeof m.approved === 'boolean' ? (
                          <span
                            className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-medium ${
                              m.approved
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {m.approved ? 'Approved' : 'Rejected'}
                          </span>
                        ) : (
                          <span className="inline-block mt-2 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            Pending
                          </span>
                        )}

                        {m.paymentTxHash && (
                          <p className="text-sm text-green-600 mt-2">
                            Paid ✅ Tx: {m.paymentTxHash}
                          </p>
                        )}
                      </div>

                      {/* Buttons */}
                      <div className="flex flex-col gap-2 ml-4">
                        {!m.completed && m.proof && (
                          <button
                            onClick={() => handleApprove(bid.bidId, idx, m.proof)}
                            disabled={processing === `approve-${bid.bidId}-${idx}`}
                            className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50"
                          >
                            {processing === `approve-${bid.bidId}-${idx}`
                              ? 'Approving...'
                              : 'Approve Proof'}
                          </button>
                        )}

                        {!m.paymentTxHash && m.completed && (
                          <button
                            onClick={() => handlePay(bid.bidId, idx)}
                            disabled={processing === `pay-${bid.bidId}-${idx}`}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
                          >
                            {processing === `pay-${bid.bidId}-${idx}`
                              ? 'Paying...'
                              : 'Release Payment'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

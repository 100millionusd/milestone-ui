// src/app/admin/proposals/[id]/bids/[bidId]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBid, approveBid, rejectBid } from '@/lib/api'; // Fixed import
import MilestonePayments from '@/components/MilestonePayments';

export default function AdminBidDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [bid, setBid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const proposalId = parseInt(params.id as string);
  const bidId = parseInt(params.bidId as string);

  useEffect(() => {
    loadBid();
  }, [bidId]);

  const loadBid = async () => {
    try {
      setLoading(true);
      const bidData = await getBid(bidId);
      setBid(bidData);
    } catch (error) {
      console.error('Error loading bid:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setProcessing(true);
      await approveBid(bidId);
      await loadBid(); // Reload to get updated status
    } catch (error) {
      console.error('Error approving bid:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    try {
      setProcessing(true);
      await rejectBid(bidId); // Now this function exists
      await loadBid(); // Reload to get updated status
    } catch (error) {
      console.error('Error rejecting bid:', error);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div>Loading bid details...</div>;
  }

  if (!bid) {
    return <div>Bid not found</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link href={`/admin/proposals/${proposalId}`} className="text-blue-600 hover:underline">
          &larr; Back to proposal
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-4">Bid Details</h1>
      
      <div className="bg-white p-4 rounded shadow mb-4">
        <h2 className="text-xl font-semibold mb-2">{bid.vendorName}</h2>
        <p>Price: ${bid.priceUSD}</p>
        <p>Timeline: {bid.days} days</p>
        <p>Status: <span className={`px-2 py-1 rounded ${
          bid.status === 'approved' ? 'bg-green-100 text-green-800' :
          bid.status === 'rejected' ? 'bg-red-100 text-red-800' :
          'bg-yellow-100 text-yellow-800'
        }`}>{bid.status}</span></p>
        
        {bid.status === 'pending' && (
          <div className="mt-4 flex space-x-2">
            <button
              onClick={handleApprove}
              disabled={processing}
              className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
            >
              {processing ? 'Processing...' : 'Approve Bid'}
            </button>
            <button
              onClick={handleReject}
              disabled={processing}
              className="bg-red-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
            >
              {processing ? 'Processing...' : 'Reject Bid'}
            </button>
          </div>
        )}
      </div>

      {/* Attachments (doc / docs / files) */}
{(() => {
  const legacy = Array.isArray((bid as any)?.doc) ? (bid as any).doc : [(bid as any)?.doc].filter(Boolean);
  const docs = Array.isArray((bid as any)?.docs) ? (bid as any).docs : [];
  const files = Array.isArray((bid as any)?.files) ? (bid as any).files : [];
  const all = [...docs, ...files, ...legacy].filter(Boolean);

  const asUrl = (d: any) => (typeof d === "string" ? d : String(d?.url || ""));
  const asName = (d: any) =>
    typeof d === "string"
      ? (d.split("/").pop() || "file")
      : (d?.name || d?.filename || d?.title || d?.cid || "file");

  const isImg = (u: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(u || "");

  if (all.length === 0) return null;
  return (
    <div className="bg-white p-4 rounded shadow mb-4">
      <h3 className="text-lg font-semibold mb-2">Attachments</h3>
      <div className="flex flex-wrap gap-3">
        {all.map((d: any, i: number) => {
          const url = asUrl(d);
          const name = asName(d);
          const img = isImg(url);
          if (!url) return null;
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="group block rounded border bg-white hover:shadow-sm transition p-2"
              title={name}
            >
              {img ? (
                <img src={url} alt={name} className="w-24 h-24 object-cover rounded" loading="lazy" />
              ) : (
                <div className="w-24 h-24 rounded grid place-items-center bg-slate-50 text-slate-600 text-xs">
                  PDF / File
                </div>
              )}
              <div className="mt-1 w-24 truncate text-[11px] text-slate-700">{name}</div>
            </a>
          );
        })}
      </div>
    </div>
  );
})()}

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Milestones</h2>
        <MilestonePayments
  bid={bid}
  onUpdate={loadBid}
  proposalId={Number((params as any)?.id)}   // ← this is the proposal (project) id
/>
      </div>
    </div>
  );
}
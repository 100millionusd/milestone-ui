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

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Milestones</h2>
        <MilestonePayments
  bid={bid}
  onUpdate={loadBid}
  proposalId={Number((bid as any)?.proposalId ?? (bid as any)?.proposalID ?? (bid as any)?.proposal_id)}
/>
      </div>
    </div>
  );
}
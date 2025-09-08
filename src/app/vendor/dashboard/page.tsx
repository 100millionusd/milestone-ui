// src/app/vendor/dashboard/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBids } from '@/lib/api';

export default function VendorDashboard() {
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBids();
  }, []);

  const loadBids = async () => {
    try {
      const bidsData = await getBids();
      setBids(bidsData);
    } catch (error) {
      console.error('Error loading bids:', error);
    } finally {
      setLoading(false);
    }
  };

  const getBidStatus = (bid: any) => {
    if (bid.status === 'completed') return 'Completed';
    if (bid.status === 'approved') {
      const completed = bid.milestones.filter((m: any) => m.completed).length;
      const total = bid.milestones.length;
      return `In Progress (${completed}/${total} milestones)`;
    }
    return bid.status.charAt(0).toUpperCase() + bid.status.slice(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading your bids...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold mb-2">Vendor Dashboard</h1>
          <p className="text-gray-600">Manage your bids and submit proof of work</p>
        </div>

        <div className="grid gap-6">
          {bids.map((bid) => (
            <div key={bid.bidId} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold">{bid.title}</h2>
                  <p className="text-gray-600">Bid ID: {bid.bidId}</p>
                  <p className="text-gray-600">Organization: {bid.orgName}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  bid.status === 'approved' ? 'bg-green-100 text-green-800' :
                  bid.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                  bid.status === 'rejected' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {getBidStatus(bid)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="font-medium text-gray-600">Your Bid</p>
                  <p className="text-green-600 font-bold">${bid.priceUSD.toLocaleString()}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-600">Timeline</p>
                  <p>{bid.days} days</p>
                </div>
                <div>
                  <p className="font-medium text-gray-600">Payment</p>
                  <p>{bid.preferredStablecoin} to: {bid.walletAddress}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-600">Milestones</p>
                  <p>{bid.milestones.filter((m: any) => m.completed).length}/{bid.milestones.length} completed</p>
                </div>
              </div>

              {bid.status === 'approved' && (
                <div className="flex gap-3">
                  <Link
                    href={`/vendor/proof/${bid.bidId}`}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                  >
                    Submit Proof
                  </Link>
                  <button
                    onClick={() => navigator.clipboard.writeText(bid.walletAddress)}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                  >
                    Copy Wallet Address
                  </button>
                </div>
              )}
            </div>
          ))}

          {bids.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 text-center">
              <div className="text-4xl mb-4">💼</div>
              <h2 className="text-xl font-semibold mb-2">No Bids Yet</h2>
              <p className="text-gray-600 mb-4">You haven't submitted any bids yet.</p>
              <Link
                href="/projects"
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
              >
                Browse Projects
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

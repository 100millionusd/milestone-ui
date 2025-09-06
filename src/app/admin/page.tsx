// src/app/admin/bids/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBids, approveBid, rejectBid, getProposals } from '@/lib/api';

export default function AdminBidsPage() {
  const [bids, setBids] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [bidsData, proposalsData] = await Promise.all([
          getBids(),
          getProposals()
        ]);
        setBids(bidsData);
        setProposals(proposalsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getProposalTitle = (proposalId) => {
    const proposal = proposals.find(p => p.proposalId === proposalId);
    return proposal ? proposal.title : `Project #${proposalId}`;
  };

  const handleApprove = async (bidId) => {
    setActionLoading(prev => ({ ...prev, [bidId]: 'approving' }));
    try {
      await approveBid(bidId);
      // Update the bid status locally
      setBids(prev => prev.map(bid => 
        bid.bidId === bidId ? { ...bid, status: 'approved' } : bid
      ));
    } catch (error) {
      console.error('Error approving bid:', error);
      alert('Failed to approve bid: ' + error.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [bidId]: null }));
    }
  };

  const handleReject = async (bidId) => {
    setActionLoading(prev => ({ ...prev, [bidId]: 'rejecting' }));
    try {
      await rejectBid(bidId);
      // Update the bid status locally
      setBids(prev => prev.map(bid => 
        bid.bidId === bidId ? { ...bid, status: 'rejected' } : bid
      ));
    } catch (error) {
      console.error('Error rejecting bid:', error);
      alert('Failed to reject bid: ' + error.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [bidId]: null }));
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Admin - Bids Management</h1>
        <div className="text-center py-12">Loading bids...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin - Bids Management</h1>
        <Link 
          href="/admin/proposals"
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          Back to Proposals
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timeline
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bids.map((bid) => (
                <tr key={bid.bidId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {getProposalTitle(bid.proposalId)}
                    </div>
                    <div className="text-sm text-gray-500">
                      Project #{bid.proposalId}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {bid.vendorName}
                    </div>
                    <div className="text-sm text-gray-500">
                      {bid.walletAddress?.slice(0, 8)}...{bid.walletAddress?.slice(-6)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      ${bid.priceUSD}
                    </div>
                    <div className="text-sm text-gray-500">
                      {bid.preferredStablecoin}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {bid.days} days
                    </div>
                    <div className="text-sm text-gray-500">
                      {bid.milestones?.length || 0} milestones
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(bid.status)}`}>
                      {bid.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {bid.status === 'pending' && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleApprove(bid.bidId)}
                          disabled={actionLoading[bid.bidId]}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
                        >
                          {actionLoading[bid.bidId] === 'approving' ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(bid.bidId)}
                          disabled={actionLoading[bid.bidId]}
                          className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                        >
                          {actionLoading[bid.bidId] === 'rejecting' ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    )}
                    {bid.status === 'approved' && (
                      <Link
                        href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                      >
                        Manage
                      </Link>
                    )}
                    {bid.status === 'rejected' && (
                      <span className="text-gray-500 text-sm">Bid rejected</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {bids.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No bids found.</p>
            <p className="text-gray-400 mt-2">Bids will appear here when vendors submit them.</p>
          </div>
        )}
      </div>

      {/* Bid Statistics */}
      {bids.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-800">Total Bids</h3>
            <p className="text-2xl font-bold text-blue-600">{bids.length}</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-yellow-800">Pending</h3>
            <p className="text-2xl font-bold text-yellow-600">
              {bids.filter(b => b.status === 'pending').length}
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-green-800">Approved</h3>
            <p className="text-2xl font-bold text-green-600">
              {bids.filter(b => b.status === 'approved').length}
            </p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-red-800">Rejected</h3>
            <p className="text-2xl font-bold text-red-600">
              {bids.filter(b => b.status === 'rejected').length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
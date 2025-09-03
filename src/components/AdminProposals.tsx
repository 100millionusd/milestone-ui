// src/components/AdminProposals.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Proposal, approveProposal, rejectProposal } from '@/lib/api';

interface AdminProposalsProps {
  proposals: Proposal[];
  onUpdate: () => void;
}

const AdminProposals: React.FC<AdminProposalsProps> = ({ proposals, onUpdate }) => {
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const filteredProposals = proposals.filter(proposal => {
    if (filter === 'all') return true;
    return proposal.status === filter;
  });

  const handleApprove = async (proposalId: number) => {
    try {
      setProcessingId(proposalId);
      await approveProposal(proposalId);
      onUpdate();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to approve proposal');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (proposalId: number) => {
    try {
      setProcessingId(proposalId);
      await rejectProposal(proposalId);
      onUpdate();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to reject proposal');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Proposal Management</h2>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            All ({proposals.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'pending' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Pending ({proposals.filter(p => p.status === 'pending').length})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'approved' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Approved ({proposals.filter(p => p.status === 'approved').length})
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'rejected' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Rejected ({proposals.filter(p => p.status === 'rejected').length})
          </button>
        </div>
      </div>

      {filteredProposals.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No proposals found.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProposals.map((proposal) => (
            <div key={proposal.proposalId} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{proposal.title}</h3>
                  <p className="text-gray-600 text-sm">{proposal.orgName}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${getStatusColor(proposal.status)}`}>
                  {proposal.status.toUpperCase()}
                </span>
              </div>

              <p className="text-gray-700 mb-3">{proposal.summary}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-3">
                <div>
                  <span className="font-medium">Contact:</span> {proposal.contact}
                </div>
                <div>
                  <span className="font-medium">Budget:</span> ${proposal.amountUSD.toLocaleString()}
                </div>
                {proposal.address && (
                  <div className="md:col-span-2">
                    <span className="font-medium">Address:</span> {proposal.address}, {proposal.city}, {proposal.country}
                  </div>
                )}
              </div>

              <div className="text-xs text-gray-500 mb-3">
                Created: {new Date(proposal.createdAt).toLocaleDateString()}
              </div>

              {proposal.status === 'pending' && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleApprove(proposal.proposalId)}
                    disabled={processingId === proposal.proposalId}
                    className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {processingId === proposal.proposalId ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(proposal.proposalId)}
                    disabled={processingId === proposal.proposalId}
                    className="bg-red-600 text-white px-4 py-2 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {processingId === proposal.proposalId ? 'Rejecting...' : 'Reject'}
                  </button>
                </div>
              )}

              {proposal.cid && (
                <div className="mt-3 pt-3 border-t">
                  <span className="font-medium text-sm">IPFS CID:</span>
                  <a
                    href={`https://ipfs.io/ipfs/${proposal.cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm ml-2 hover:underline"
                  >
                    {proposal.cid}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminProposals;
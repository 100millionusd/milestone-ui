// src/app/admin/bids/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  getBids,
  approveBid,
  rejectBid,
  getProposals,
} from '@/lib/api';

const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
  'https://gateway.pinata.cloud/ipfs';

// Admin tabs
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'archived', label: 'Archived' },
] as const;
type TabKey = typeof TABS[number]['key'];

export default function AdminBidsPage() {
  const [bids, setBids] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, string | null>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  // tabs + search
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [bidsData, proposalsData] = await Promise.all([
          getBids(),
          getProposals(),
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

  const getProposalTitle = (proposalId: number) => {
    const proposal = proposals.find((p) => p.proposalId === proposalId);
    return proposal ? proposal.title : `Project #${proposalId}`;
  };

  const isBidCompleted = (bid: any) => {
    if (bid?.status === 'completed') return true;
    const ms = Array.isArray(bid?.milestones) ? bid.milestones : [];
    return ms.length > 0 && ms.every((m: any) => !!m.completed);
  };

  // Filter by tab + search
  const filteredBids = useMemo(() => {
    const lowerQ = query.trim().toLowerCase();

    const withSearch = bids.filter((b) => {
      if (!lowerQ) return true;
      const hay = [
        getProposalTitle(b.proposalId),
        String(b.proposalId || ''),
        b.vendorName || '',
        b.walletAddress || '',
        String(b.priceUSD || ''),
        b.status || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(lowerQ);
    });

    switch (tab) {
      case 'pending':
        return withSearch.filter((b) => b.status === 'pending');
      case 'approved':
        return withSearch.filter((b) => b.status === 'approved');
      case 'completed':
        return withSearch.filter((b) => b.status === 'completed' || isBidCompleted(b));
      case 'rejected':
        return withSearch.filter((b) => b.status === 'rejected');
      case 'archived':
        return withSearch.filter((b) => b.status === 'archived');
      default:
        return withSearch;
    }
  }, [bids, proposals, tab, query]);

  const handleApprove = async (bidId: number) => {
    setActionLoading((prev) => ({ ...prev, [bidId]: 'approving' }));
    try {
      await approveBid(bidId);
      setBids((prev) =>
        prev.map((bid) =>
          bid.bidId === bidId ? { ...bid, status: 'approved' } : bid
        )
      );
    } catch (error: any) {
      console.error('Error approving bid:', error);
      alert('Failed to approve bid: ' + error.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [bidId]: null }));
    }
  };

  const handleReject = async (bidId: number) => {
    setActionLoading((prev) => ({ ...prev, [bidId]: 'rejecting' }));
    try {
      await rejectBid(bidId);
      setBids((prev) =>
        prev.map((bid) =>
          bid.bidId === bidId ? { ...bid, status: 'rejected' } : bid
        )
      );
    } catch (error: any) {
      console.error('Error rejecting bid:', error);
      alert('Failed to reject bid: ' + error.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [bidId]: null }));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'archived':
        return 'bg-slate-200 text-slate-700';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const renderAttachment = (doc: any, idx: number) => {
    if (!doc) return null;

    const href =
      doc.url || (doc.cid ? `${GATEWAY}/${doc.cid}` : '#');
    const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(doc.name || href);

    if (isImage) {
      return (
        <button
          key={idx}
          onClick={() => setLightbox(href)}
          className="group relative overflow-hidden rounded border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={doc.name}
            className="h-24 w-24 object-cover group-hover:scale-105 transition"
          />
        </button>
      );
    }

    return (
      <div
        key={idx}
        className="p-2 rounded border bg-gray-50 text-xs text-gray-700 max-w-[240px]"
      >
        <p className="truncate" title={doc.name}>{doc.name}</p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Open
        </a>
      </div>
    );
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

      {/* Tabs + Search */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium border',
                tab === t.key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="w-full md:w-80">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by project, vendor, wallet, status…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
      </div>

      {/* TABLE (fixed layout; no horizontal scroll) */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full table-fixed divide-y divide-gray-200">
          {/* Column widths */}
          <colgroup>
            <col className="w-[28%]" /> {/* Project */}
            <col className="w-[22%]" /> {/* Vendor */}
            <col className="w-[10%]" /> {/* Price */}
            <col className="w-[12%]" /> {/* Timeline */}
            <col className="w-[18%]" /> {/* Attachments */}
            <col className="w-[10%]" /> {/* Status */}
            <col className="w-[12%] hidden xl:table-column" /> {/* Actions (hidden < xl) */}
          </colgroup>

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
                Attachments
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="bg-white divide-y divide-gray-200">
            {filteredBids.map((bid) => (
              <tr key={bid.bidId} className="hover:bg-gray-50 align-top">
                {/* Project */}
                <td className="px-6 py-4">
                  <div
                    className="text-sm font-medium text-gray-900 truncate max-w-[420px]"
                    title={getProposalTitle(bid.proposalId)}
                  >
                    {getProposalTitle(bid.proposalId)}
                  </div>
                  <div className="text-sm text-gray-500">
                    Project #{bid.proposalId}
                  </div>
                </td>

                {/* Vendor */}
                <td className="px-6 py-4">
                  <div
                    className="text-sm font-medium text-gray-900 truncate max-w-[340px]"
                    title={bid.vendorName}
                  >
                    {bid.vendorName}
                  </div>
                  <div className="text-xs font-mono text-gray-500">
                    {bid.walletAddress
                      ? `${bid.walletAddress.slice(0, 8)}…${bid.walletAddress.slice(-6)}`
                      : '—'}
                  </div>
                </td>

                {/* Price */}
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    ${Number(bid.priceUSD).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">
                    {bid.preferredStablecoin}
                  </div>
                </td>

                {/* Timeline */}
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">
                    {bid.days} days
                  </div>
                  <div className="text-sm text-gray-500">
                    {bid.milestones?.length || 0} milestones
                  </div>
                </td>

                {/* Attachments */}
                <td className="px-6 py-4">
                  {bid.doc ? (
                    <div className="flex flex-wrap gap-2 max-w-[260px]">
                      {renderAttachment(bid.doc, 0)}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">
                      No files
                    </span>
                  )}
                </td>

                {/* Status */}
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                      bid.status
                    )}`}
                  >
                    {bid.status}
                  </span>
                </td>

                {/* Actions (hidden on small/medium screens) */}
                <td className="px-6 py-4 text-sm font-medium hidden xl:table-cell">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/bids/${bid.bidId}`}
                      className="px-3 py-1 rounded text-sm border border-cyan-600 text-cyan-700 hover:bg-cyan-50"
                    >
                      View
                    </Link>

                    {bid.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(bid.bidId)}
                          disabled={!!actionLoading[bid.bidId]}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
                        >
                          {actionLoading[bid.bidId] === 'approving'
                            ? 'Approving...'
                            : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(bid.bidId)}
                          disabled={!!actionLoading[bid.bidId]}
                          className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                        >
                          {actionLoading[bid.bidId] === 'rejecting'
                            ? 'Rejecting...'
                            : 'Reject'}
                        </button>
                      </>
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
                    {bid.status === 'archived' && (
                      <span className="text-slate-500 text-sm">Archived</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredBids.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No bids in this view.</p>
            <p className="text-gray-400 mt-2">
              Try a different tab or clear your search.
            </p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="attachment preview"
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
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

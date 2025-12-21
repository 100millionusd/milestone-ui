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

// normalize a single attachment that may be an object or a plain URL string
type DocLike = { url?: string; cid?: string; name?: string } | string;

function normalizeDoc(d: DocLike): { url: string; cid: string; name: string } {
  if (typeof d === 'string') {
    const s = d.trim();
    return { url: s, cid: '', name: s.split('/').pop() || 'file' };
  }
  const url = String(d?.url || '').trim();
  const cid = String(d?.cid || '').trim();
  const name = String(d?.name || url.split('/').pop() || (cid ? `ipfs:${cid}` : 'file')).trim();
  return { url, cid, name };
}

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

  // --- Derived Metrics for Dashboard ---
  const stats = useMemo(() => {
    // Volume removed as requested
    const pendingCount = bids.filter((b) => b.status === 'pending').length;
    const approvedCount = bids.filter((b) => b.status === 'approved').length;
    return { pendingCount, approvedCount };
  }, [bids]);

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
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border border-red-200';
      case 'completed':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'archived':
        return 'bg-slate-200 text-slate-700 border border-slate-300';
      default:
        return 'bg-amber-100 text-amber-800 border border-amber-200';
    }
  };

  const renderAttachment = (doc: DocLike, idx: number) => {
    if (!doc) return null;

    const nd = normalizeDoc(doc);
    const href = nd.url || (nd.cid ? `${GATEWAY}/${nd.cid}` : '');
    if (!href) return null;

    const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(nd.name || href);

    if (isImage) {
      return (
        <button
          key={idx}
          onClick={() => setLightbox(href)}
          className="group relative overflow-hidden rounded border border-gray-200 shadow-sm"
          title={nd.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={nd.name}
            crossOrigin="anonymous"
            className="h-16 w-16 object-cover group-hover:scale-105 transition"
          />
        </button>
      );
    }

    return (
      <div
        key={idx}
        className="p-2 rounded border bg-gray-50 text-xs text-gray-700 max-w-[150px] flex flex-col"
        title={nd.name}
      >
        <p className="truncate font-medium mb-1">{nd.name}</p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-[10px] uppercase tracking-wide"
        >
          Open File ↗
        </a>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-screen-xl mx-auto p-6 min-h-[50vh] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <h1 className="text-xl text-gray-500">Loading data...</h1>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bids Management</h1>
          <p className="text-slate-500 text-sm mt-1">Oversee incoming project bids and vendor statuses</p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/oversight"
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition shadow-sm"
          >
            Oversight
          </Link>
          <Link
            href="/admin/proposals"
            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition shadow-sm"
          >
            Back to Proposals
          </Link>
        </div>
      </div>

      {/* Metrics Dashboard - Adjusted Grid for 2 items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Pending Action</span>
            <span className="text-2xl font-bold text-amber-600">{stats.pendingCount}</span>
          </div>
          {stats.pendingCount > 0 && (
            <div className="h-3 w-3 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>
          )}
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Active / Approved</span>
          <span className="text-2xl font-bold text-emerald-600">{stats.approvedCount}</span>
        </div>
      </div>

      {/* Controls: Tabs + Search */}
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Tabs */}
        <div className="flex overflow-x-auto pb-2 lg:pb-0 gap-1 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'px-4 py-2 rounded-full text-sm font-medium border transition-all whitespace-nowrap',
                tab === t.key
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Enhanced Search */}
        <div className="relative w-full lg:w-80 group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, vendors..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* --- CONTENT --- */}

      {/* 1. Mobile/Tablet Card View (< xl) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:hidden mb-8">
        {filteredBids.map((bid) => (
          <div key={bid.bidId} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-md ${getStatusColor(bid.status)}`}>
                  {bid.status}
                </span>
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-900 font-mono">${Number(bid.priceUSD).toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400 uppercase">{bid.preferredStablecoin || 'USDC'}</div>
                </div>
              </div>

              <h3 className="font-semibold text-slate-900 leading-snug mb-1 line-clamp-2" title={getProposalTitle(bid.proposalId)}>
                {getProposalTitle(bid.proposalId)}
              </h3>
              <p className="text-xs text-slate-500 mb-4">ID: #{bid.proposalId} • {bid.vendorName}</p>

              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs bg-slate-50 px-2 py-1 rounded border border-slate-100 text-slate-600">
                  ⏱ {bid.days} days
                </span>
                <span className="text-xs bg-slate-50 px-2 py-1 rounded border border-slate-100 text-slate-600">
                  📍 {bid.milestones?.length || 0} milestones
                </span>
              </div>
            </div>

            {/* Mobile Actions */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2 items-center">
              <Link
                href={`/admin/bids/${bid.bidId}`}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                Edit Bid
              </Link>

              {bid.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleApprove(bid.bidId)}
                    disabled={!!actionLoading[bid.bidId]}
                    className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {actionLoading[bid.bidId] === 'approving' ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(bid.bidId)}
                    disabled={!!actionLoading[bid.bidId]}
                    className="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                  >
                    {actionLoading[bid.bidId] === 'rejecting' ? '...' : 'Reject'}
                  </button>
                </>
              )}

              {bid.status === 'approved' && (
                <Link
                  href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`}
                  className="text-blue-600 text-xs font-medium hover:underline ml-auto"
                >
                  View Milestones →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 2. Desktop Table View (>= xl) */}
      <div className="hidden xl:block bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200">
        <table className="min-w-full table-fixed divide-y divide-slate-200">
          <colgroup>
            <col className="w-[28%]" /> {/* Project */}
            <col className="w-[20%]" /> {/* Vendor */}
            <col className="w-[10%]" /> {/* Price */}
            <col className="w-[10%]" /> {/* Timeline */}
            <col className="w-[16%]" /> {/* Attachments */}
            <col className="w-[8%]" />  {/* Status */}
            <col className="w-[8%]" />  {/* Actions */}
          </colgroup>

          <thead className="bg-slate-50/80 backdrop-blur">
            <tr>
              <Th>Project Context</Th>
              <Th>Vendor Info</Th>
              <Th>Est. Price</Th>
              <Th>Timeline</Th>
              <Th>Files</Th>
              <Th>Status</Th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider sticky right-0 bg-slate-50 z-10 border-l border-slate-200">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="bg-white divide-y divide-slate-100">
            {filteredBids.map((bid) => (
              <tr key={bid.bidId} className="hover:bg-slate-50/50 transition-colors align-top group">
                {/* Project */}
                <Td className="px-6 py-4">
                  <div
                    className="text-sm font-semibold text-slate-800 whitespace-normal leading-snug max-w-[400px]"
                    title={getProposalTitle(bid.proposalId)}
                  >
                    {getProposalTitle(bid.proposalId)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 font-mono">
                    ID: {bid.proposalId}
                  </div>
                </Td>

                {/* Vendor */}
                <Td className="px-6 py-4">
                  <div
                    className="text-sm font-medium text-slate-900"
                    title={bid.vendorName}
                  >
                    {bid.vendorName}
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1 truncate max-w-[180px]">
                    {bid.walletAddress || '—'}
                  </div>
                </Td>

                {/* Price */}
                <Td className="px-6 py-4">
                  <div className="text-sm font-bold font-mono text-slate-700">
                    ${Number(bid.priceUSD).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase">
                    {bid.preferredStablecoin}
                  </div>
                </Td>

                {/* Timeline */}
                <Td className="px-6 py-4">
                  <div className="text-sm text-slate-700">
                    {bid.days} <span className="text-slate-400 text-xs">days</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {bid.milestones?.length || 0} milestones
                  </div>
                </Td>

                {/* Attachments */}
                <Td className="px-6 py-4">
                  {(() => {
                    const docsArr = Array.isArray(bid?.docs)
                      ? bid.docs
                      : (bid?.doc ? [bid.doc] : []);
                    const filesArr = Array.isArray(bid?.files) ? bid.files : [];
                    const merged = [...docsArr, ...filesArr].filter(Boolean);
                    const seen = new Set<string>();
                    const uniq = merged.filter((d: DocLike) => {
                      const nd = normalizeDoc(d);
                      const key = `${(nd.url || '').toLowerCase()}|${(nd.cid || '').toLowerCase()}`;
                      if (!nd.url && !nd.cid) return false;
                      if (seen.has(key)) return false;
                      seen.add(key);
                      return true;
                    });

                    if (!uniq.length) {
                      return <span className="text-xs text-slate-300 italic">No files</span>;
                    }
                    return (
                      <div className="flex flex-wrap gap-2">
                        {uniq.map((d, i) => renderAttachment(d, i))}
                      </div>
                    );
                  })()}
                </Td>

                {/* Status */}
                <Td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${getStatusColor(
                      bid.status
                    )}`}
                  >
                    {bid.status}
                  </span>
                </Td>

                {/* Sticky Actions */}
                <td className="px-4 py-4 sticky right-0 bg-white z-10 border-l border-slate-100 group-hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/admin/bids/${bid.bidId}`}
                      className="text-center px-2 py-1 rounded text-xs font-bold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      INFO
                    </Link>

                    {bid.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(bid.bidId)}
                          disabled={!!actionLoading[bid.bidId]}
                          className="bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded text-xs font-semibold hover:bg-green-100 transition-colors disabled:opacity-50"
                        >
                          {actionLoading[bid.bidId] === 'approving'
                            ? '...'
                            : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(bid.bidId)}
                          disabled={!!actionLoading[bid.bidId]}
                          className="bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          {actionLoading[bid.bidId] === 'rejecting'
                            ? '...'
                            : 'Reject'}
                        </button>
                      </>
                    )}

                    {bid.status === 'approved' && (
                      <Link
                        href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`}
                        className="text-center text-blue-600 text-xs hover:underline"
                      >
                        Milestones
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {filteredBids.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
          <div className="bg-white p-4 rounded-full shadow-sm mb-4">
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-900">No bids found</h3>
          <p className="text-slate-500 max-w-sm mt-1 text-sm">
            We couldn&apos;t find any bids matching &quot;{query}&quot; in the <strong>{tab}</strong> view.
          </p>
          {(query || tab !== 'all') && (
            <button
              onClick={() => { setQuery(''); setTab('all'); }}
              className="mt-5 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="attachment preview"
            crossOrigin="anonymous"
            className="max-h-[90vh] max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-4xl transition"
            onClick={() => setLightbox(null)}
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------- tiny table cell helpers ------------- */
function Th({
  children,
  className = '',
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <th className={`px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: React.PropsWithChildren<{ className?: string }>) {
  return <td className={`align-top ${className}`}>{children}</td>;
}
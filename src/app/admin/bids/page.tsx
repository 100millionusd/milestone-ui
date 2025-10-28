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

// --- attachments helper (PARSES array OR JSON string; falls back to legacy doc) ---
function getAttachments(bid: any) {
  const raw = bid?.files ?? bid?.files_json ?? null;
  let files: any[] = [];

  if (Array.isArray(raw)) {
    files = raw;
  } else if (typeof raw === 'string') {
    try { files = JSON.parse(raw) || []; } catch { files = []; }
  }

  if (!files.length && bid?.doc) files = [bid.doc]; // legacy single-file

  return files
    .filter(Boolean)
    .map((f: any, idx: number) => {
      const url =
        (typeof f?.url === 'string' && f.url) ||
        (f?.cid ? `${GATEWAY}/${String(f.cid)}` : '');
      return {
        name: String(f?.name || `file-${idx + 1}`),
        url,
        cid: f?.cid || null,
        size: Number(f?.size || 0) || null,
        mimetype: f?.mimetype || f?.contentType || null,
      };
    })
    .filter((x: any) => x.url);
}

const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
  'https://gateway.pinata.cloud/ipfs';

// Admin tabs
const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'pending',   label: 'Pending' },
  { key: 'approved',  label: 'Approved' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected',  label: 'Rejected' },
  { key: 'archived',  label: 'Archived' },
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
          title={doc.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={doc.name}
            className="h-20 w-20 object-cover group-hover:scale-105 transition"
          />
        </button>
      );
    }

    return (
      <div
        key={idx}
        className="p-2 rounded border bg-gray-50 text-xs text-gray-700 max-w-[200px]"
        title={doc.name}
      >
        <p className="truncate">{doc.name}</p>
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
      <div className="max-w-screen-xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Admin - Bids Management</h1>
        <div className="text-center py-12">Loading bids...</div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto p-6">
<div className="flex justify-between items-center mb-6">
  <h1 className="text-2xl font-bold">Admin - Bids Management</h1>

  <div className="flex gap-2">
    <Link
      href="/admin/oversight"
      className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
    >
      Oversight
    </Link>
    <Link
      href="/admin/proposals"
      className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
    >
      Back to Proposals
    </Link>
  </div>
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

      {/* Desktop/table view — aims to avoid horizontal scroll */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {/* Allow scroll only if truly necessary on small screens; visible on xl */}
        <div className="overflow-x-auto xl:overflow-visible">
          <table className="min-w-full table-auto xl:table-fixed divide-y divide-gray-200">
            {/* Column widths (xl and up) sum ≈ 100% */}
            <colgroup>
              <col className="xl:w-[28%]" />  {/* Project */}
              <col className="xl:w-[22%]" />  {/* Vendor */}
              <col className="xl:w-[10%]" />  {/* Price */}
              <col className="xl:w-[12%]" />  {/* Timeline */}
              <col className="xl:w-[16%]" />  {/* Attachments */}
              <col className="xl:w-[6%]"  />  {/* Status */}
              <col className="xl:w-[6%]"  />  {/* Actions (sticky width via padding) */}
            </colgroup>

            <thead className="bg-gray-50">
              <tr>
                <Th>Project</Th>
                <Th>Vendor</Th>
                <Th>Price</Th>
                <Th>Timeline</Th>
                <Th>Attachments</Th>
                <Th>Status</Th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10 border-l">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBids.map((bid) => (
                <tr key={bid.bidId ?? bid.bid_id} className="hover:bg-gray-50 align-top">
                  {/* Project */}
                  <Td className="px-6 py-4">
                    <div
                      className="text-sm font-medium text-gray-900 whitespace-normal break-words max-w-[520px]"
                      title={getProposalTitle(bid.proposalId)}
                    >
                      {getProposalTitle(bid.proposalId)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Project #{bid.proposalId}
                    </div>
                  </Td>

                  {/* Vendor */}
                  <Td className="px-6 py-4">
                    <div
                      className="text-sm font-medium text-gray-900 whitespace-normal break-words max-w-[420px]"
                      title={bid.vendorName}
                    >
                      {bid.vendorName}
                    </div>
                    <div className="text-xs font-mono text-gray-500 mt-0.5">
                      {bid.walletAddress
                        ? `${bid.walletAddress.slice(0, 8)}…${bid.walletAddress.slice(-6)}`
                        : '—'}
                    </div>
                  </Td>

                  {/* Price */}
                  <Td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      ${Number(bid.priceUSD).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {bid.preferredStablecoin}
                    </div>
                  </Td>

                  {/* Timeline */}
                  <Td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {bid.days} days
                    </div>
                    <div className="text-xs text-gray-500">
                      {bid.milestones?.length || 0} milestones
                    </div>
                  </Td>

 {/* Attachments (multi-file aware) */}
<Td className="px-6 py-4">
  {(() => {
    const files = getAttachments(bid);

    if (!files.length) {
      return <span className="text-xs text-gray-400">No files</span>;
    }

    return (
      <div className="grid grid-cols-2 gap-1 w-[140px]">
        {files.slice(0, 4).map((f, i) => {
          const key = `${String(bid.bidId ?? bid.bid_id)}-${i}-${f.cid ?? f.url ?? f.name}`;

          if (typeof renderAttachment === 'function') {
            return (
              <div key={key} className="min-w-[64px]">
                {renderAttachment({ name: f.name, url: f.url, cid: f.cid, mimetype: f.mimetype, size: f.size }, i)}
              </div>
            );
          }

          return (
            <button
              key={key}
              type="button"
              onClick={() => setLightbox(f.url)}
              title={f.name}
              className="block border rounded overflow-hidden bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={f.name}
                className="w-[68px] h-[56px] object-cover"
                onError={(e) => {
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    parent.innerHTML =
                      `<div class="w-[68px] h-[56px] flex items-center justify-center text-[10px] px-1 bg-gray-50 text-gray-600">${(f.name || 'file')}</div>`;
                  }
                }}
              />
            </button>
          );
        })}
      </div>
    );
  })()}
</Td>

                  {/* Status */}
                  <Td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                        bid.status
                      )}`}
                    >
                      {bid.status}
                    </span>
                  </Td>

                  {/* Sticky Actions */}
                  <td className="px-4 py-4 sticky right-0 bg-white z-10 border-l">
                    <div className="flex flex-col md:flex-row gap-2">
                      <Link
                        href={`/admin/bids/${bid.bidId}`}
                        className="px-3 py-1 rounded text-sm border border-cyan-600 text-cyan-700 hover:bg-cyan-50 text-center"
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
                              ? 'Approving…'
                              : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleReject(bid.bidId)}
                            disabled={!!actionLoading[bid.bidId]}
                            className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                          >
                            {actionLoading[bid.bidId] === 'rejecting'
                              ? 'Rejecting…'
                              : 'Reject'}
                          </button>
                        </>
                      )}

                      {bid.status === 'approved' && (
                        <Link
                          href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 text-center"
                        >
                          Manage
                        </Link>
                      )}

                      {bid.status === 'rejected' && (
                        <span className="text-gray-500 text-sm">Rejected</span>
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
        </div>

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

/* ------------- tiny table cell helpers ------------- */
function Th({
  children,
  className = '',
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <th className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${className}`}>
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
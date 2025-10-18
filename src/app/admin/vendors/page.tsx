// src/app/admin/vendors/page.tsx
'use client';

import React, { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE, getAuthRole, archiveBid, deleteBid } from '@/lib/api';

type Role = 'admin' | 'vendor' | 'guest';

type VendorLite = {
  id?: string;
  vendorName: string;
  walletAddress: string;

  // status / kyc
  status?: 'pending' | 'approved' | 'rejected' | 'suspended' | 'banned';
  kycStatus?: 'none' | 'pending' | 'verified' | 'rejected';

  // stats
  totalAwardedUSD?: number;
  bidsCount?: number;
  lastBidAt?: string | null;

  // flags
  archived?: boolean;

  // CONTACT
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  postalAddress?: string | null;
  telegramChatId?: string | number | null;
  telegramUsername?: string | null;
};

type VendorBid = {
  bidId: string;
  projectId: string;
  projectTitle: string;
  amountUSD?: number | null;
  status?: 'submitted' | 'shortlisted' | 'won' | 'lost' | 'withdrawn' | 'approved' | 'rejected' | 'pending';
  createdAt: string;
};

type Paged<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export default function AdminVendorsPage() {
  const sp = useSearchParams();
  const router = useRouter();

  // Auth gate
  const [role, setRole] = useState<Role | null>(null);
  const isAdmin = role === 'admin';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info = await getAuthRole();
        if (!alive) return;
        setRole((info?.role ?? 'guest') as Role);
      } catch {
        if (!alive) return;
        setRole('guest');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Filters / pagination
  const [q, setQ] = useState(sp.get('q') || '');
  const [status, setStatus] = useState(sp.get('status') || 'all');
  const [kyc, setKyc] = useState(sp.get('kyc') || 'all');
  const [page, setPage] = useState(Number(sp.get('page') || '1'));
  const [pageSize] = useState(25);
  const [includeArchived, setIncludeArchived] = useState(sp.get('includeArchived') === 'true');

  // List state
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Paged<VendorLite>>({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });

  // Row expansion and per-row bids
  const [rowsOpen, setRowsOpen] = useState<Record<string, boolean>>({});
  const [bidsByVendor, setBidsByVendor] = useState<
    Record<string, { loading: boolean; error: string | null; bids: VendorBid[] }>
  >({});
  const [mutating, setMutating] = useState<string | null>(null);
  const [mutatingBidId, setMutatingBidId] = useState<string | null>(null);

  // Local approved cache (persists to localStorage)
  const [approvedCache, setApprovedCache] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('lx_approved_cache') || '{}');
      if (saved && typeof saved === 'object') setApprovedCache(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('lx_approved_cache', JSON.stringify(approvedCache));
    } catch {}
  }, [approvedCache]);

  // Sync URL
  useEffect(() => {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (status !== 'all') query.set('status', status);
    if (kyc !== 'all') query.set('kyc', kyc);
    if (page !== 1) query.set('page', String(page));
    if (includeArchived) query.set('includeArchived', 'true');
    const qs = query.toString();
    router.replace(`/admin/vendors${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, kyc, page, includeArchived]);

  // Load list
  const fetchList = async () => {
    setLoading(true);
    setErr(null);
    try {
      const url = new URL(`${API_BASE}/admin/vendors`);
      if (q) url.searchParams.set('search', q);
      if (status !== 'all') url.searchParams.set('status', status);
      if (kyc !== 'all') url.searchParams.set('kyc', kyc);
      if (includeArchived) url.searchParams.set('includeArchived', 'true');
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(pageSize));

      const res = await fetch(url.toString(), {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      const raw: any[] = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];

// drop any null/undefined rows BEFORE mapping to avoid "reading 'status' of null"
const items: VendorLite[] = raw
  .filter((x): x is Record<string, any> => !!x && typeof x === 'object')
  .map((it: any) => {
    const statusRaw =
      it.status ?? it.vendor_status ?? it.vendorStatus ?? (it.approved ? 'approved' : undefined);
    const statusNorm =
      typeof statusRaw === 'string' && statusRaw !== ''
        ? statusRaw.toLowerCase()
        : statusRaw
        ? 'approved'
        : 'pending';

    return {
      id: String(it.id ?? it.vendor_id ?? it.wallet_address ?? it.wallet ?? ''),
      vendorName: String(it.vendor_name ?? it.vendorName ?? it.name ?? '—'),
      walletAddress: String(it.walletAddress ?? it.wallet_address ?? it.wallet ?? '—'),
      status: statusNorm as VendorLite['status'],
      kycStatus: (it.kyc_status ?? it.kycStatus ?? 'none') as VendorLite['kycStatus'],
      totalAwardedUSD:
        typeof it.totalAwardedUSD === 'number'
          ? it.totalAwardedUSD
          : Number(it.total_awarded_usd ?? it.total_awarded ?? 0),
      bidsCount:
        typeof it.bidsCount === 'number' ? it.bidsCount : Number(it.bids_count ?? 0),
      lastBidAt: it.lastBidAt ?? it.last_bid_at ?? null,
      archived: !!(it.archived ?? it.is_archived),

      email: it.email ?? it.vendor_email ?? null,
      phone: it.phone ?? it.tel ?? it.telephone ?? null,
      website: it.website ?? it.web ?? null,
      postalAddress: it.postalAddress ?? it.address ?? null,
      telegramChatId: it.telegram_chat_id ?? it.telegramChatId ?? null,
      telegramUsername: it.telegram_username ?? it.telegramUsername ?? null,
    };
  });

      const total = typeof json?.total === 'number' ? json.total : items.length;
      const pg = typeof json?.page === 'number' ? json.page : page;
      const ps = typeof json?.pageSize === 'number' ? json.pageSize : pageSize;

      setData({ items, total, page: pg, pageSize: ps });
    } catch (e: any) {
      setErr(e?.message || 'Failed to load vendors');
      setData({ items: [], page: 1, pageSize, total: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role !== 'admin') return;
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, q, status, kyc, page, pageSize, includeArchived]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data.total || 0) / pageSize)),
    [data.total, pageSize]
  );

  // --- Admin actions ---
  const archiveVendor = async (wallet?: string) => {
    if (!wallet) return;
    if (!confirm('Archive this vendor?')) return;
    try {
      setMutating(wallet);
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/archive`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchList();
    } catch (e: any) {
      alert(e?.message || 'Failed to archive vendor');
    } finally {
      setMutating(null);
    }
  };

  const unarchiveVendor = async (wallet?: string) => {
    if (!wallet) return;
    try {
      setMutating(wallet);
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/unarchive`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchList();
    } catch (e: any) {
      alert(e?.message || 'Failed to unarchive vendor');
    } finally {
      setMutating(null);
    }
  };

  const deleteVendor = async (wallet?: string) => {
    if (!wallet) return;
    if (!confirm('PERMANENTLY delete this vendor profile? Bids remain.')) return;
    try {
      setMutating(wallet);
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchList();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete vendor');
    } finally {
      setMutating(null);
    }
  };

  const approveVendor = async (wallet?: string) => {
    if (!wallet) return;
    try {
      setMutating(wallet);
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // lock UI as approved immediately + persist
      setApprovedCache(prev => ({ ...prev, [wallet]: true }));

      // instant UI update
      setData(prev => ({
        ...prev,
        items: prev.items.map(x =>
          x.walletAddress === wallet ? { ...x, status: 'approved' } : x
        ),
      }));
      await fetchList();
    } catch (e: any) {
      alert(e?.message || 'Failed to approve vendor');
    } finally {
      setMutating(null);
    }
  };

  const rejectVendor = async (wallet?: string) => {
    if (!wallet) return;
    if (!confirm('Reject this vendor?')) return;
    try {
      setMutating(wallet);
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // instant UI update
      setData(prev => ({
        ...prev,
        items: prev.items.map(x =>
          x.walletAddress === wallet ? { ...x, status: 'rejected' } : x
        ),
      }));
      await fetchList();
    } catch (e: any) {
      alert(e?.message || 'Failed to reject vendor');
    } finally {
      setMutating(null);
    }
  };

  // Bids loader per vendor
  async function loadBidsForWallet(wallet?: string): Promise<VendorBid[]> {
    const w = (wallet || '').toLowerCase();
    if (!w) return [];
    const url = new URL(`${API_BASE}/admin/bids`);
    url.searchParams.set('vendorWallet', w);
    const res = await fetch(url.toString(), {
      credentials: 'include',
      headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const arr = Array.isArray(json?.items) ? json.items : [];
    return arr.map((b: any) => ({
      bidId: String(b.id ?? b.bidId ?? ''),
      projectId: String(b.projectId ?? ''),
      projectTitle: String(b.projectTitle ?? 'Untitled Project'),
      amountUSD: typeof b.amountUSD === 'number' ? b.amountUSD : null,
      status: (b.status ?? 'submitted') as VendorBid['status'],
      createdAt: String(b.createdAt ?? new Date().toISOString()),
    }));
  }

  // refresh the expanded vendor row after archive/delete
  async function refreshVendorRow(rowKey: string, wallet?: string) {
    setBidsByVendor(prev => ({ ...prev, [rowKey]: { loading: true, error: null, bids: [] } }));
    try {
      const bids = await loadBidsForWallet(wallet);
      setBidsByVendor(prev => ({ ...prev, [rowKey]: { loading: false, error: null, bids } }));
    } catch (e: any) {
      setBidsByVendor(prev => ({
        ...prev,
        [rowKey]: { loading: false, error: e?.message || 'Failed to load bids', bids: [] },
      }));
    }
  }

  const toggleOpen = async (rowKey: string, walletAddress?: string) => {
    setRowsOpen(prev => ({ ...prev, [rowKey]: !prev[rowKey] }));
    const opening = !rowsOpen[rowKey];
    if (!opening) return;
    if (!bidsByVendor[rowKey]) {
      setBidsByVendor(prev => ({ ...prev, [rowKey]: { loading: true, error: null, bids: [] } }));
      try {
        const bids = await loadBidsForWallet(walletAddress);
        setBidsByVendor(prev => ({ ...prev, [rowKey]: { loading: false, error: null, bids } }));
      } catch (e: any) {
        setBidsByVendor(prev => ({
          ...prev,
          [rowKey]: { loading: false, error: e?.message || 'Failed to load bids', bids: [] },
        }));
      }
    }
  };

  if (role === null) {
    return (
      <main className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Vendors</h1>
        <div className="text-slate-500">Checking your permissions…</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Vendors</h1>
        <div className="rounded border p-6 bg-white text-rose-700">403 — Admins only.</div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Vendors</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => {
                setPage(1);
                setIncludeArchived(e.target.checked);
              }}
            />
            Show archived
          </label>
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Search vendor or wallet…"
            className="border rounded px-3 py-1.5 text-sm"
          />
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="border rounded px-2 py-1.5 text-sm"
            title="Status"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
          <select
            value={kyc}
            onChange={(e) => {
              setPage(1);
              setKyc(e.target.value);
            }}
            className="border rounded px-2 py-1.5 text-sm"
            title="KYC"
          >
            <option value="all">All KYC</option>
            <option value="none">None</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* List */}
   <section className="rounded border bg-white">
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left border-b bg-slate-50">
          <th className="py-2 px-3">Vendor</th>
          <th className="py-2 px-3">Wallet</th>
          <th className="py-2 px-3">Status</th>
          <th className="py-2 px-3">KYC</th>
          <th className="py-2 px-3">Bids</th>
          <th className="py-2 px-3">Total Awarded</th>
          <th className="py-2 px-3">Last Bid</th>
          <th className="py-2 px-3 w-64">Actions</th>
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={8} className="py-6 px-3 text-slate-500">
              Loading vendors…
            </td>
          </tr>
        )}

        {err && !loading && (
          <tr>
            <td colSpan={8} className="py-6 px-3 text-rose-700">
              {err}
            </td>
          </tr>
        )}

        {!loading && !err && ((data.items || []).filter(Boolean).length === 0) && (
          <tr>
            <td colSpan={8} className="py-6 px-3 text-slate-500">
              No vendors found.
            </td>
          </tr>
        )}

        {!loading && !err && (data.items || [])
          .filter((v): v is VendorLite => !!v && typeof v === 'object')
          .map((v, idx) => {
            const rowKey = v.id || v.walletAddress || `row-${idx}`;
            const open = !!rowsOpen[rowKey];
            const bidsState = bidsByVendor[rowKey];
            const busy = mutating === v.walletAddress;
            const isApproved = v.status === 'approved' || !!approvedCache[v.walletAddress];

            return (
              <Fragment key={rowKey}>
                <tr className="border-b hover:bg-slate-50">
                  <td className="py-2 px-3 font-medium">
                    {v.vendorName || '—'}
                    {v.archived && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs bg-zinc-200 text-zinc-700 align-middle">
                        Archived
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs break-all">
                    {v.walletAddress || '—'}
                  </td>
                  <td className="py-2 px-3">
                    <StatusChip value={v.status} />
                  </td>
                  <td className="py-2 px-3">
                    <KycChip value={v.kycStatus} />
                  </td>
                  <td className="py-2 px-3">
                    {typeof v.bidsCount === 'number' ? v.bidsCount : '—'}
                  </td>
                  <td className="py-2 px-3">
                    ${Number(v.totalAwardedUSD || 0).toLocaleString()}
                  </td>
                  <td className="py-2 px-3">
                    {v.lastBidAt ? new Date(v.lastBidAt).toLocaleString() : '—'}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Bids */}
                      <button
                        onClick={() => toggleOpen(rowKey, v.walletAddress)}
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
                                   bg-slate-900 text-white hover:bg-slate-950"
                      >
                        {open ? 'Hide' : 'Details-Bids'}
                      </button>

                      {/* Approvals */}
                      {!isApproved ? (
                        <>
                          <button
                            onClick={() => approveVendor(v.walletAddress)}
                            disabled={!v.walletAddress || busy}
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
                                       bg-emerald-600 text-white hover:bg-emerald-700
                                       disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Approve vendor"
                          >
                            {busy ? 'Working…' : 'Approve'}
                          </button>
                          {v.status === 'pending' && (
                            <button
                              onClick={() => rejectVendor(v.walletAddress)}
                              disabled={!v.walletAddress || busy}
                              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
                                         bg-rose-600 text-white hover:bg-rose-700
                                         disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Reject vendor"
                            >
                              {busy ? 'Working…' : 'Reject'}
                            </button>
                          )}
                        </>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
                                     bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200"
                          title="Vendor is approved"
                        >
                          Approved
                        </span>
                      )}

                      {/* Archive / Unarchive */}
                      {!v.archived ? (
                        <button
                          onClick={() => archiveVendor(v.walletAddress)}
                          disabled={!v.walletAddress || busy}
                          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
                                     bg-amber-600 text-white hover:bg-amber-700
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Archive vendor (soft hide)"
                        >
                          {busy ? 'Archiving…' : 'Archive'}
                        </button>
                      ) : (
                        <button
                          onClick={() => unarchiveVendor(v.walletAddress)}
                          disabled={!v.walletAddress || busy}
                          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
                                     bg-emerald-600 text-white hover:bg-emerald-700
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Unarchive vendor"
                        >
                          {busy ? 'Working…' : 'Unarchive'}
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => deleteVendor(v.walletAddress)}
                        disabled={!v.walletAddress || busy}
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
                                   bg-rose-600 text-white hover:bg-rose-700
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>

                {open && (
                  <tr className="bg-slate-50 border-b">
                    <td colSpan={8} className="px-3 py-3">
                      <VendorDetails v={v} />
                      <div className="h-3" />
                      <VendorBidsPanel
                        state={bidsState}
                        busyId={mutatingBidId}
                        onArchive={async (bidId) => {
                          if (!confirm('Archive this bid?')) return;
                          try {
                            setMutatingBidId(bidId);
                            await archiveBid(Number(bidId));
                            await refreshVendorRow(rowKey, v.walletAddress);
                            await fetchList();
                          } catch (e: any) {
                            alert(e?.message || 'Failed to archive bid');
                          } finally {
                            setMutatingBidId(null);
                          }
                        }}
                        onDelete={async (bidId) => {
                          if (!confirm('PERMANENTLY delete this bid? This cannot be undone.')) return;
                          try {
                            setMutatingBidId(bidId);
                            await deleteBid(Number(bidId));
                            await refreshVendorRow(rowKey, v.walletAddress);
                            await fetchList();
                          } catch (e: any) {
                            alert(e?.message || 'Failed to delete bid');
                          } finally {
                            setMutatingBidId(null);
                          }
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
      </tbody>
    </table>
  </div>

  {/* Pagination */}
  <div className="flex items-center justify-between px-3 py-2 border-t bg-slate-50">
    <div className="text-xs text-slate-500">
      Page {data.page} of {totalPages} — {data.total} total
    </div>
    <div className="flex items-center gap-2">
      <button
        disabled={page <= 1}
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        className="px-2 py-1 text-xs rounded border disabled:opacity-50"
      >
        Prev
      </button>
      <button
        disabled={page >= totalPages}
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        className="px-2 py-1 text-xs rounded border disabled:opacity-50"
      >
        Next
      </button>
    </div>
  </div>
</section>
  );
} 

function StatusChip({ value }: { value?: VendorLite['status'] }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-rose-100 text-rose-800',
    suspended: 'bg-rose-100 text-rose-800',
    banned: 'bg-zinc-200 text-zinc-700',
  };
  const cls = value ? (map[value] || 'bg-zinc-100 text-zinc-700') : 'bg-zinc-100 text-zinc-700';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{value || '—'}</span>;
}

function KycChip({ value }: { value?: VendorLite['kycStatus'] }) {
  const map: Record<string, string> = {
    none: 'bg-zinc-100 text-zinc-700',
    pending: 'bg-amber-100 text-amber-800',
    verified: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-rose-100 text-rose-800',
  };
  const cls = value ? (map[value] || 'bg-zinc-100 text-zinc-700') : 'bg-zinc-100 text-zinc-700';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{value || '—'}</span>;
}

function VendorBidsPanel({
  state,
  busyId,
  onArchive,
  onDelete,
}: {
  state?: { loading: boolean; error: string | null; bids: VendorBid[] };
  busyId?: string | null;
  onArchive?: (bidId: string) => void;
  onDelete?: (bidId: string) => void;
}) {
  if (!state) return <div className="text-slate-500 text-sm">Loading bids…</div>;
  if (state.loading) return <div className="text-slate-500 text-sm">Loading bids…</div>;
  if (state.error) return <div className="text-rose-700 text-sm">{state.error}</div>;
  if (state.bids.length === 0) return <div className="text-slate-500 text-sm">No bids for this vendor.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-3">Project</th>
            <th className="py-2 pr-3">Amount (USD)</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Open</th>
            <th className="py-2 pr-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.bids.filter(Boolean).map((b) => {
            const busy = busyId === b.bidId;
            return (
              <tr key={b.bidId} className="border-b last:border-0">
                <td className="py-2 pr-3">{b.projectTitle || 'Untitled Project'}</td>
                <td className="py-2 pr-3">${Number(b.amountUSD || 0).toLocaleString()}</td>
                <td className="py-2 pr-3 capitalize">{b.status || 'submitted'}</td>
                <td className="py-2 pr-3">{new Date(b.createdAt).toLocaleString()}</td>
                <td className="py-2 pr-3">
                  <Link
                    href={`/projects/${encodeURIComponent(b.projectId)}`}
                    className="px-2 py-1 rounded bg-slate-900 text-white text-xs"
                  >
                    Open project
                  </Link>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex gap-2 justify-end">
                    {onArchive && (
                      <button
                        onClick={() => onArchive(b.bidId)}
                        disabled={busy}
                        className="px-2 py-1 rounded bg-amber-600 text-white text-xs disabled:opacity-50"
                        title="Archive bid"
                      >
                        {busy ? 'Working…' : 'Archive'}
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(b.bidId)}
                        disabled={busy}
                        className="px-2 py-1 rounded bg-rose-600 text-white text-xs disabled:opacity-50"
                        title="Delete bid"
                      >
                        {busy ? 'Working…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VendorDetails({ v }: { v: VendorLite }) {
  const Email = v.email ? (
    <a className="text-sky-700 hover:underline" href={`mailto:${v.email}`}>{v.email}</a>
  ) : <span className="text-slate-500">—</span>;

  const Phone = v.phone ? (
    <a className="text-sky-700 hover:underline" href={`tel:${String(v.phone).replace(/\s+/g, '')}`}>{v.phone}</a>
  ) : <span className="text-slate-500">—</span>;

  const Website = v.website ? (
    <a
      className="text-sky-700 hover:underline"
      href={/^https?:\/\//i.test(v.website) ? v.website : `https://${v.website}`}
      target="_blank" rel="noreferrer"
    >
      {v.website}
    </a>
  ) : <span className="text-slate-500">—</span>;

  const Telegram = v.telegramUsername
    ? <a className="text-sky-700 hover:underline" href={`https://t.me/${v.telegramUsername}`} target="_blank" rel="noreferrer">@{v.telegramUsername}</a>
    : v.telegramChatId
      ? <span className="font-mono text-xs">{String(v.telegramChatId)}</span>
      : <span className="text-slate-500">—</span>;

  const Address = v.postalAddress
    ? <span className="whitespace-pre-wrap">{v.postalAddress}</span>
    : <span className="text-slate-500">—</span>;

  return (
    <div className="rounded border bg-white p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        <Field label="Email">{Email}</Field>
        <Field label="Phone">{Phone}</Field>
        <Field label="Website">{Website}</Field>
        <Field label="Telegram">{Telegram}</Field>
        <Field label="Address">{Address}</Field>
        <Field label="Wallet" mono>{v.walletAddress || '—'}</Field>
      </div>
    </div>
  );
}

function Field({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={mono ? 'font-mono text-xs break-all' : 'text-slate-900'}>{children}</div>
    </div>
  );
}

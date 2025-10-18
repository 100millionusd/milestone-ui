// src/app/admin/vendors/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE, getAuthRole, archiveBid, deleteBid } from '@/lib/api';

type Role = 'admin' | 'vendor' | 'guest';

type VendorLite = {
  id?: string;
  vendorName: string;
  walletAddress: string;
  status?: 'pending' | 'approved' | 'rejected' | 'suspended' | 'banned';
  kycStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  totalAwardedUSD?: number;
  bidsCount?: number;
  lastBidAt?: string | null;
  archived?: boolean; // NEW
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
  const hasJwt = typeof window !== 'undefined' && !!localStorage.getItem('lx_jwt');

  // auth gate
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
    return () => { alive = false; };
  }, []);

  // list state
  const [q, setQ] = useState(sp.get('q') || '');
  const [status, setStatus] = useState(sp.get('status') || 'all');
  const [kyc, setKyc] = useState(sp.get('kyc') || 'all');
  const [page, setPage] = useState(Number(sp.get('page') || '1'));
  const [pageSize] = useState(25);
  const [includeArchived, setIncludeArchived] = useState(sp.get('includeArchived') === 'true'); // NEW

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Paged<VendorLite>>({ items: [], page: 1, pageSize: 25, total: 0 });

  // expanded rows: per-vendor bids cache
  const [rowsOpen, setRowsOpen] = useState<Record<string, boolean>>({});
  const [bidsByVendor, setBidsByVendor] = useState<Record<string, { loading: boolean; error: string | null; bids: VendorBid[] }>>({});
  const [mutating, setMutating] = useState<string | null>(null); // wallet being changed
  const [mutatingBidId, setMutatingBidId] = useState<string | null>(null); // bid-level busy state
  const [approvedCache, setApprovedCache] = useState<Record<string, boolean>>({});

  // sync URL
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

  const fetchList = async () => {
    setLoading(true);
    setErr(null);
    try {
      const url = new URL(`${API_BASE}/admin/vendors`);
      if (q) url.searchParams.set('search', q);
      if (status !== 'all') url.searchParams.set('status', status);
      if (kyc !== 'all') url.searchParams.set('kyc', kyc);
      if (includeArchived) url.searchParams.set('includeArchived', 'true'); // NEW
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(pageSize));
      const res = await fetch(url.toString(), { credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
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
    if (role !== 'admin' || !hasJwt) return; // gate Safari until Bearer is ready AND role is confirmed
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, hasJwt, q, status, kyc, page, pageSize, includeArchived]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((data.total || 0) / pageSize)), [data.total, pageSize]);

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
    setApprovedCache(prev => ({ ...prev, [wallet]: true }));
    // ✅ instant UI: mark approved locally, then refresh from server
    setData(prev => ({
      ...prev,
      items: prev.items.map(x => x.walletAddress === wallet ? { ...x, status: 'approved' } : x),
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
    // ✅ instant UI: mark rejected locally, then refresh
    setData(prev => ({
      ...prev,
      items: prev.items.map(x => x.walletAddress === wallet ? { ...x, status: 'rejected' } : x),
    }));
    await fetchList();
  } catch (e: any) {
    alert(e?.message || 'Failed to reject vendor');
  } finally {
    setMutating(null);
  }
};

  // --- Bids loader per vendor (uses /admin/bids?vendorWallet=...) ---
  async function loadBidsForWallet(wallet?: string): Promise<VendorBid[]> {
    const w = (wallet || '').toLowerCase();
    if (!w) return [];
    const url = new URL(`${API_BASE}/admin/bids`);
    url.searchParams.set('vendorWallet', w);
    const res = await fetch(url.toString(), { credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` } });
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
      [rowKey]: { loading: false, error: e?.message || "Failed to load bids", bids: [] }
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
        setBidsByVendor(prev => ({ ...prev, [rowKey]: { loading: false, error: e?.message || 'Failed to load bids', bids: [] } }));
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
              onChange={(e) => { setPage(1); setIncludeArchived(e.target.checked); }}
            />
            Show archived
          </label>
          <input
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Search vendor or wallet…"
            className="border rounded px-3 py-1.5 text-sm"
          />
          <select
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
            className="border rounded px-2 py-1.5 text-sm"
            title="Status"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
            <option value="banned">Banned</option>
          </select>
          <select
            value={kyc}
            onChange={(e) => { setPage(1); setKyc(e.target.value); }}
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
                <tr><td colSpan={8} className="py-6 px-3 text-slate-500">Loading vendors…</td></tr>
              )}
              {err && !loading && (
                <tr><td colSpan={8} className="py-6 px-3 text-rose-700">{err}</td></tr>
              )}
              {!loading && !err && data.items.length === 0 && (
                <tr><td colSpan={8} className="py-6 px-3 text-slate-500">No vendors found.</td></tr>
              )}
              {!loading && !err && data.items.map((v) => {
                const rowKey = v.id || v.walletAddress; // safe key
                const open = !!rowsOpen[rowKey];
                const bidsState = bidsByVendor[rowKey];
                const busy = mutating === v.walletAddress;
                const isApproved = v.status === 'approved' || !!approvedCache[v.walletAddress];
                return (
                  <>
                    <tr key={rowKey} className="border-b hover:bg-slate-50">
                      <td className="py-2 px-3 font-medium">
                        {v.vendorName || '—'}
                        {v.archived && (
                          <span className="ml-2 px-2 py-0.5 rounded text-xs bg-zinc-200 text-zinc-700 align-middle">
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs break-all">{v.walletAddress || '—'}</td>
                      <td className="py-2 px-3"><StatusChip value={v.status} /></td>
                      <td className="py-2 px-3"><KycChip value={v.kycStatus} /></td>
                      <td className="py-2 px-3">{typeof v.bidsCount === 'number' ? v.bidsCount : '—'}</td>
                      <td className="py-2 px-3">${Number(v.totalAwardedUSD || 0).toLocaleString()}</td>
                      <td className="py-2 px-3">{v.lastBidAt ? new Date(v.lastBidAt).toLocaleString() : '—'}</td>
 <td className="py-2 px-3">
  <div className="flex flex-wrap items-center gap-2">
  {/* Bids */}
  <button
    onClick={() => toggleOpen(rowKey, v.walletAddress)}
    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
               bg-slate-900 text-white hover:bg-slate-950"
  >
    {open ? 'Hide' : 'Bids'}
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
      <VendorBidsPanel
        state={bidsState}
        busyId={mutatingBidId}
        onArchive={async (bidId) => {
          if (!confirm("Archive this bid?")) return;
          try {
            setMutatingBidId(bidId);
            await archiveBid(Number(bidId));
            await refreshVendorRow(rowKey, v.walletAddress); // refresh the expanded list
            await fetchList(); // refresh top-level counts/totals
          } catch (e: any) {
            alert(e?.message || "Failed to archive bid");
          } finally {
            setMutatingBidId(null);
          }
        }}
        onDelete={async (bidId) => {
          if (!confirm("PERMANENTLY delete this bid? This cannot be undone.")) return;
          try {
            setMutatingBidId(bidId);
            await deleteBid(Number(bidId));
            await refreshVendorRow(rowKey, v.walletAddress);
            await fetchList();
          } catch (e: any) {
            alert(e?.message || "Failed to delete bid");
          } finally {
            setMutatingBidId(null);
          }
        }}
      />
    </td>
  </tr>
)}
                  </>
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
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-2 py-1 text-xs rounded border disabled:opacity-50"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-2 py-1 text-xs rounded border disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </main>
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
            <th className="py-2 pr-3 text-right">Actions</th> {/* NEW */}
          </tr>
        </thead>
        <tbody>
          {state.bids.map((b) => {
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

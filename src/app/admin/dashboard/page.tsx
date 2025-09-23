// src/app/admin/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE, getAuthRole } from '@/lib/api';

type Role = 'admin' | 'vendor' | 'guest';

type VendorLite = {
  id: string;
  vendorName: string;
  walletAddress: string;
  status?: 'pending' | 'approved' | 'suspended' | 'banned';
  kycStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  totalAwardedUSD?: number;
  bidsCount?: number;
  lastBidAt?: string | null;
  archived?: boolean; // <-- server provides this
};

type VendorBid = {
  bidId: string;
  projectId: string;
  projectTitle: string;
  amountUSD?: number | null;
  status?: 'submitted' | 'shortlisted' | 'won' | 'lost' | 'withdrawn';
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
  const [showArchived, setShowArchived] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Paged<VendorLite>>({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });

  // expanded rows: per-vendor bids cache
  const [rowsOpen, setRowsOpen] = useState<Record<string, boolean>>({});
  const [bidsByVendor, setBidsByVendor] = useState<Record<string, { loading: boolean; error: string | null; bids: VendorBid[] }>>({});

  // which wallet we’re mutating (Archive/Delete/Unarchive)
  const [mutating, setMutating] = useState<string | null>(null);

  // sync URL (nice DX)
  useEffect(() => {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (status !== 'all') query.set('status', status);
    if (kyc !== 'all') query.set('kyc', kyc);
    if (page !== 1) query.set('page', String(page));
    const qs = query.toString();
    router.replace(`/admin/vendors${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, kyc, page]);

  const fetchList = async () => {
    setLoading(true);
    setErr(null);
    try {
      const url = new URL(`${API_BASE}/admin/vendors`);
      if (q) url.searchParams.set('search', q);
      if (status !== 'all') url.searchParams.set('status', status);
      if (kyc !== 'all') url.searchParams.set('kyc', kyc);
      if (showArchived) url.searchParams.set('includeArchived', 'true');
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(pageSize));

      const res = await fetch(url.toString(), { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const items: VendorLite[] = Array.isArray(json?.items) ? json.items : (Array.isArray(json) ? json : []);
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

  useEffect(() => { fetchList(); /* eslint-disable-next-line */ }, [q, status, kyc, showArchived, page, pageSize]);

  const toggleOpen = async (vendorId: string, walletAddress?: string) => {
    setRowsOpen(prev => ({ ...prev, [vendorId]: !prev[vendorId] }));
    // lazy load bids if opening and not cached
    const already = bidsByVendor[vendorId];
    const opening = !rowsOpen[vendorId];
    if (opening && (!already || (!already.loading && already.bids.length === 0 && !already.error))) {
      setBidsByVendor(prev => ({ ...prev, [vendorId]: { loading: true, error: null, bids: [] } }));
      try {
        // Try a focused endpoint first; fallback to generic if needed
        const url = `${API_BASE}/admin/vendors/${encodeURIComponent(vendorId)}/bids`;
        const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.json();
        const bids: VendorBid[] = Array.isArray(arr) ? arr.map((b: any) => ({
          bidId: String(b?.id ?? b?.bidId ?? ''),
          projectId: String(b?.projectId ?? b?.project_id ?? ''),
          projectTitle: String(b?.projectTitle ?? b?.project_title ?? 'Untitled Project'),
          amountUSD: typeof b?.amountUSD === 'number' ? b.amountUSD : (typeof b?.amount_usd === 'number' ? b.amount_usd : null),
          status: (b?.status ?? 'submitted') as VendorBid['status'],
          createdAt: String(b?.createdAt ?? b?.created_at ?? b?.created_at_utc ?? new Date().toISOString()),
        })) : [];
        setBidsByVendor(prev => ({ ...prev, [vendorId]: { loading: false, error: null, bids } }));
      } catch (e: any) {
        const msg = e?.message || 'Failed to load bids';
        setBidsByVendor(prev => ({ ...prev, [vendorId]: { loading: false, error: msg, bids: [] } }));
      }
    }
  };

  // ---- Admin actions for vendor profile ----
  const archiveVendor = async (wallet?: string) => {
    if (!wallet) return;
    if (!confirm('Archive this vendor?')) return;
    try {
      setMutating(wallet);
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/archive`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
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
        headers: { Accept: 'application/json' },
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
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchList();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete vendor');
    } finally {
      setMutating(null);
    }
  };

  const filteredSorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = data.items.filter(v => {
      const matchesQ =
        !needle ||
        (v.vendorName || '').toLowerCase().includes(needle) ||
        (v.walletAddress || '').toLowerCase().includes(needle) ||
        (v as any).contactEmail?.toLowerCase?.().includes(needle) ||
        (v as any).city?.toLowerCase?.().includes(needle) ||
        (v as any).country?.toLowerCase?.().includes(needle);
      const matchesStatus = status === 'all' || v.status === status;
      const matchesKyc = kyc === 'all' || v.kycStatus === kyc;
      return matchesQ && matchesStatus && matchesKyc;
    });

    list.sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1;
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];

      if (sortKey === 'vendorName' || sortKey === 'walletAddress') {
        const aa = String(av || '').toLowerCase();
        const bb = String(bv || '').toLowerCase();
        if (aa === bb) {
          const an = String(a.vendorName || '').toLowerCase();
          const bn = String(b.vendorName || '').toLowerCase();
          if (an === bn) {
            const aw = String(a.walletAddress || '').toLowerCase();
            const bw = String(b.walletAddress || '').toLowerCase();
            return aw > bw ? 1 : aw < bw ? -1 : 0;
          }
          return an > bn ? 1 : -1;
        }
        return aa > bb ? dir : -dir;
      }

      if (sortKey === 'lastBidAt') {
        const ta = av ? Date.parse(String(av)) : 0;
        const tb = bv ? Date.parse(String(bv)) : 0;
        return ta === tb ? 0 : (ta > tb ? dir : -dir);
      }

      const na = Number(av || 0);
      const nb = Number(bv || 0);
      if (na === nb) return 0;
      return na > nb ? dir : -dir;
    });

    return list;
  }, [data.items, q, status, kyc, sortKey, sortDir]);

  // Sort defaults to wallet so vendor name changes don't affect ordering
  const [sortKey, setSortKey] = useState<'walletAddress' | 'lastBidAt' | 'bidsCount' | 'totalAwardedUSD' | 'vendorName'>('walletAddress');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('asc');

  const totalPages = Math.max(1, Math.ceil((data.total || filteredSorted.length || 0) / pageSize));

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
        <div className="flex items-center gap-2">
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

          {/* Show archived toggle */}
          <label className="ml-2 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
            />
            Show archived
          </label>
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
              {!loading && !err && filteredSorted.length === 0 && (
                <tr><td colSpan={8} className="py-6 px-3 text-slate-500">No vendors found.</td></tr>
              )}
              {!loading && !err && filteredSorted.map((v) => {
                const open = !!rowsOpen[v.id];
                const bidsState = bidsByVendor[v.id];
                const busy = mutating === v.walletAddress;
                return (
                  <>
                    <tr key={v.id} className={`border-b hover:bg-slate-50 ${v.archived ? 'opacity-60' : ''}`}>
                      <td className="py-2 px-3 font-medium">
                        {v.vendorName || '—'}
                        {v.archived && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-zinc-200 text-zinc-700 align-middle">
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
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleOpen(v.id, v.walletAddress)}
                            className="px-2 py-1 rounded bg-slate-900 text-white text-xs"
                          >
                            {open ? 'Hide' : 'Bids'}
                          </button>

                          {!v.archived ? (
                            <button
                              onClick={() => archiveVendor(v.walletAddress)}
                              disabled={!v.walletAddress || busy}
                              className="px-2 py-1 rounded bg-amber-600 text-white text-xs disabled:opacity-50"
                              title="Archive vendor (soft hide)"
                            >
                              {busy ? 'Archiving…' : 'Archive'}
                            </button>
                          ) : (
                            <button
                              onClick={() => unarchiveVendor(v.walletAddress)}
                              disabled={!v.walletAddress || busy}
                              className="px-2 py-1 rounded bg-emerald-600 text-white text-xs disabled:opacity-50"
                              title="Unarchive vendor"
                            >
                              {busy ? 'Restoring…' : 'Unarchive'}
                            </button>
                          )}

                          <button
                            onClick={() => deleteVendor(v.walletAddress)}
                            disabled={!v.walletAddress || busy}
                            className="px-2 py-1 rounded bg-rose-600 text-white text-xs disabled:opacity-50"
                            title="Delete vendor profile (bids remain)"
                          >
                            {busy ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50 border-b">
                        <td colSpan={8} className="px-3 py-3">
                          <VendorBidsPanel state={bidsState} />
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

function VendorBidsPanel({ state }: { state?: { loading: boolean; error: string | null; bids: VendorBid[] } }) {
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
          </tr>
        </thead>
        <tbody>
          {state.bids.map((b) => (
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

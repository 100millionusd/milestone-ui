// src/app/admin/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminTabs from '@/components/AdminTabs';
import { API_BASE, getAuthRole } from '@/lib/api';
import AgentDigestWidget from "@/components/AgentDigestWidget";

type Role = 'admin' | 'vendor' | 'guest';

type AdminVendorRaw = any;
type AdminVendor = {
  id: string;
  vendorName: string;
  walletAddress: string;
  status?: 'pending' | 'approved' | 'suspended' | 'banned';
  kycStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  bidsCount?: number;
  totalAwardedUSD?: number;
  lastBidAt?: string | null;

  // Contact / profile fields
  contactEmail?: string | null;
  phone?: string | null;

  // Address fields (street + house number, etc.)
  street?: string | null;
  addressLine?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;

  website?: string | null;

  archived?: boolean;
};

type VendorBid = {
  bidId: string;
  projectId: string;
  projectTitle: string;
  amountUSD?: number | null;
  status?:
    | 'submitted'
    | 'shortlisted'
    | 'won'
    | 'lost'
    | 'withdrawn'
    | 'approved'
    | 'rejected'
    | 'pending'
    | 'archived';
  createdAt: string;
  vendorWallet?: string;
};

type Paged<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

/* =============================== Page =============================== */

export default function AdminDashboardPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

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
      } finally {
        if (alive) setLoadingRole(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isAdmin = role === 'admin';

  const tab: string = useMemo(() => {
    const q = (sp.get('tab') || '').toLowerCase();
    if (q) return q;
    if (loadingRole) return 'vendors';
    return isAdmin ? 'vendors' : 'proposals';
  }, [sp, isAdmin, loadingRole]);

  useEffect(() => {
    if (!loadingRole && role !== 'admin' && tab === 'vendors') {
      router.replace('/admin/dashboard?tab=proposals');
    }
  }, [loadingRole, role, tab, router]);

  if (loadingRole) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Admin Dashboard</h1>
        <div className="text-slate-500">Checking your permissions…</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <div className="text-sm text-slate-500">
          Quick links:{' '}
          <Link className="underline mr-2" href="/admin/proposals">
            Proposals
          </Link>
          <Link className="underline mr-2" href="/admin/bids">
            Bids
          </Link>
          {isAdmin && (
            <Link className="underline" href="/admin/vendors">
              Vendors (standalone)
            </Link>
          )}
        </div>
      </div>

{/* Agent 2 — What’s New */}
<section className="mb-4">
  <AgentDigestWidget />
</section>


      <AdminTabs isAdmin={isAdmin} />

      {tab === 'vendors' && (isAdmin ? <VendorsTab /> : <Forbidden />)}
      {tab === 'bids' && <BidsShortcut />}
      {tab === 'proposals' && <ProposalsShortcut />}
    </main>
  );
}

function Forbidden() {
  return (
    <section className="rounded border p-6 bg-white text-rose-700">403 — Admins only.</section>
  );
}

/* ---------------- Vendors Tab (expandable bids per vendor) --------------- */

type SortKey =
  | 'bidsCount'
  | 'totalAwardedUSD'
  | 'lastBidAt'
  | 'vendorName'
  | 'walletAddress';

function mapVendor(raw: AdminVendorRaw): AdminVendor {
  const id = String(
    raw?.id ??
      raw?._id ??
      raw?.vendorId ??
      raw?.vendor_id ??
      raw?.walletAddress ??
      raw?.wallet_address ??
      raw?.address ??
      '',
  );

  const wallet = String(raw?.walletAddress ?? raw?.wallet_address ?? raw?.address ?? '');

  return {
    id,
    vendorName: String(raw?.vendorName ?? raw?.name ?? raw?.vendor_name ?? '—'),
    walletAddress: wallet,
    status: raw?.status,
    kycStatus: raw?.kycStatus ?? raw?.kyc_status,
    bidsCount: typeof raw?.bidsCount === 'number' ? raw.bidsCount : raw?.bids_count,
    totalAwardedUSD:
      typeof raw?.totalAwardedUSD === 'number'
        ? raw.totalAwardedUSD
        : typeof raw?.total_awarded_usd === 'number'
        ? raw.total_awarded_usd
        : undefined,
    lastBidAt: raw?.lastBidAt ?? raw?.last_bid_at ?? null,

    // Contact
    contactEmail: raw?.contactEmail ?? raw?.contact_email ?? raw?.email ?? null,
    phone: raw?.phone ?? null,

    // Address
    street: raw?.street ?? raw?.address1 ?? raw?.addressLine ?? raw?.address_line ?? null,
    addressLine: raw?.addressLine ?? raw?.address_line ?? raw?.address1 ?? raw?.street ?? null,
    city: raw?.city ?? raw?.profile?.city ?? null,
    postalCode:
      raw?.postalCode ??
      raw?.postal_code ??
      raw?.profile?.postalCode ??
      raw?.profile?.postal_code ??
      null,
    country: raw?.country ?? raw?.profile?.country ?? null,

    website: raw?.website ?? null,

    archived: !!raw?.archived,
  };
}

function normalizeBids(raw: any): VendorBid[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  return arr.map((b: any) => ({
    bidId: String(b?.id ?? b?.bidId ?? ''),
    projectId: String(b?.projectId ?? b?.project_id ?? ''),
    projectTitle: String(b?.projectTitle ?? b?.project_title ?? 'Untitled Project'),
    amountUSD:
      typeof b?.amountUSD === 'number'
        ? b.amountUSD
        : typeof b?.amount_usd === 'number'
        ? b.amount_usd
        : null,
    status: (b?.status ?? 'submitted') as VendorBid['status'],
    createdAt: String(b?.createdAt ?? b?.created_at ?? b?.created_at_utc ?? new Date().toISOString()),
    vendorWallet: String(
      b?.vendorWallet ??
        b?.vendor_wallet ??
        b?.vendorAddress ??
        b?.vendor_address ??
        b?.wallet ??
        b?.vendor?.wallet ??
        b?.user?.wallet ??
        '',
    ).toLowerCase(),
  }));
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Single deterministic call: GET /admin/bids?vendorWallet=<wallet> */
async function fetchBidsForWallet(wallet?: string) {
  const walletLower = (wallet || '').toLowerCase();
  if (!walletLower) return [];
  const url = new URL(`${API_BASE}/admin/bids`);
  url.searchParams.set('vendorWallet', walletLower);
  const json = await fetchJson(url.toString());
  return normalizeBids(json);
}

function VendorsTab() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | AdminVendor['status']>('all');
  const [kyc, setKyc] = useState<'all' | NonNullable<AdminVendor['kycStatus']>>('all');
  const [showArchived, setShowArchived] = useState(false);

  // Sort defaults to wallet so vendor name changes don't affect ordering
  const [sortKey, setSortKey] = useState<SortKey>('walletAddress');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('asc');

  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Paged<AdminVendor>>({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });

  const [rowsOpen, setRowsOpen] = useState<Record<string, boolean>>({});
  const [bidsByVendor, setBidsByVendor] = useState<
    Record<string, { loading: boolean; error: string | null; bids: VendorBid[] }>
  >({});
  const [mutating, setMutating] = useState<string | null>(null); // wallet currently being archived/unarchived/deleted

  // Load vendors list
  const fetchList = async () => {
    setLoading(true);
    setErr(null);
    try {
      const url = new URL(`${API_BASE}/admin/vendors`);
      if (q) url.searchParams.set('search', q);
      if (status !== 'all') url.searchParams.set('status', status as string);
      if (kyc !== 'all') url.searchParams.set('kyc', kyc as string);
      if (showArchived) url.searchParams.set('includeArchived', 'true');
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(pageSize));

      const res = await fetch(url.toString(), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const rawItems: AdminVendorRaw[] = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json)
        ? json
        : [];
      const items = rawItems.map(mapVendor).filter((v) => v.id || v.walletAddress);
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
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, kyc, showArchived, page, pageSize]);

  const filteredSorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = data.items.filter((v) => {
      const matchesQ =
        !needle ||
        (v.vendorName || '').toLowerCase().includes(needle) ||
        (v.walletAddress || '').toLowerCase().includes(needle) ||
        (v.contactEmail || '').toLowerCase().includes(needle) ||
        (v.city || '').toLowerCase().includes(needle) ||
        (v.country || '').toLowerCase().includes(needle);
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
        return ta === tb ? 0 : ta > tb ? dir : -dir;
      }

      const na = Number(av || 0);
      const nb = Number(bv || 0);
      if (na === nb) return 0;
      return na > nb ? dir : -dir;
    });

    return list;
  }, [data.items, q, status, kyc, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil((data.total || filteredSorted.length || 0) / pageSize));

  const toggleOpen = async (vendorKey: string, walletAddress?: string) => {
    setRowsOpen((prev) => ({ ...prev, [vendorKey]: !prev[vendorKey] }));
    const opening = !rowsOpen[vendorKey];
    if (!opening) return;

    if (!bidsByVendor[vendorKey]) {
      setBidsByVendor((prev) => ({ ...prev, [vendorKey]: { loading: true, error: null, bids: [] } }));

      try {
        const loaded = await fetchBidsForWallet(walletAddress);
        setBidsByVendor((prev) => ({
          ...prev,
          [vendorKey]: { loading: false, error: null, bids: loaded },
        }));
      } catch (e: any) {
        setBidsByVendor((prev) => ({
          ...prev,
          [vendorKey]: {
            loading: false,
            error: e?.message || 'Failed to load bids for this vendor.',
            bids: [],
          },
        }));
      }
    }
  };

  // --- Admin actions: archive / unarchive / delete vendor profile ---
  const archiveVendor = async (wallet?: string) => {
    if (!wallet) return;
    if (!confirm('Archive this vendor?')) return;
    try {
      setMutating(wallet);
      const res = await fetch(
        `${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/archive`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        },
      );
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
      const res = await fetch(
        `${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/unarchive`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        },
      );
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

  return (
    <section className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search vendor, wallet, city, country…"
          className="border rounded px-3 py-1.5 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as any);
            setPage(1);
          }}
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
          onChange={(e) => {
            setKyc(e.target.value as any);
            setPage(1);
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

        <label className="flex items-center gap-2 ml-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              setPage(1);
            }}
          />
          Show archived
        </label>

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-slate-600">Sort by</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="walletAddress">Wallet address</option>
            <option value="lastBidAt">Last bid (recent)</option>
            <option value="bidsCount">Bids count</option>
            <option value="totalAwardedUSD">Total awarded</option>
            <option value="vendorName">Vendor name</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            className="px-2 py-1.5 text-xs border rounded"
            title="Toggle sort direction"
          >
            {sortDir === 'desc' ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* Table */}
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
              {!loading && !err && filteredSorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 px-3 text-slate-500">
                    No vendors found.
                  </td>
                </tr>
              )}
              {!loading &&
                !err &&
                filteredSorted.map((v) => {
                  const rowId = v.id || v.walletAddress;
                  const open = !!rowsOpen[rowId];
                  const bidsState = bidsByVendor[rowId];
                  const isBusy = mutating === v.walletAddress;
                  return (
                    <>
                      <tr
                        key={rowId}
                        className={`border-b hover:bg-slate-50 ${v.archived ? 'opacity-60' : ''}`}
                      >
                        <td className="py-2 px-3 font-medium">
                          {v.vendorName || '—'}{' '}
                          {v.archived ? (
                            <span className="text-xs text-slate-500">(archived)</span>
                          ) : null}
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
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => toggleOpen(rowId, v.walletAddress)}
                              className="px-2 py-1 rounded bg-slate-900 text-white text-xs"
                            >
                              {open ? 'Hide' : 'Bids'}
                            </button>
                            {!v.archived ? (
                              <button
                                onClick={() => archiveVendor(v.walletAddress)}
                                disabled={!v.walletAddress || isBusy}
                                className="px-2 py-1 rounded bg-amber-600 text-white text-xs disabled:opacity-50"
                                title="Archive vendor (soft hide)"
                              >
                                {isBusy ? 'Archiving…' : 'Archive'}
                              </button>
                            ) : (
                              <button
                                onClick={() => unarchiveVendor(v.walletAddress)}
                                disabled={!v.walletAddress || isBusy}
                                className="px-2 py-1 rounded bg-emerald-600 text-white text-xs disabled:opacity-50"
                                title="Unarchive vendor"
                              >
                                {isBusy ? 'Restoring…' : 'Unarchive'}
                              </button>
                            )}
                            <button
                              onClick={() => deleteVendor(v.walletAddress)}
                              disabled={!v.walletAddress || isBusy}
                              className="px-2 py-1 rounded bg-rose-600 text-white text-xs disabled:opacity-50"
                              title="Delete vendor profile (bids remain)"
                            >
                              {isBusy ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50 border-b">
                          <td colSpan={8} className="px-3 py-3">
                            {/* Vendor details block */}
                            <div className="mb-3 text-xs text-slate-700 grid md:grid-cols-2 gap-y-1 gap-x-6">
                              <div>
                                <b>Email:</b> {v.contactEmail || '—'}
                              </div>
                              <div>
                                <b>Phone:</b> {v.phone || '—'}
                              </div>
                              <div className="md:col-span-2">
                                <b>Address:</b>{' '}
                                {v.street || v.addressLine || v.city || v.postalCode || v.country
                                  ? [v.street || v.addressLine || null, v.city || null, v.postalCode || null, v.country || null]
                                      .filter(Boolean)
                                      .join(', ')
                                  : '—'}
                              </div>
                              <div className="md:col-span-2">
                                <b>Website:</b>{' '}
                                {v.website ? (
                                  <a className="underline" href={v.website} target="_blank" rel="noreferrer">
                                    {v.website}
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </div>
                            </div>

                            {/* Existing bids panel (with Archive/Delete) */}
                            <VendorBidsPanel state={bidsState} wallet={v.walletAddress} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-3 py-2 border-t bg-slate-50">
          <div className="text-xs text-slate-500">
            Page {data.page} of {totalPages} — {data.total || filteredSorted.length} total
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
    </section>
  );
}

function StatusChip({ value }: { value?: AdminVendor['status'] }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    suspended: 'bg-rose-100 text-rose-800',
    banned: 'bg-zinc-200 text-zinc-700',
  };
  const cls = value ? map[value] || 'bg-zinc-100 text-zinc-700' : 'bg-zinc-100 text-zinc-700';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{value || '—'}</span>;
}

function KycChip({ value }: { value?: AdminVendor['kycStatus'] }) {
  const map: Record<string, string> = {
    none: 'bg-zinc-100 text-zinc-700',
    pending: 'bg-amber-100 text-amber-800',
    verified: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-rose-100 text-rose-800',
  };
  const cls = value ? map[value] || 'bg-zinc-100 text-zinc-700' : 'bg-zinc-100 text-zinc-700';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{value || '—'}</span>;
}

function VendorBidsPanel({
  state,
  wallet,
}: {
  state?: { loading: boolean; error: string | null; bids: VendorBid[] };
  wallet?: string;
}) {
  const VENDOR_PARAM = 'vendorWallet';

  // Local copy to allow optimistic updates after archive/delete
  const [rows, setRows] = useState<VendorBid[]>(state?.bids || []);
  const [busy, setBusy] = useState<Record<string, boolean>>({}); // bidId -> busy

  useEffect(() => {
    setRows(state?.bids || []);
  }, [state]);

  const setBusyFor = (bidId: string, v: boolean) => setBusy((prev) => ({ ...prev, [bidId]: v }));

  const archiveBid = async (bidId: string) => {
    if (!bidId) return;
    try {
      setBusyFor(bidId, true);
      const res = await fetch(`${API_BASE}/bids/${encodeURIComponent(bidId)}/archive`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Remove from current list after archiving
      setRows((prev) => prev.filter((b) => b.bidId !== bidId));
    } catch (e) {
      alert(`Failed to archive bid: ${(e as any)?.message || 'unknown error'}`);
    } finally {
      setBusyFor(bidId, false);
    }
  };

  const deleteBid = async (bidId: string) => {
    if (!bidId) return;
    if (!confirm('Delete this bid permanently? This cannot be undone.')) return;
    try {
      setBusyFor(bidId, true);
      const res = await fetch(`${API_BASE}/bids/${encodeURIComponent(bidId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `HTTP ${res.status}`);
      }
      setRows((prev) => prev.filter((b) => b.bidId !== bidId));
    } catch (e) {
      alert(`Failed to delete bid: ${(e as any)?.message || 'unknown error'}`);
    } finally {
      setBusyFor(bidId, false);
    }
  };

  if (!state) return <div className="text-slate-500 text-sm">Loading bids…</div>;
  if (state.loading) return <div className="text-slate-500 text-sm">Loading bids…</div>;
  const showEmptyHelp = !state.error && rows.length === 0;

  return (
    <div className="space-y-3">
      {state.error && <div className="text-rose-700 text-sm">{state.error}</div>}

      {showEmptyHelp && <div className="text-slate-600 text-sm">No bids found for this vendor.</div>}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Project</th>
                <th className="py-2 pr-3">Amount (USD)</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Open</th>
                <th className="py-2 pr-3">Manage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const isBusy = !!busy[b.bidId];
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
                      <div className="flex items-center gap-2">
                        <button
                          disabled={isBusy}
                          onClick={() => archiveBid(b.bidId)}
                          className="px-2 py-1 rounded bg-amber-600 text-white text-xs disabled:opacity-50"
                          title="Archive bid"
                        >
                          Archive
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => deleteBid(b.bidId)}
                          className="px-2 py-1 rounded bg-rose-700 text-white text-xs disabled:opacity-50"
                          title="Delete bid"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {wallet && (
        <div className="text-xs text-slate-500">
          Tip: Bids page filtered by this wallet:{' '}
          <Link
            href={`/admin/bids?${encodeURIComponent(VENDOR_PARAM)}=${encodeURIComponent(wallet)}`}
            className="underline"
          >
            /admin/bids?{VENDOR_PARAM}={wallet}
          </Link>
        </div>
      )}
    </div>
  );
}

/* ---------------- Other tabs (shortcuts) ---------------- */

function BidsShortcut() {
  return (
    <section className="rounded border p-6 bg-white text-slate-700">
      <h2 className="text-lg font-semibold mb-2">Bids</h2>
      <p className="mb-4">Use the dedicated page for full bid management.</p>
      <Link href="/admin/bids" className="px-4 py-2 rounded-lg bg-slate-900 text-white inline-block">
        Go to Bids
      </Link>
    </section>
  );
}

function ProposalsShortcut() {
  return (
    <section className="rounded border p-6 bg-white text-slate-700">
      <h2 className="text-lg font-semibold mb-2">Proposals</h2>
      <p className="mb-4">Use the dedicated page for full proposal management.</p>
      <Link href="/admin/proposals" className="px-4 py-2 rounded-lg bg-slate-900 text-white inline-block">
        Go to Proposals
      </Link>
    </section>
  );
}

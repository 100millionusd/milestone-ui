// src/app/admin/vendors/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE, getAuthRoleOnce, archiveBid, deleteBid } from '@/lib/api';

// --- Types (Unchanged) ---
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
  archived?: boolean;

  email?: string | null;
  phone?: string | null;
  website?: string | null;
  telegramChatId?: string | null;
  telegramUsername?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  addressText?: string | null;
};

type VendorBid = {
  bidId: string;
  projectId: string;
  projectTitle: string;
  amountUSD?: number | null;
  status?: 'submitted' | 'shortlisted' | 'won' | 'lost' | 'withdrawn' | 'approved' | 'rejected' | 'pending';
  createdAt: string;
};

type Paged<T> = { items: T[]; page: number; pageSize: number; total: number };

// --- Helper Functions (Unchanged) ---
function mailtoLink(email: string, subject?: string) {
  const s = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${email}${s}`;
}
function normalizePhoneToDigits(phone?: string | null) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d]/g, '');
  return digits || null;
}
function whatsappLink(phone?: string | null, text?: string) {
  const digits = normalizePhoneToDigits(phone);
  if (!digits) return null;
  const t = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${t}`;
}
function telegramLink(username?: string | null, chatId?: string | null) {
  if (username) return `https://t.me/${String(username).replace(/^@/, '')}`;
  if (chatId) return `tg://user?id=${String(chatId)}`;
  return null;
}
const toMailto = (email: string) => mailtoLink(email, 'Vendor contact');
const toTelegramLink = (username?: string | null, chatId?: string | null) => telegramLink(username, chatId);
const toWhatsAppLink = (phone?: string | null) => whatsappLink(phone, 'Hi — message from LithiumX admin');

export default function AdminVendorsPage() {
  const keyOf = (w?: string | null) => String(w || '').toLowerCase();
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
        const info = await getAuthRoleOnce();
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
  const [includeArchived, setIncludeArchived] = useState(sp.get('includeArchived') === 'true');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Paged<VendorLite>>({ items: [], page: 1, pageSize: 25, total: 0 });

  // expanded rows & busy
  const [rowsOpen, setRowsOpen] = useState<Record<string, boolean>>({});
  const [bidsByVendor, setBidsByVendor] = useState<Record<string, { loading: boolean; error: string | null; bids: VendorBid[] }>>({});
  const [mutating, setMutating] = useState<string | null>(null);
  const [mutatingBidId, setMutatingBidId] = useState<string | null>(null);

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

  // fetch list (server-truth)
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
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}`,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const items: VendorLite[] =
        Array.isArray(json?.items) ? json.items :
        Array.isArray(json) ? json : [];

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
    if (role !== 'admin' || !hasJwt) return;
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, hasJwt, q, status, kyc, page, pageSize, includeArchived]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data.total || 0) / pageSize)),
    [data.total, pageSize]
  );

  // Admin actions — server only, then refetch
  const archiveVendor = async (wallet?: string) => {
    if (!wallet) return;
    if (!confirm('Archive this vendor?')) return;
    try {
      setMutating(keyOf(wallet));
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/archive`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
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
      setMutating(keyOf(wallet));
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/unarchive`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
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
      setMutating(keyOf(wallet));
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}`, {
        method: 'DELETE',
        credentials: 'include',
        cache: 'no-store',
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
      setMutating(keyOf(wallet));
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/approve`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      setMutating(keyOf(wallet));
      const res = await fetch(`${API_BASE}/admin/vendors/${encodeURIComponent(wallet)}/reject`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('lx_jwt') || ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      cache: 'no-store',
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

  async function refreshVendorRow(rowKey: string, wallet?: string) {
    setBidsByVendor(prev => ({ ...prev, [rowKey]: { loading: true, error: null, bids: [] } }));
    try {
      const bids = await loadBidsForWallet(wallet);
      setBidsByVendor(prev => ({ ...prev, [rowKey]: { loading: false, error: null, bids } }));
    } catch (e: any) {
      setBidsByVendor(prev => ({ ...prev, [rowKey]: { loading: false, error: e?.message || 'Failed to load bids', bids: [] } }));
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
        <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-200 rounded w-1/4"></div>
            <div className="h-24 bg-slate-100 rounded"></div>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4 text-slate-900">Vendors</h1>
        <div className="rounded-lg border border-rose-200 p-6 bg-rose-50 text-rose-700 flex items-center gap-2">
           <span className="font-bold">403</span> Admins only.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Vendor Management</h1>
        <p className="text-slate-600 text-sm mt-1">Manage onboarding, approvals, and monitor bid activity.</p>
      </div>

      {/* Controls Card */}
      <div className="bg-white border rounded-lg shadow-sm p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
                <input
                    value={q}
                    onChange={(e) => { setPage(1); setQ(e.target.value); }}
                    placeholder="Search by Name or Wallet..."
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800 placeholder:text-slate-400"
                />
            </div>
            <select
                value={status}
                onChange={(e) => { setPage(1); setStatus(e.target.value); }}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                title="Filter Status"
            >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
            </select>
            <select
                value={kyc}
                onChange={(e) => { setPage(1); setKyc(e.target.value); }}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                title="Filter KYC"
            >
                <option value="all">All KYC</option>
                <option value="none">No KYC</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
            </select>
        </div>
        <div className="flex items-center gap-2 border-l pl-4 ml-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:text-slate-900">
            <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => { setPage(1); setIncludeArchived(e.target.checked); }}
                className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            Show Archived
            </label>
        </div>
      </div>

      {/* Main Table */}
      <section className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-xs uppercase text-slate-600 tracking-wide font-bold">
              <tr>
                <th className="py-3 px-4 w-64">Vendor Identity</th>
                <th className="py-3 px-4 w-32">Status / KYC</th>
                <th className="py-3 px-4 w-48">Contact</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-right">Perf (USD)</th>
                <th className="py-3 px-4 text-right">Bids</th>
                <th className="py-3 px-4 w-72 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="py-12 text-center text-slate-600">Loading vendors...</td></tr>
              )}
              {err && !loading && (
                <tr><td colSpan={7} className="py-12 text-center text-rose-700 font-medium">{err}</td></tr>
              )}
              {!loading && !err && data.items.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-slate-600">No vendors found matching criteria.</td></tr>
              )}
              {!loading && !err && data.items.map((v, idx) => {
                const rowKey = (v?.id || v?.walletAddress || `row-${idx}`) as string;
                const open = !!rowsOpen[rowKey];
                const bidsState = bidsByVendor[rowKey];
                const busy = mutating === keyOf(v.walletAddress);

                // ---- ROW FLAGS (server-truth only) ----
                const effectiveStatus = String(v.status ?? '').trim().toLowerCase();
                const isApprovedVisual = effectiveStatus === 'approved';
                const isRejectedVisual = effectiveStatus === 'rejected';
                // ---------------------------------------

                return (
                  <>
                    <tr key={rowKey} className={`hover:bg-slate-50 transition-colors ${open ? 'bg-slate-50/80' : ''}`}>
                      {/* Identity Column */}
                      <td className="py-3 px-4 align-top">
                        <div className="font-bold text-slate-900 text-base">
                            {v.vendorName || 'Unknown Vendor'}
                            {v.archived && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-600 border border-zinc-200 align-middle">
                                    Archived
                                </span>
                            )}
                        </div>
                        <div className="mt-1 text-xs font-mono text-slate-600 truncate max-w-[200px]" title={v.walletAddress}>
                            {v.walletAddress || 'No Wallet'}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 font-medium">
                             Last active: {v.lastBidAt ? new Date(v.lastBidAt).toLocaleDateString() : 'Never'}
                        </div>
                      </td>

                      {/* Status / KYC */}
                      <td className="py-3 px-4 align-top">
                        <div className="flex flex-col gap-1.5 items-start">
                            <StatusChip value={isRejectedVisual ? 'rejected' : (isApprovedVisual ? 'approved' : v.status)} />
                            <KycChip value={v.kycStatus} />
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3 px-4 align-top text-xs">
                        <div className="space-y-1.5">
                            {v.email ? (
                                <div className="truncate max-w-[180px] flex items-center text-slate-700">
                                    <span className="text-slate-500 mr-1.5 text-sm">✉</span>
                                    <a href={toMailto(v.email)!} className="hover:text-indigo-700 hover:underline underline-offset-2 font-medium">
                                        {v.email}
                                    </a>
                                </div>
                            ) : <div className="text-slate-400">No Email</div>}

                            {(v.phone || v.whatsapp) && (
                                <div className="flex items-center text-slate-700">
                                    <span className="text-slate-500 mr-1.5 text-sm">📞</span>
                                    <a href={toWhatsAppLink(v.whatsapp || v.phone) || '#'} target="_blank" rel="noreferrer" className="hover:text-green-700 hover:underline font-medium">
                                        {v.phone || v.whatsapp}
                                    </a>
                                </div>
                            )}

                            {(v.telegramUsername || v.telegramChatId) && (
                                <div className="flex items-center text-slate-700">
                                    {/* Telegram SVG Icon */}
                                    <span className="mr-1.5 flex-shrink-0" style={{ width: '14px', height: '14px' }}>
                                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-slate-500">
                                            <path d="M21.7 2.3a2 2 0 0 0-2 .4l-17 6.4a2 2 0 0 0-.1 3.7l4.5 1.4 1.7 5.5c.3 1 .6 1.4 1.6 1.4.6 0 1-.2 1.3-.5l2.4-2.3 5 3.7c.9.5 2.1.1 2.3-1l3-18a2 2 0 0 0-1.7-2.3zM6.8 13.3l.9 3-.3-1.1v-1.9z" fill="currentColor"/>
                                        </svg>
                                    </span>
                                    <a href={toTelegramLink(v.telegramUsername, v.telegramChatId) || '#'} target="_blank" rel="noreferrer" className="hover:text-sky-600 hover:underline font-medium">
                                        {v.telegramUsername ? `@${String(v.telegramUsername).replace(/^@/, '')}` : 'Telegram'}
                                    </a>
                                </div>
                            )}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3 px-4 align-top text-xs text-slate-800 font-medium">
                        <div className="line-clamp-3 max-w-[150px]" title={v.addressText || v.address || ''}>
                            {v.addressText || v.address || '—'}
                        </div>
                      </td>

                      {/* Perf USD */}
                      <td className="py-3 px-4 align-top text-right font-semibold text-slate-800">
                        ${Number(v.totalAwardedUSD || 0).toLocaleString()}
                      </td>

                      {/* Bids */}
                      <td className="py-3 px-4 align-top text-right">
                        {typeof v.bidsCount === 'number' ? (
                            <span className="inline-block min-w-[1.5rem] text-center py-0.5 px-1 bg-slate-200 rounded text-slate-800 text-xs font-bold">
                                {v.bidsCount}
                            </span>
                        ) : '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 align-top text-right">
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            {/* Main Action: Info/Bids */}
                            <button
                                onClick={() => toggleOpen(rowKey, v.walletAddress)}
                                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${open ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900'}`}
                            >
                                {open ? 'Close Details' : 'View Bids'}
                            </button>

                            {/* Approval Flow */}
                            {isApprovedVisual ? (
                                <span className="px-2 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md cursor-default flex items-center gap-1">
                                    ✓ Active
                                </span>
                            ) : isRejectedVisual ? (
                                <span className="px-2 py-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-md cursor-default">
                                    ✖ Rejected
                                </span>
                            ) : (
                                <div className="flex rounded-md shadow-sm" role="group">
                                    <button
                                        onClick={() => approveVendor(v.walletAddress)}
                                        disabled={!v.walletAddress || busy}
                                        className="px-2 py-1 text-xs font-medium bg-emerald-600 text-white border border-emerald-600 rounded-l-md hover:bg-emerald-700 disabled:opacity-50"
                                        title="Approve"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => rejectVendor(v.walletAddress)}
                                        disabled={!v.walletAddress || busy}
                                        className="px-2 py-1 text-xs font-medium bg-white text-rose-600 border border-l-0 border-rose-200 rounded-r-md hover:bg-rose-50 disabled:opacity-50"
                                        title="Reject"
                                    >
                                        Reject
                                    </button>
                                </div>
                            )}
                          </div>

                          {/* Secondary Actions: Archive/Delete */}
                          <div className="flex items-center gap-2 mt-1">
                             <div className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
                                {!v.archived ? (
                                    <button
                                        onClick={() => archiveVendor(v.walletAddress)}
                                        disabled={!v.walletAddress || busy}
                                        className="text-xs text-slate-500 hover:text-amber-600 underline decoration-dotted underline-offset-2"
                                    >
                                        Archive
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => unarchiveVendor(v.walletAddress)}
                                        disabled={!v.walletAddress || busy}
                                        className="text-xs text-emerald-700 hover:text-emerald-800 underline decoration-dotted underline-offset-2"
                                    >
                                        Unarchive
                                    </button>
                                )}

                                <span className="text-slate-400">|</span>

                                <button
                                    onClick={() => deleteVendor(v.walletAddress)}
                                    disabled={!v.walletAddress || busy}
                                    className="text-xs text-slate-500 hover:text-rose-600 underline decoration-dotted underline-offset-2"
                                >
                                    Delete
                                </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {open && (
                      <tr key={`${rowKey}-details`} className="bg-slate-50/50 shadow-inner">
                        <td colSpan={7} className="px-4 py-4 border-b border-slate-200">
                          <div className="bg-white border rounded-lg p-4 shadow-sm">
                             <div className="flex items-center justify-between mb-3 border-b pb-2">
                                <h4 className="font-semibold text-sm text-slate-900">Bid History & Details</h4>
                             </div>
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
                          </div>
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
        <div className="flex items-center justify-between px-4 py-3 border-t bg-white">
          <div className="text-xs text-slate-600">
            Showing page <span className="font-bold text-slate-800">{data.page}</span> of <span className="font-bold text-slate-800">{totalPages}</span> — <span className="font-bold text-slate-800">{data.total}</span> total items
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-xs font-medium rounded border border-slate-300 hover:bg-slate-50 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 text-xs font-medium rounded border border-slate-300 hover:bg-slate-50 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
    pending: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20',
    suspended: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20',
    banned: 'bg-zinc-100 text-zinc-700 border-zinc-200 ring-zinc-500/20',
  };
  const base = "inline-flex items-center rounded-md px-2 py-1 text-xs font-bold border ring-1 ring-inset";
  const cls = value ? (map[value] || 'bg-zinc-50 text-zinc-600 border-zinc-200') : 'bg-zinc-50 text-zinc-600 border-zinc-200';
  return <span className={`${base} ${cls} capitalize`}>{value || 'Unknown'}</span>;
}

function KycChip({ value }: { value?: VendorLite['kycStatus'] }) {
    const map: Record<string, string> = {
      none: 'text-slate-500',
      pending: 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded',
      verified: 'text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded',
      rejected: 'text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded',
    };
    const label = value === 'none' ? 'No KYC' : (value || 'No KYC');
    const cls = value ? (map[value] || 'text-slate-500') : 'text-slate-500';
    
    return <span className={`text-[10px] uppercase tracking-wider font-medium ${cls}`}>{label}</span>;
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
  if (!state) return <div className="text-slate-500 text-sm italic p-2">Loading bids...</div>;
  if (state.loading) return <div className="text-slate-500 text-sm italic p-2">Loading bids...</div>;
  if (state.error) return <div className="text-rose-700 text-sm p-2 bg-rose-50 rounded border border-rose-200">{state.error}</div>;
  if (state.bids.length === 0) return <div className="text-slate-500 text-sm p-2 text-center italic">No bids found for this vendor.</div>;

  return (
    <div className="overflow-hidden border rounded-md">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-100 text-xs font-bold text-slate-600 uppercase">
          <tr>
            <th className="py-2 px-3">Project Title</th>
            <th className="py-2 px-3 text-right">Amount</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Submitted</th>
            <th className="py-2 px-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {state.bids.map((b) => {
            const busy = busyId === b.bidId;
            return (
              <tr key={b.bidId} className="hover:bg-slate-50">
                <td className="py-2 px-3">
                    <Link href={`/projects/${encodeURIComponent(b.projectId)}`} className="font-medium text-indigo-700 hover:underline truncate block max-w-[200px]">
                        {b.projectTitle || 'Untitled Project'}
                    </Link>
                    <div className="text-[10px] text-slate-500 font-mono">{b.bidId}</div>
                </td>
                <td className="py-2 px-3 text-right font-mono text-slate-800 font-medium">${Number(b.amountUSD || 0).toLocaleString()}</td>
                <td className="py-2 px-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize
                        ${b.status === 'won' ? 'bg-green-100 text-green-700' : 
                          b.status === 'lost' ? 'bg-gray-100 text-gray-700' : 
                          'bg-blue-50 text-blue-700'}`}>
                        {b.status || 'submitted'}
                    </span>
                </td>
                <td className="py-2 px-3 text-slate-600 text-xs">{new Date(b.createdAt).toLocaleDateString()}</td>
                <td className="py-2 px-3 text-right">
                  <div className="flex gap-2 justify-end">
                    {onArchive && (
                      <button
                        onClick={() => onArchive(b.bidId)}
                        disabled={busy}
                        className="text-xs text-amber-700 hover:text-amber-800 hover:underline disabled:opacity-50"
                      >
                        {busy ? '...' : 'Archive'}
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(b.bidId)}
                        disabled={busy}
                        className="text-xs text-rose-700 hover:text-rose-800 hover:underline disabled:opacity-50"
                      >
                        {busy ? '...' : 'Delete'}
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
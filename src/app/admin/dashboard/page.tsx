// src/app/admin/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminTabs from '@/components/AdminTabs';
import { API_BASE, getAuthRole } from '@/lib/api';

type AdminVendor = {
  vendorName: string;
  walletAddress: string;
  bidsCount: number;
  lastBidAt: string | null;
  totalAwardedUSD: number;
};

export default function AdminDashboardPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const [role, setRole] = useState<'admin'|'vendor'|'guest' | null>(null);
  const isAdmin = role === 'admin';

  useEffect(() => {
    (async () => {
      const info = await getAuthRole();
      setRole(info.role);
    })();
  }, []);

  const tab = (sp.get('tab') || (isAdmin ? 'vendors' : 'proposals')).toLowerCase();

  // If not admin and user forced ?tab=vendors, bounce them to proposals
  useEffect(() => {
    if (role && role !== 'admin' && tab === 'vendors') {
      router.replace('/admin/dashboard?tab=proposals');
    }
  }, [role, tab, router]);

  if (!role) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Admin Dashboard</h1>
        <div className="text-slate-500">Loading…</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <div className="text-sm text-slate-500">
          Quick links:{' '}
          <Link className="underline mr-2" href="/admin/proposals">Proposals</Link>
          <Link className="underline mr-2" href="/admin/bids">Bids</Link>
          {isAdmin && <Link className="underline" href="/admin/vendors">Vendors (standalone)</Link>}
        </div>
      </div>

      <AdminTabs isAdmin={isAdmin} />

      {tab === 'vendors'   && (isAdmin ? <VendorsTab /> : <Forbidden />)}
      {tab === 'bids'      && <BidsShortcut />}
      {tab === 'proposals' && <ProposalsShortcut />}
    </main>
  );
}

function Forbidden() {
  return (
    <section className="rounded border p-6 bg-white text-rose-700">
      403 — Admins only.
    </section>
  );
}

function VendorsTab() {
  const [rows, setRows] = useState<AdminVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`${API_BASE}/admin/vendors`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (alive) setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (alive) setErr(e?.message || 'Failed to load vendors');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      r.vendorName.toLowerCase().includes(needle) ||
      (r.walletAddress || '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  return (
    <section className="rounded border p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Vendors</h2>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search vendor or wallet…"
          className="border rounded px-3 py-1.5 text-sm"
        />
      </div>

      {loading && <div className="text-slate-500">Loading…</div>}
      {err && <div className="text-rose-700">{err}</div>}

      {!loading && !err && filtered.length === 0 && (
        <div className="text-slate-500">No vendors found.</div>
      )}

      {!loading && !err && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2 pr-3">Wallet</th>
                <th className="py-2 pr-3">Bids</th>
                <th className="py-2 pr-3">Total Awarded (USD)</th>
                <th className="py-2 pr-3">Last Bid</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={`${v.walletAddress}-${i}`} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{v.vendorName || '—'}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{v.walletAddress || '—'}</td>
                  <td className="py-2 pr-3">{v.bidsCount}</td>
                  <td className="py-2 pr-3">
                    ${Number(v.totalAwardedUSD || 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">
                    {v.lastBidAt ? new Date(v.lastBidAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

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

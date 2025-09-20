'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAdminVendors, type VendorSummary } from '@/lib/api';

export default function AdminVendorsPage() {
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const rows = await getAdminVendors();
        setVendors(rows);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load vendors');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return vendors;
    return vendors.filter(v =>
      v.vendorName.toLowerCase().includes(s) ||
      v.walletAddress.toLowerCase().includes(s)
    );
  }, [q, vendors]);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vendors</h1>
        <Link href="/admin" className="underline">← Admin</Link>
      </div>

      <div className="flex items-center gap-3">
        <input
          className="w-80 border rounded-lg px-3 py-2 text-sm"
          placeholder="Search by name or wallet…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="text-sm text-slate-500">
          {filtered.length} / {vendors.length} vendors
        </div>
      </div>

      {loading && <div className="py-10 text-center text-slate-500">Loading…</div>}
      {err && <div className="p-3 rounded border bg-rose-50 text-rose-700">{err}</div>}

      {!loading && !err && (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="[&>th]:py-2 [&>th]:px-3 text-left">
                <th>Vendor</th>
                <th>Wallet</th>
                <th className="text-right">Bids</th>
                <th className="text-right">Total Awarded (USD)</th>
                <th className="text-right">Last Bid</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={`${v.vendorName}-${v.walletAddress}-${i}`} className="border-t">
                  <td className="py-2 px-3">{v.vendorName || '—'}</td>
                  <td className="py-2 px-3 font-mono text-xs">{v.walletAddress || '—'}</td>
                  <td className="py-2 px-3 text-right">{v.bidsCount.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right">
                    ${v.totalAwardedUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {v.lastBidAt ? new Date(v.lastBidAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">No vendors match your search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

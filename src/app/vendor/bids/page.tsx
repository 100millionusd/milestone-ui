// src/app/vendor/bids/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as api from '@/lib/api';

export default function VendorBidsPage() {
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await api.getVendorBids(); // sends credentials: 'include'
        if (mounted) setBids(rows);
      } catch (e: any) {
        if (mounted) setErr(e?.message || 'Failed to load bids');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <main className="max-w-5xl mx-auto p-6">Loading…</main>;
  if (err) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <p className="text-rose-700">Error: {err}</p>
        <p className="text-sm text-slate-500 mt-2">
          If you just logged in, refresh once so the cookie is included.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your Bids</h1>
        <Link
          href="/vendor/bids/new"
          className="px-3 py-2 rounded bg-slate-900 text-white"
        >
          + New Bid
        </Link>
      </div>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Bid #</th>
              <th className="px-4 py-2 text-left">Proposal</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Price (USD)</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {bids.map((b) => (
              <tr key={b.bidId} className="border-t">
                <td className="px-4 py-2">{b.bidId}</td>
                <td className="px-4 py-2">#{b.proposalId}</td>
                <td className="px-4 py-2">{b.vendorName}</td>
                <td className="px-4 py-2">{b.priceUSD?.toLocaleString?.() ?? b.priceUSD}</td>
                <td className="px-4 py-2 capitalize">{b.status}</td>
                <td className="px-4 py-2">
                  <Link
                    href={`/vendor/bids/${b.bidId}`}
                    className="text-cyan-600 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {bids.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  No bids yet. Click “New Bid” to submit one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

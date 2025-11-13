'use client';

import { useEffect, useRef, useState } from 'react';
import { getProposerProfile } from '@/lib/api';

type Address = {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

function parseAddress(raw?: Address | string | null, addressText?: string | null): Address {
  if (raw && typeof raw === 'object') {
    return {
      line1: raw.line1 || '',
      city: raw.city || '',
      state: (raw as any).state || '',
      postalCode: raw.postalCode || '',
      country: raw.country || '',
    };
  }
  const src = typeof raw === 'string' && raw ? raw : (addressText || '');
  const parts = String(src).split(',').map(s => s.trim());
  return {
    line1: parts[0] || '',
    city: parts[1] || '',
    postalCode: parts[2] || '',
    country: parts[3] || '',
    state: '',
  };
}

export default function ProposerProfilePage() {
  const did = useRef(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    vendorName: '',
    email: '',
    phone: '',
    website: '',
    address: { line1: '', city: '', state: '', postalCode: '', country: '' } as Address,
  });

  // ⛳️ Re-fetch once on mount so refresh always repopulates the form
  useEffect(() => {
    if (did.current) return;
    did.current = true;

    (async () => {
      try {
        setLoading(true);
        const p = await getProposerProfile(); // uses api.ts (Bearer/cookies + no-store)
        setForm({
          vendorName: p?.vendorName || '',
          email: p?.email || '',
          phone: p?.phone || '',
          website: p?.website || '',
          address: parseAddress(p?.address, p?.addressText),
        });
      } catch (e: any) {
        setErr(e?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="flex items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" />
          <span className="ml-3">Loading profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Entity Profile</h1>

      {err && <div className="rounded-xl border bg-rose-50 text-rose-700 px-3 py-2">{err}</div>}

      <label className="block">
        <span className="text-sm font-medium">Organization / Entity Name *</span>
        <input
          className="w-full border rounded-lg px-3 py-2 mt-1"
          value={form.vendorName}
          onChange={e => setForm({ ...form, vendorName: e.target.value })}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          className="w-full border rounded-lg px-3 py-2 mt-1"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Phone</span>
        <input
          type="tel"
          className="w-full border rounded-lg px-3 py-2 mt-1"
          value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Website</span>
        <input
          type="url"
          className="w-full border rounded-lg px-3 py-2 mt-1"
          value={form.website}
          onChange={e => setForm({ ...form, website: e.target.value })}
        />
      </label>

      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-lg p-4">
        <legend className="text-sm font-medium px-2">Address</legend>

        <label className="block md:col-span-2">
          <span className="text-sm">Address Line 1</span>
          <input
            className="w-full border rounded-lg px-3 py-2 mt-1"
            value={form.address.line1}
            onChange={e => setForm({ ...form, address: { ...form.address, line1: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">City</span>
          <input
            className="w-full border rounded-lg px-3 py-2 mt-1"
            value={form.address.city}
            onChange={e => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">State/Province</span>
          <input
            className="w-full border rounded-lg px-3 py-2 mt-1"
            value={form.address.state}
            onChange={e => setForm({ ...form, address: { ...form.address, state: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">Postal Code</span>
          <input
            className="w-full border rounded-lg px-3 py-2 mt-1"
            value={form.address.postalCode}
            onChange={e => setForm({ ...form, address: { ...form.address, postalCode: e.target.value } })}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm">Country</span>
          <input
            className="w-full border rounded-lg px-3 py-2 mt-1"
            value={form.address.country}
            onChange={e => setForm({ ...form, address: { ...form.address, country: e.target.value } })}
          />
        </label>
      </fieldset>
    </div>
  );
}

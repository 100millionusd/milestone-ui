// src/app/proposer/profile/ProposerProfileForm.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProposerProfile, chooseRole, getProposerProfile } from '@/lib/api';

type Address = {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type Initial = {
  vendorName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: Address | string | null;
  addressText?: string | null;
};

function parseAddress(raw: any, addressText?: string | null): Address {
  // Already structured
  if (raw && typeof raw === 'object') {
    return {
      line1: raw.line1 || '',
      city: raw.city || '',
      state: raw.state || '',
      postalCode: raw.postalCode || '',
      country: raw.country || '',
    };
  }

  // Accept free-text string (or addressText)
  const text = (typeof raw === 'string' && raw.trim()) ? raw : (addressText || '');
  if (!text) return { line1: '', city: '', state: '', postalCode: '', country: '' };

  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  const [line1 = '', city = '', third = '', fourth = ''] = parts;

  let postalCode = '';
  let country = '';

  if (parts.length >= 4) {
    const thirdHasDigits = /\d/.test(third);
    const fourthHasDigits = /\d/.test(fourth);
    if (thirdHasDigits && !fourthHasDigits) { postalCode = third; country = fourth; }
    else if (fourthHasDigits && !thirdHasDigits) { postalCode = fourth; country = third; }
    else { postalCode = third; country = fourth; }
  } else if (parts.length === 3) {
    country = third;
  }

  return { line1, city, state: '', postalCode, country };
}

export default function ProposerProfileForm({ initial = {} as Initial }) {
  const router = useRouter();
  const inited = useRef(false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState(() => ({
    vendorName: initial?.vendorName || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    website: initial?.website || '',
    address: parseAddress(initial?.address, initial?.addressText),
  }));

  // Refetch on mount (client) so the form populates even if SSR had no auth
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await getProposerProfile();
        if (!alive) return;
        setForm({
          vendorName: p?.vendorName || '',
          email: p?.email || '',
          phone: p?.phone || '',
          website: p?.website || '',
          address: parseAddress(p?.address, p?.addressText),
        });
      } catch (e) {
        // console.warn('[PROFILE] refetch failed:', e);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Guard against StrictMode double init & keep any server-provided initial once
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    setForm({
      vendorName: initial?.vendorName || '',
      email: initial?.email || '',
      phone: initial?.phone || '',
      website: initial?.website || '',
      address: parseAddress(initial?.address, initial?.addressText),
    });
  }, [initial]);

  // Safety: if something ever sets address as a string, coerce it once on first render
  useEffect(() => {
    setForm(prev => {
      const a: any = (prev as any).address;
      if (typeof a === 'string') {
        return { ...prev, address: parseAddress(a, (prev as any).addressText) };
      }
      return prev;
    });
    // run only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onContinueAsEntity() {
    if (saving) return;
    if (!form.vendorName.trim()) {
      setErr('Organization name is required');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      // 1) Save profile
      await saveProposerProfile({
        vendorName: form.vendorName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        website: form.website.trim(),
        address: form.address,
      });

      // 2) Ensure role=proposer (also gives a token)
      await chooseRole('proposer');

      // 3) Read back once to confirm and sync UI state
      const reread = await getProposerProfile();
      setForm({
        vendorName: reread?.vendorName || '',
        email: reread?.email || '',
        phone: reread?.phone || '',
        website: reread?.website || '',
        address: parseAddress(reread?.address, reread?.addressText),
      });

      // 4) Go to creation flow
      router.replace('/new?flash=proposer-profile-saved');
    } catch (e: any) {
      setErr(e?.message || 'Failed to save entity profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Entity Profile</h1>
      <p className="text-slate-600">Complete your organization profile to submit proposals.</p>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
          {err}
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium">Organization / Entity Name *</span>
        <input
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          value={form.vendorName}
          onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
          placeholder="Your organization name"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="contact@example.com"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Phone</span>
        <input
          type="tel"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+1 (555) 123-4567"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Website</span>
        <input
          type="url"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          placeholder="https://example.com"
        />
      </label>

      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-4">
        <legend className="text-sm font-medium px-2">Address</legend>

        <label className="block md:col-span-2">
          <span className="text-sm">Address Line 1</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.line1}
            onChange={(e) => setForm({ ...form, address: { ...form.address, line1: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">City</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.city}
            onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">State/Province</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.state}
            onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">Postal Code</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.postalCode}
            onChange={(e) => setForm({ ...form, address: { ...form.address, postalCode: e.target.value } })}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm">Country</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.country}
            onChange={(e) => setForm({ ...form, address: { ...form.address, country: e.target.value } })}
          />
        </label>
      </fieldset>

      <div className="flex gap-3 pt-4">
        <button
          onClick={onContinueAsEntity}
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-xl disabled:opacity-60 font-medium"
        >
          {saving ? 'Saving…' : 'Save Entity Profile'}
        </button>
      </div>
    </div>
  );
}

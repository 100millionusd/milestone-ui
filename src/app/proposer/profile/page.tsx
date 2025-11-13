// src/app/proposer/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProposerProfile, saveProposerProfile } from '@/lib/api';

type Address = { line1?: string; city?: string; state?: string; postalCode?: string; country?: string };

export default function ProposerProfilePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<{
    vendorName: string;
    email: string;
    phone: string;
    website: string;
    address: Address;
  }>({
    vendorName: '',
    email: '',
    phone: '',
    website: '',
    address: { line1: '', city: '', state: '', postalCode: '', country: '' },
  });

  // Load current ENTITY profile
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await getProposerProfile(); // GET /proposer/profile
        if (!alive) return;
        setForm({
          vendorName: String(p?.vendorName ?? p?.vendor_name ?? ''),
          email: String(p?.email ?? ''),
          phone: String(p?.phone ?? ''),
          website: String(p?.website ?? ''),
          address: {
            line1: String(p?.address?.line1 ?? ''),
            city: String(p?.address?.city ?? ''),
            state: String(p?.address?.state ?? ''),
            postalCode: String(p?.address?.postalCode ?? p?.address?.postal_code ?? ''),
            country: String(p?.address?.country ?? ''),
          },
        });
      } catch {
        if (!alive) return;
        // keep empty
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await saveProposerProfile(form); // POST /proposer/profile
      await chooseRole('proposer');    // ⬅ ensures JWT/cookie carries proposer role
      router.replace('/new?flash=proposer-profile-saved');
    } catch (e: any) {
      setErr(e?.message || 'Failed to save entity profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Entity Profile</h1>
      {err && <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">{err}</div>}

      <label className="block">
        <span className="text-sm">Organization / Entity Name *</span>
        <input className="w-full border rounded px-3 py-2"
          value={form.vendorName}
          onChange={e => setForm({...form, vendorName: e.target.value})}/>
      </label>

      <label className="block">
        <span className="text-sm">Email</span>
        <input className="w-full border rounded px-3 py-2"
          value={form.email}
          onChange={e => setForm({...form, email: e.target.value})}/>
      </label>

      <label className="block">
        <span className="text-sm">Phone</span>
        <input className="w-full border rounded px-3 py-2"
          value={form.phone}
          onChange={e => setForm({...form, phone: e.target.value})}/>
      </label>

      <label className="block">
        <span className="text-sm">Website</span>
        <input className="w-full border rounded px-3 py-2"
          value={form.website}
          onChange={e => setForm({...form, website: e.target.value})}/>
      </label>

      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm">Address Line 1</span>
          <input className="w-full border rounded px-3 py-2"
            value={form.address.line1}
            onChange={e => setForm({...form, address: {...form.address, line1: e.target.value}})}/>
        </label>
        <label className="block">
          <span className="text-sm">City</span>
          <input className="w-full border rounded px-3 py-2"
            value={form.address.city}
            onChange={e => setForm({...form, address: {...form.address, city: e.target.value}})}/>
        </label>
        <label className="block">
          <span className="text-sm">State</span>
          <input className="w-full border rounded px-3 py-2"
            value={form.address.state}
            onChange={e => setForm({...form, address: {...form.address, state: e.target.value}})}/>
        </label>
        <label className="block">
          <span className="text-sm">Postal Code</span>
          <input className="w-full border rounded px-3 py-2"
            value={form.address.postalCode}
            onChange={e => setForm({...form, address: {...form.address, postalCode: e.target.value}})}/>
        </label>
        <label className="block md:col-span-2">
          <span className="text-sm">Country</span>
          <input className="w-full border rounded px-3 py-2"
            value={form.address.country}
            onChange={e => setForm({...form, address: {...form.address, country: e.target.value}})}/>
        </label>
      </fieldset>

      <div className="flex gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save Entity Profile'}
        </button>
        <button onClick={() => history.back()} className="px-4 py-2 border rounded-xl">Cancel</button>
      </div>
    </div>
  );
}

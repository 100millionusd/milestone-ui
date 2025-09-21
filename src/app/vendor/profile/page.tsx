'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { useRouter } from 'next/navigation';

type Profile = {
  walletAddress: string;
  vendorName: string;
  email: string;
  phone: string;
  website: string;
  address: { line1: string; city: string; country: string; postalCode: string; };
};

export default function VendorProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [p, setP] = useState<Profile>({
    walletAddress: '',
    vendorName: '',
    email: '',
    phone: '',
    website: '',
    address: { line1: '', city: '', country: '', postalCode: '' },
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/vendor/profile`, { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!alive) return;
        setP({
          walletAddress: j.walletAddress || '',
          vendorName: j.vendorName || '',
          email: j.email || '',
          phone: j.phone || '',
          website: j.website || '',
          address: {
            line1: j.address?.line1 || '',
            city: j.address?.city || '',
            country: j.address?.country || '',
            postalCode: j.address?.postalCode || '',
          },
        });
      } catch (e:any) {
        setErr(e?.message || 'Failed to load profile');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      const r = await fetch(`${API_BASE}/vendor/profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.json();
      router.push('/'); // or router.back();
    } catch (e:any) {
      setErr(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="max-w-3xl mx-auto p-6">Loading…</main>;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Vendor Profile</h1>
      {err && <div className="text-rose-700">{err}</div>}

      <form onSubmit={onSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-sm text-slate-600">Company / Vendor Name</div>
            <input className="border rounded px-3 py-2 w-full"
              value={p.vendorName}
              onChange={(e)=>setP({...p, vendorName: e.target.value})}
              required
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">Wallet</div>
            <input className="border rounded px-3 py-2 w-full font-mono text-xs" value={p.walletAddress} readOnly />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <div className="text-sm text-slate-600">Email</div>
            <input className="border rounded px-3 py-2 w-full"
              value={p.email}
              onChange={(e)=>setP({...p, email: e.target.value})}
              type="email"
              required
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">Phone</div>
            <input className="border rounded px-3 py-2 w-full"
              value={p.phone}
              onChange={(e)=>setP({...p, phone: e.target.value})}
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">Website</div>
            <input className="border rounded px-3 py-2 w-full"
              value={p.website}
              onChange={(e)=>setP({...p, website: e.target.value})}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block md:col-span-2">
            <div className="text-sm text-slate-600">Address</div>
            <input className="border rounded px-3 py-2 w-full"
              value={p.address.line1}
              onChange={(e)=>setP({...p, address: {...p.address, line1: e.target.value}})}
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">City</div>
            <input className="border rounded px-3 py-2 w-full"
              value={p.address.city}
              onChange={(e)=>setP({...p, address: {...p.address, city: e.target.value}})}
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">Postal code</div>
            <input className="border rounded px-3 py-2 w-full"
              value={p.address.postalCode}
              onChange={(e)=>setP({...p, address: {...p.address, postalCode: e.target.value}})}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-sm text-slate-600">Country</div>
            <input className="border rounded px-3 py-2 w-full"
              value={p.address.country}
              onChange={(e)=>setP({...p, address: {...p.address, country: e.target.value}})}
            />
          </label>
        </div>

        <div className="flex gap-2">
          <button disabled={saving} className="px-4 py-2 rounded bg-slate-900 text-white">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={()=>router.back()} className="px-4 py-2 rounded border">
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}

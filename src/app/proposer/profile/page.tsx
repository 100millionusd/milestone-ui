'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProposerProfile, saveProposerProfile, chooseRole } from '@/lib/api';

// prevent static export / stale builds
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Address = { line1?: string; city?: string; state?: string; postalCode?: string; country?: string };

function parseAddress(addr: any, addressText?: string | null): Address {
  if (addr && typeof addr === 'object') {
    return {
      line1: addr.line1 || '',
      city: addr.city || '',
      state: addr.state || '',
      postalCode: addr.postalCode || '',
      country: addr.country || '',
    };
  }
  const parts = String(addressText || addr || '').split(',').map(s => s.trim());
  return {
    line1: parts[0] || '',
    city: parts[1] || '',
    postalCode: parts[2] || '',
    country: parts[3] || '',
    state: '',
  };
}

export default function ProposerProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  // 🔁 Always refetch on mount (client) so inputs populate after refresh
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        console.log('[PROPOSER_PAGE] mounted (client)');
        const p = await getProposerProfile();
        console.log('[PROPOSER_PAGE] GET /proposer/profile →', p);
        if (!alive) return;
        setForm({
          vendorName: p?.vendorName || '',
          email: p?.email || '',
          phone: p?.phone || '',
          website: p?.website || '',
          address: parseAddress(p?.address, p?.addressText),
        });
      } catch (e) {
        console.warn('[PROPOSER_PAGE] load failed:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onSave() {
    if (saving) return;
    if (!form.vendorName.trim()) {
      setErr('Organization name is required');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await saveProposerProfile({
        vendorName: form.vendorName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        website: form.website.trim(),
        address: form.address,
      });
      await chooseRole('proposer'); // keeps lx_jwt in sync via api.ts
      // optional: confirm write
      const reread = await getProposerProfile();
      console.log('[PROPOSER_PAGE] reread after save:', reread);
      router.replace('/new?flash=proposer-profile-saved');
    } catch (e: any) {
      setErr(e?.message || 'Failed to save entity profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
          <span className="ml-3">Loading profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div data-proposer-form className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Entity Profile</h1>
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
          {err}
        </div>
      )}

      {/* quick debug */}
      <div className="bg-blue-50 border border-blue-200 p-3 rounded">
        <div className="text-sm text-blue-800">
          <b>DEBUG:</b> {JSON.stringify(form).slice(0, 220)}…
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Organization / Entity Name *</span>
        <input
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.vendorName}
          onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Phone</span>
        <input
          type="tel"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Website</span>
        <input
          type="url"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
        />
      </label>

      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-4">
        <legend className="text-sm font-medium px-2">Address</legend>

        <label className="block md:col-span-2">
          <span className="text-sm">Address Line 1</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.line1}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, line1: e.target.value } })
            }
          />
        </label>

        <label className="block">
          <span className="text-sm">City</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.city}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, city: e.target.value } })
            }
          />
        </label>

        <label className="block">
          <span className="text-sm">State/Province</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.state}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, state: e.target.value } })
            }
          />
        </label>

        <label className="block">
          <span className="text-sm">Postal Code</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.postalCode}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, postalCode: e.target.value } })
            }
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm">Country</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.country}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, country: e.target.value } })
            }
          />
        </label>
      </fieldset>

      <div className="flex gap-3 pt-4">
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-xl disabled:opacity-60 font-medium"
        >
          {saving ? 'Saving…' : 'Save Entity Profile'}
        </button>
      </div>
    </div>
  );
}

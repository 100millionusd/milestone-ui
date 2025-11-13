'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Address = {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type Profile = {
  vendorName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: Address | string | null;
  addressText?: string | null;
  telegram_username?: string | null;
  telegram_chat_id?: string | null;
  whatsapp?: string | null;
};

const API = 'https://milestone-api-production.up.railway.app';

function getToken(): string {
  try { return localStorage.getItem('lx_jwt') || ''; } catch { return ''; }
}

async function api(path: string, init: RequestInit = {}) {
  const t = getToken();
  const r = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    cache: 'no-store',
    mode: 'cors',
    redirect: 'follow',
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} ${txt.slice(0,200)}`);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : null;
}

function parseAddress(raw: Profile['address'], addressText?: string | null): Address {
  if (raw && typeof raw === 'object') {
    return {
      line1: raw.line1 || '',
      city: raw.city || '',
      state: (raw as any).state || '',
      postalCode: raw.postalCode || '',
      country: raw.country || '',
    };
  }
  const text = (typeof raw === 'string' && raw.trim()) ? raw : (addressText || '');
  if (!text) return { line1:'', city:'', state:'', postalCode:'', country:'' };
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  const [line1 = '', city = '', third = '', fourth = ''] = parts;
  let postalCode = '', country = '';
  if (parts.length >= 4) {
    const thirdDigits = /\d/.test(third);
    const fourthDigits = /\d/.test(fourth);
    if (thirdDigits && !fourthDigits) { postalCode = third; country = fourth; }
    else if (fourthDigits && !thirdDigits) { postalCode = fourth; country = third; }
    else { postalCode = third; country = fourth; }
  } else if (parts.length === 3) {
    country = third;
  }
  return { line1, city, state:'', postalCode, country };
}

export default function ProposerProfilePage() {
  const router = useRouter();
  const mounted = useRef(false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);

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
    address: { line1:'', city:'', state:'', postalCode:'', country:'' },
  });

  // 🔁 Always refetch on mount in the browser (uses Bearer from localStorage)
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    (async () => {
      try {
        const token = getToken();
        const role = await api('/auth/role');
        const profile: Profile = await api('/proposer/profile');

        setDebug({
          tokenPreview: token ? token.slice(0, 30) + '…' : '(none)',
          role,
          profile,
        });

        setForm({
          vendorName: profile?.vendorName || '',
          email: profile?.email || '',
          phone: profile?.phone || '',
          website: profile?.website || '',
          address: parseAddress(profile?.address, profile?.addressText),
        });
      } catch (e) {
        setErr((e as Error).message || 'Load failed');
      }
    })();
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
      // 1) Save profile (absolute call; no api.ts involved)
      await api('/proposer/profile', {
        method: 'POST',
        body: JSON.stringify({
          vendorName: form.vendorName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          website: form.website.trim(),
          address: form.address,
        }),
      });

      // 2) Choose role = proposer (issue token if needed)
      const cr = await api('/profile/choose-role?role=proposer', {
        method: 'POST',
        body: JSON.stringify({ role: 'proposer' }),
      });
      if (cr?.token) {
        try { localStorage.setItem('lx_jwt', String(cr.token)); } catch {}
      }

      // 3) Read back once so UI is definitely in sync
      const reread: Profile = await api('/proposer/profile');
      setForm({
        vendorName: reread?.vendorName || '',
        email: reread?.email || '',
        phone: reread?.phone || '',
        website: reread?.website || '',
        address: parseAddress(reread?.address, reread?.addressText),
      });

      // 4) continue flow
      router.replace('/new?flash=proposer-profile-saved');
    } catch (e) {
      setErr((e as Error).message || 'Save failed');
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

      {/* Inline debug so you SEE what the page fetched after hard refresh */}
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm text-slate-600">Debug</summary>
        <pre className="text-xs whitespace-pre-wrap break-all mt-2">
{JSON.stringify(debug, null, 2)}
        </pre>
      </details>

      <label className="block">
        <span className="text-sm font-medium">Organization / Entity Name *</span>
        <input
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.vendorName}
          onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
          placeholder="Your organization name"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="contact@example.com"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Phone</span>
        <input
          type="tel"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+1 (555) 123-4567"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Website</span>
        <input
          type="url"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
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
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.line1}
            onChange={(e) => setForm({ ...form, address: { ...form.address, line1: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">City</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.city}
            onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">State/Province</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.state}
            onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">Postal Code</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.postalCode}
            onChange={(e) => setForm({ ...form, address: { ...form.address, postalCode: e.target.value } })}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm">Country</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.country}
            onChange={(e) => setForm({ ...form, address: { ...form.address, country: e.target.value } })}
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

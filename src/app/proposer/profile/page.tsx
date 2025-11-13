'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** HARD URL for clarity (no %3CAPI%3E), with Bearer fallback. */
const API = 'https://milestone-api-production.up.railway.app';

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

function getToken(): string {
  try { return localStorage.getItem('lx_jwt') || ''; } catch { return ''; }
}

async function api(path: string, init: RequestInit = {}) {
  const t = getToken();
  const r = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.headers || {}),
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    cache: 'no-store',
    mode: 'cors',
    redirect: 'follow',
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} ${txt.slice(0, 200)}`);
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
  const [err, setErr] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);

  // The data we’ll use to seed defaultValue’s
  const [seed, setSeed] = useState<{
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

  // Force-remount key for the <form> so defaultValue is re-applied
  const [viewKey, setViewKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Fetch (browser) and remount once. This avoids any hydration/controlled glitches.
  useEffect(() => {
    (async () => {
      try {
        const role = await api('/auth/role');
        const p: Profile = await api('/proposer/profile');

        setDebug({
          tokenPreview: getToken() ? getToken().slice(0, 30) + '…' : '(none)',
          role,
          profile: p,
        });

        const addr = parseAddress(p?.address, p?.addressText);
        setSeed({
          vendorName: p?.vendorName || '',
          email: p?.email || '',
          phone: p?.phone || '',
          website: p?.website || '',
          address: addr,
        });

        // Remount the form so all defaultValue’s are applied with fetched data
        setViewKey(k => k + 1);
      } catch (e) {
        setErr((e as Error).message || 'Load failed');
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(formRef.current!);

    const vendorName = String(fd.get('vendorName') || '').trim();
    if (!vendorName) {
      setErr('Organization name is required');
      return;
    }

    const payload = {
      vendorName,
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      website: String(fd.get('website') || '').trim(),
      address: {
        line1: String(fd.get('line1') || ''),
        city: String(fd.get('city') || ''),
        state: String(fd.get('state') || ''),
        postalCode: String(fd.get('postalCode') || ''),
        country: String(fd.get('country') || ''),
      },
    };

    try {
      // Save profile
      await api('/proposer/profile', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Ensure role = proposer and refresh Bearer fallback
      const cr = await api('/profile/choose-role?role=proposer', {
        method: 'POST',
        body: JSON.stringify({ role: 'proposer' }),
      });
      if (cr?.token) {
        try { localStorage.setItem('lx_jwt', String(cr.token)); } catch {}
      }

      // Read back and remount again (so displayed values are the saved ones)
      const reread: Profile = await api('/proposer/profile');
      const addr = parseAddress(reread?.address, reread?.addressText);
      setSeed({
        vendorName: reread?.vendorName || '',
        email: reread?.email || '',
        phone: reread?.phone || '',
        website: reread?.website || '',
        address: addr,
      });
      setViewKey(k => k + 1);

      router.replace('/new?flash=proposer-profile-saved');
    } catch (e) {
      setErr((e as Error).message || 'Save failed');
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

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm text-slate-600">Debug</summary>
        <pre className="text-xs whitespace-pre-wrap break-all mt-2">
{JSON.stringify(debug, null, 2)}
        </pre>
      </details>

      {/* REMOUNT THIS WHOLE FORM WHEN viewKey CHANGES */}
      <form ref={formRef} key={`proposer-form-${viewKey}`} className="space-y-4" onSubmit={onSubmit} data-proposer-form>
        <label className="block">
          <span className="text-sm font-medium">Organization / Entity Name *</span>
          <input
            name="vendorName"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            defaultValue={seed.vendorName}
            placeholder="Your organization name"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            defaultValue={seed.email}
            placeholder="contact@example.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Phone</span>
          <input
            type="tel"
            name="phone"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            defaultValue={seed.phone}
            placeholder="+1 (555) 123-4567"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Website</span>
          <input
            type="url"
            name="website"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            defaultValue={seed.website}
            placeholder="https://example.com"
          />
        </label>

        <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-4">
          <legend className="text-sm font-medium px-2">Address</legend>

          <label className="block md:col-span-2">
            <span className="text-sm">Address Line 1</span>
            <input
              name="line1"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
              defaultValue={seed.address.line1}
            />
          </label>

          <label className="block">
            <span className="text-sm">City</span>
            <input
              name="city"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
              defaultValue={seed.address.city}
            />
          </label>

          <label className="block">
            <span className="text-sm">State/Province</span>
            <input
              name="state"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
              defaultValue={seed.address.state}
            />
          </label>

          <label className="block">
            <span className="text-sm">Postal Code</span>
            <input
              name="postalCode"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
              defaultValue={seed.address.postalCode}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm">Country</span>
            <input
              name="country"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
              defaultValue={seed.address.country}
            />
          </label>
        </fieldset>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-xl font-medium"
          >
            Save Entity Profile
          </button>
        </div>
      </form>
    </div>
  );
}

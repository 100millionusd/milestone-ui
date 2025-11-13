'use client';

// FORCE dynamic, avoid any accidental static output
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Hard API to bypass any env/%3CAPI%3E confusion
const API = 'https://milestone-api-production.up.railway.app';

type Address = { line1?: string; city?: string; state?: string; postalCode?: string; country?: string; };
type Profile = {
  vendorName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: Address | string | null;
  addressText?: string | null;
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
  if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text().catch(()=>'')}`);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : null;
}

function parseAddress(raw: Profile['address'], addressText?: string | null): Address {
  if (raw && typeof raw === 'object') {
    return {
      line1: raw.line1 || '', city: raw.city || '', state: (raw as any).state || '',
      postalCode: raw.postalCode || '', country: raw.country || '',
    };
  }
  const text = (typeof raw === 'string' && raw.trim()) ? raw : (addressText || '');
  if (!text) return { line1:'', city:'', state:'', postalCode:'', country:'' };
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  const [line1 = '', city = '', p3 = '', p4 = ''] = parts;
  let postalCode = '', country = '';
  if (parts.length >= 4) {
    const d3 = /\d/.test(p3), d4 = /\d/.test(p4);
    if (d3 && !d4) { postalCode = p3; country = p4; }
    else if (d4 && !d3) { postalCode = p4; country = p3; }
    else { postalCode = p3; country = p4; }
  } else if (parts.length === 3) {
    country = p3;
  }
  return { line1, city, state:'', postalCode, country };
}

export default function ProposerProfilePage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  // seed values for defaultValue
  const [seed, setSeed] = useState({
    vendorName: '',
    email: '',
    phone: '',
    website: '',
    address: { line1:'', city:'', state:'', postalCode:'', country:'' },
  });

  // force remount key so defaultValue re-applies after fetch
  const [viewKey, setViewKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // MARK: prove this page actually mounted
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('%c[PROPOSER_PAGE] mounted (client)', 'color:#7c3aed;font-weight:bold');
    (window as any).__proposer_page_mounted = true;
  }, []);

  // Fetch in browser, then remount form so defaultValue shows
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const role = await api('/auth/role');
        const p: Profile = await api('/proposer/profile');
        // eslint-disable-next-line no-console
        console.log('[PROPOSER_PAGE] role:', role);
        // eslint-disable-next-line no-console
        console.log('[PROPOSER_PAGE] profile:', p);

        if (!alive) return;
        const addr = parseAddress(p?.address, p?.addressText);
        setSeed({
          vendorName: p?.vendorName || '',
          email: p?.email || '',
          phone: p?.phone || '',
          website: p?.website || '',
          address: addr,
        });
        setViewKey(k => k + 1); // remount
      } catch (e: any) {
        setErr(e?.message || 'Load failed');
      }
    })();
    return () => { alive = false; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(formRef.current!);

    const vendorName = String(fd.get('vendorName') || '').trim();
    if (!vendorName) { setErr('Organization name is required'); return; }

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
      await api('/proposer/profile', { method: 'POST', body: JSON.stringify(payload) });
      const cr = await api('/profile/choose-role?role=proposer', { method: 'POST', body: JSON.stringify({ role:'proposer' }) });
      if (cr?.token) { try { localStorage.setItem('lx_jwt', String(cr.token)); } catch {} }

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
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
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

      {/* THIS ATTRIBUTE MUST EXIST */}
      <form
        ref={formRef}
        key={`proposer-form-${viewKey}`}
        data-proposer-form
        className="space-y-4"
        onSubmit={onSubmit}
      >
        <label className="block">
          <span className="text-sm font-medium">Organization / Entity Name *</span>
          <input name="vendorName" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                 defaultValue={seed.vendorName} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input type="email" name="email" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                 defaultValue={seed.email} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Phone</span>
          <input type="tel" name="phone" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                 defaultValue={seed.phone} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Website</span>
          <input type="url" name="website" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                 defaultValue={seed.website} />
        </label>

        <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-4">
          <legend className="text-sm font-medium px-2">Address</legend>

          <label className="block md:col-span-2">
            <span className="text-sm">Address Line 1</span>
            <input name="line1" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                   defaultValue={seed.address.line1} />
          </label>

          <label className="block">
            <span className="text-sm">City</span>
            <input name="city" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                   defaultValue={seed.address.city} />
          </label>

          <label className="block">
            <span className="text-sm">State/Province</span>
            <input name="state" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                   defaultValue={seed.address.state} />
          </label>

          <label className="block">
            <span className="text-sm">Postal Code</span>
            <input name="postalCode" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                   defaultValue={seed.address.postalCode} />
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm">Country</span>
            <input name="country" className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                   defaultValue={seed.address.country} />
          </label>
        </fieldset>

        <div className="flex gap-3 pt-4">
          <button type="submit"
                  className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-xl font-medium">
            Save Entity Profile
          </button>
        </div>
      </form>
    </div>
  );
}

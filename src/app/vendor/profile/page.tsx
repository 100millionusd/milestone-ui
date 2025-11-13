'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getVendorProfile, getProposerProfile, postJSON } from '@/lib/api';
import ProfileRoleButtons from '@/components/ProfileRoleButtons';

type Address = {
  line1: string;
  city: string;
  postalCode: string;
  country: string;
};

type ProfileForm = {
  walletAddress: string;
  vendorName: string;
  email: string;
  phone: string;
  website: string;
  address: Address;
  telegramConnected?: boolean;
};

function normalizeWebsite(v: string) {
  const s = (v || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

// normalize “address” from server (object|string|addressText) → Address object
function parseAddress(j: any): Address {
  const a = j?.address ?? j?.addressText ?? '';
  if (a && typeof a === 'object') {
    return {
      line1: a.line1 || '',
      city: a.city || '',
      postalCode: a.postalCode || '',
      country: a.country || '',
    };
  }
  const s = String(a || '').trim();
  if (!s) return { line1: '', city: '', postalCode: '', country: '' };
  const parts = s.split(',').map((x) => x.trim());
  return {
    line1: parts[0] || '',
    city: parts[1] || '',
    postalCode: parts[2] || '',
    country: parts[3] || '',
  };
}

export default function VendorProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [p, setP] = useState<ProfileForm>({
    walletAddress: '',
    vendorName: '',
    email: '',
    phone: '',
    website: '',
    address: { line1: '', city: '', postalCode: '', country: '' },
    telegramConnected: false,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);

        // Try vendor first, then proposer as fallback
        const v = await getVendorProfile().catch(() => ({}));
        const hasVendor = v && Object.keys(v).length > 0;

        const src = hasVendor ? v : await getProposerProfile().catch(() => ({}));
        const hasSrc = src && Object.keys(src).length > 0;

        if (!alive) return;

        if (hasSrc) {
          setP({
            walletAddress: src.walletAddress || '',
            vendorName: src.vendorName || '',
            email: src.email || '',
            phone: src.phone || '',
            website: src.website || '',
            address: parseAddress(src),
            telegramConnected: !!(src?.telegram_chat_id || src?.telegramChatId),
          });
        } else {
          // keep defaults
        }
      } catch (e: any) {
        if (alive) setErr(e?.message || 'Failed to load profile');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onSaveOnly(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);

    try {
      const payload = {
        vendorName: (p.vendorName || '').trim(),
        email: (p.email || '').trim(),
        phone: (p.phone || '').trim(),
        website: normalizeWebsite(p.website || ''),
        address: {
          line1: (p.address.line1 || '').trim(),
          city: (p.address.city || '').trim(),
          postalCode: (p.address.postalCode || '').trim(),
          country: (p.address.country || '').trim(),
        },
      };

      if (payload.vendorName.length < 2) {
        setErr('Please enter your Vendor / Company Name (min 2 characters).');
        setSaving(false);
        return;
      }

      await postJSON('/vendor/profile', payload); // just save vendor version
    } catch (e: any) {
      setErr(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="max-w-3xl mx-auto p-6">Loading…</main>;

  const profileForRole = {
    vendorName: p.vendorName,
    email: p.email,
    phone: p.phone,
    website: normalizeWebsite(p.website || ''),
    address: p.address,
  };

  return (
    <main data-profile-form className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Profile</h1>
      {err && <div className="text-rose-700">{err}</div>}

      <form onSubmit={onSaveOnly} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-sm text-slate-600">Company / Vendor Name</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={p.vendorName}
              onChange={(e) => setP({ ...p, vendorName: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">Wallet</div>
            <input
              className="border rounded px-3 py-2 w-full font-mono text-xs"
              value={p.walletAddress}
              readOnly
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <div className="text-sm text-slate-600">Email</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={p.email}
              onChange={(e) => setP({ ...p, email: e.target.value })}
              type="email"
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">Phone</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={p.phone}
              onChange={(e) => setP({ ...p, phone: e.target.value })}
              placeholder="+34600111222"
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">Website</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={p.website}
              onChange={(e) => setP({ ...p, website: e.target.value })}
              placeholder="https://yourdomain.com"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block md:col-span-2">
            <div className="text-sm text-slate-600">Address</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={p.address.line1}
              onChange={(e) =>
                setP({ ...p, address: { ...p.address, line1: e.target.value } })
              }
              placeholder="Street address"
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">City</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={p.address.city}
              onChange={(e) =>
                setP({ ...p, address: { ...p.address, city: e.target.value } })
              }
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">Postal code</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={p.address.postalCode}
              onChange={(e) =>
                setP({
                  ...p,
                  address: { ...p.address, postalCode: e.target.value },
                })
              }
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-sm text-slate-600">Country</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={p.address.country}
              onChange={(e) =>
                setP({ ...p, address: { ...p.address, country: e.target.value } })
              }
            />
          </label>
        </div>

        {/* You can keep a plain Save button here if you want */}
        {/* <button className="px-4 py-2 rounded bg-slate-200" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button> */}
      </form>

      <div className="pt-4 border-t">
        <h2 className="text-lg font-semibold mb-2">Choose how you want to continue</h2>
        <p className="text-sm text-slate-600 mb-3">
          Save your profile and continue either as a Vendor (submit bids) or as an Entity (submit proposals).
        </p>
        <ProfileRoleButtons
          profile={profileForRole}
          nextAfterVendor="/vendor/dashboard?flash=vendor-profile-saved"
          nextAfterProposer="/new?flash=proposer-profile-saved"
        />
      </div>
    </main>
  );
}

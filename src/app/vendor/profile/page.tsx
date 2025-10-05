'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getVendorProfile, postJSON } from '@/lib/api'; // ✅ Safari-safe helpers

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

// Deep-link button to connect Telegram via /start link_<WALLET>
function ConnectTelegramButton({ wallet }: { wallet: string }) {
  const bot = process.env.NEXT_PUBLIC_TG_BOT_NAME || 'YourBotName'; // without '@'
  if (!wallet) return null;
  const deepLink = `https://t.me/${bot}?start=link_${encodeURIComponent(wallet)}`;
  return (
    <a
      href={deepLink}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center px-3 py-2 rounded-xl border hover:bg-slate-50"
    >
      Connect Telegram
    </a>
  );
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
        // ✅ Safari-safe: goes through api.ts (adds Bearer if cookie is blocked)
        const j = await getVendorProfile();

        // Server may return address as string or object — normalize to object.
        const a = j?.address ?? {};
        const address: Address =
          typeof a === 'string'
            ? { line1: a, city: '', postalCode: '', country: '' }
            : {
                line1: a?.line1 || '',
                city: a?.city || '',
                postalCode: a?.postalCode || '',
                country: a?.country || '',
              };

        if (!alive) return;
        setP({
          walletAddress: j?.walletAddress || '',
          vendorName: j?.vendorName || '',
          email: j?.email || '',
          phone: j?.phone || '',
          website: j?.website || '',
          address,
          // Consider any truthy chat id as connected; support snake/camel
          telegramConnected: !!(j?.telegram_chat_id || j?.telegramChatId),
        });
      } catch (e: any) {
        setErr(e?.message || 'Failed to load profile');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function normalizeWebsite(v: string) {
    const s = (v || '').trim();
    if (!s) return '';
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);

    try {
      const payload = {
        vendorName: (p.vendorName || '').trim(), // required (>= 2 chars)
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

      // ✅ Safari-safe: uses api.ts helper so Bearer is sent if cookie is blocked
      await postJSON('/vendor/profile', payload);

      router.push('/'); // or router.back();
    } catch (e: any) {
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

        {/* Telegram connect row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="block">
            <div className="text-sm text-slate-600 mb-1">Telegram</div>
            {p.telegramConnected ? (
              <div className="inline-flex items-center gap-2">
                <span className="text-green-600">Connected</span>
                {/* Allow re-link just in case */}
                <ConnectTelegramButton wallet={p.walletAddress} />
              </div>
            ) : (
              <ConnectTelegramButton wallet={p.walletAddress} />
            )}
            <p className="text-xs text-slate-500 mt-1">
              Opens Telegram to link this wallet to your account.
            </p>
          </div>
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
                setP({ ...p, address: { ...p.address, postalCode: e.target.value } })
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

        <div className="flex gap-2">
          <button disabled={saving} className="px-4 py-2 rounded bg-slate-900 text-white">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 rounded border"
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}

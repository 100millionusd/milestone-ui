// src/app/vendor/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getVendorProfile, postJSON, apiFetch } from '@/lib/api'; // Safari-safe helpers
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

function ConnectTelegramButton({ wallet }: { wallet: string }) {
  // If we somehow still don't have a wallet, show a disabled hint (don't hide the control entirely)
  if (!wallet) {
    return (
      <span className="inline-flex items-center px-3 py-2 rounded-xl border text-slate-400">
        Connect Telegram (no wallet yet)
      </span>
    );
  }
  const bot = (process.env.NEXT_PUBLIC_TG_BOT_NAME || 'YourBotName').replace(/^@/, '');
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
        // 1. Check the user's role FIRST
        const auth = await apiFetch('/auth/role').catch(() => ({} as any));

        // 2. SOLUTION: If the active role is 'proposer', redirect them
        if (auth?.role === 'proposer') {
          // Redirect to the proposer's equivalent profile page or dashboard
          router.push('/proposer/profile'); // or '/new'
          // We don't need to load the vendor profile, so we can stop.
          return;
        }
        
        // 3. If we are here, role is 'vendor' or 'admin', so load vendor data
        const j = await getVendorProfile();

        // Normalize address (server can return string or object)
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

        const wallet = j?.walletAddress || auth?.address || '';

        if (!alive) return;
        setP({
          walletAddress: wallet,
          vendorName: j?.vendorName || '',
          email: j?.email || '',
          phone: j?.phone || '',
          website: j?.website || '',
          address,
          telegramConnected: !!(j?.telegram_chat_id || j?.telegramChatId),
        });

        console.log('[vendor/profile] wallet used for Telegram:', wallet);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load profile');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]); // <— Add router to the dependency array

  function normalizeWebsite(v: string) {
    const s = (v || '').trim();
    if (!s) return '';
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }

  async function onSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (saving) return;
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

      // Safari-safe save (Bearer added by api.ts if cookies are blocked)
      await postJSON('/vendor/profile', payload);

      try {
        const fresh = await getVendorProfile();
        setP((prev) => ({
          ...prev,
          vendorName: fresh.vendorName || prev.vendorName,
          email: fresh.email || prev.email,
          phone: fresh.phone || prev.phone,
          website: fresh.website || prev.website,
          address:
            typeof fresh.address === 'object'
              ? fresh.address
              : { ...prev.address, line1: fresh.address || prev.address.line1 },
        }));
      } catch {}

      // Optional: stay on page and just show success via role buttons section
      // router.push('/vendor/dashboard?flash=vendor-profile-saved');
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
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Profile</h1>
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
          {err}
        </div>
      )}

      <form onSubmit={onSave} className="space-y-4" data-vendor-profile-form>
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

        {/* Optional explicit Save button (role buttons also save) */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {/* Role selection buttons under the form (both paths save profile) */}
      <div className="pt-4 border-t">
        <h2 className="text-lg font-semibold mb-2">Choose how you want to continue</h2>
        <p className="text-sm text-slate-600 mb-3">
          Save your profile and continue either as a Vendor (submit bids) or as an Entity (submit proposals).
        </p>
        <ProfileRoleButtons
          profile={profileForRole}
          nextAfterVendor="/vendor/dashboard?flash=vendor-profile-saved"
          nextAfterProposer="/new"
        />
      </div>
    </main>
  );
}
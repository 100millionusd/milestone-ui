// src/app/proposer/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProposerProfile, saveProposerProfile, apiFetch } from '@/lib/api';
import ProfileRoleButtons from '@/components/ProfileRoleButtons';

type Address = {
  line1: string;
  city: string;
  postalCode: string;
  country: string;
};

// [UPDATED] Add location type
type LocationData = {
  lat: number;
  lng: number;
  display_name?: string;
};

type ProfileForm = {
  walletAddress: string;
  vendorName: string;
  email: string;
  phone: string;
  website: string;
  address: Address;
  location?: LocationData | null; // [UPDATED] Added location field
  telegramConnected?: boolean;
};

function ConnectTelegramButton({ wallet }: { wallet: string }) {
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

export default function ProposerProfilePage() {
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
    location: null, // [UPDATED] Init location
    telegramConnected: false,
  });

  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      try {
        const auth = await apiFetch('/auth/role').catch(() => ({} as any));

        if (!alive) return;
        if (auth?.role === 'vendor') {
          router.push('/vendor/profile'); 
          return;
        }

        const j = await getProposerProfile(); 
        if (!alive) return;

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

        setP((prev) => ({
          ...prev,
          walletAddress: wallet,
          vendorName: j?.vendorName || '',
          email: j?.email || '',
          phone: j?.phone || '',
          website: j?.website || '',
          address,
          location: j?.location || null, // [UPDATED] Load existing location
          telegramConnected: !!(
            j?.telegram_chat_id || 
            j?.telegramChatId || 
            j?.telegramUsername || 
            j?.telegram_username
          ),
        }));
      } catch (e: any) {
        if (alive) setErr(e?.message || 'Failed to load profile');
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadProfile();
    window.addEventListener('focus', loadProfile);
    return () => {
      alive = false;
      window.removeEventListener('focus', loadProfile);
    };
  }, [router]);

  function normalizeWebsite(v: string) {
    const s = (v || '').trim();
    if (!s) return '';
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }

  // [ADDED] Helper to fetch coordinates from OpenStreetMap (Nominatim)
  async function geocodeAddress(addr: Address): Promise<LocationData | null> {
    const query = [addr.line1, addr.city, addr.postalCode, addr.country]
      .filter((part) => part && part.trim().length > 0)
      .join(', ');

    if (!query || query.length < 5) return null;

    try {
      // Using generic User-Agent to comply with Nominatim policy
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'User-Agent': 'ProposerProfileApp/1.0' } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          display_name: data[0].display_name,
        };
      }
    } catch (error) {
      console.warn('Geocoding failed', error);
    }
    return null;
  }

  async function onSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErr(null);

    try {
      // 1. Prepare basic payload
      const addressData = {
        line1: (p.address.line1 || '').trim(),
        city: (p.address.city || '').trim(),
        postalCode: (p.address.postalCode || '').trim(),
        country: (p.address.country || '').trim(),
      };

      // [UPDATED] 2. Automatically Geocode before saving
      let locationData = p.location;
      
      // Only geocode if we have address data
      if (addressData.line1 || addressData.city) {
         const found = await geocodeAddress(addressData);
         if (found) {
           locationData = found;
           // Update local state to reflect the new coordinates immediately
           setP((prev) => ({ ...prev, location: found }));
         }
      }

      const payload = {
        vendorName: (p.vendorName || '').trim(),
        email: (p.email || '').trim(),
        phone: (p.phone || '').trim(),
        website: normalizeWebsite(p.website || ''),
        address: addressData,
        location: locationData, // [UPDATED] Send the auto-detected location
      };

      if (payload.vendorName.length < 2) {
        setErr('Please enter your Organization Name (min 2 characters).');
        setSaving(false);
        return;
      }
      
      await saveProposerProfile(payload);

      // Reload fresh data to confirm save
      try {
        const fresh = await getProposerProfile();
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
          location: fresh.location || prev.location, // [UPDATED]
          telegramConnected: !!(
            fresh?.telegram_chat_id || 
            fresh?.telegramChatId || 
            fresh?.telegramUsername ||
            fresh?.telegram_username
          ),
        }));
      } catch {}

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
      <h1 className="text-2xl font-semibold">Entity Profile</h1>
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
          {err}
        </div>
      )}

      <form onSubmit={onSave} className="space-y-4" data-proposer-profile-form>
        {/* ... (Existing Organization Name / Wallet inputs) ... */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-sm text-slate-600">Organization Name</div>
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

        {/* ... (Existing Contact inputs) ... */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <div className="text-sm text-slate-600">Contact Email</div>
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
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-600">Website</div>
            <input
              className="border rounded px-3 py-2 w-full"
              value={p.website}
              onChange={(e) => setP({ ...p, website: e.target.value })}
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
                <ConnectTelegramButton wallet={p.walletAddress} />
              </div>
            ) : (
              <ConnectTelegramButton wallet={p.walletAddress} />
            )}
          </div>
        </div>

        {/* Address Fields */}
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
          
          {/* [UPDATED] Auto-detected Location Feedback */}
          <div className="block">
             <div className="text-sm text-slate-600">GPS Location</div>
             <div className="text-xs text-slate-500 py-2.5">
               {p.location ? (
                 <span className="text-emerald-600 font-medium">
                   ✓ Auto-detected: {p.location.lat.toFixed(4)}, {p.location.lng.toFixed(4)}
                 </span>
               ) : (
                 <span className="text-slate-400">
                   (Will be calculated automatically on save)
                 </span>
               )}
             </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl disabled:opacity-60"
          >
            {saving ? 'Saving & Locating…' : 'Save changes'}
          </button>
        </div>
      </form>

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
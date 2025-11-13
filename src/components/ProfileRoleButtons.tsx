// src/components/ProfileRoleButtons.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveVendorProfile, saveProposerProfile, chooseRole } from '@/lib/api';

type Address = {
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export type Profile = {
  vendorName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: Address | string | null;
};

type Props = {
  profile: Profile;
  nextAfterVendor?: string;
  nextAfterProposer?: string;
};

function normalizeWebsite(v?: string | null) {
  const s = (v || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function toAddress(a: Profile['address']): Address {
  if (!a) return { line1: '', city: '', state: '', postalCode: '', country: '' };
  if (typeof a === 'string') {
    const parts = a.split(',').map((x) => x.trim());
    return {
      line1: parts[0] || '',
      city: parts[1] || '',
      postalCode: parts[2] || '',
      country: parts[3] || '',
      state: '',
    };
  }
  return {
    line1: a.line1 || '',
    city: a.city || '',
    state: a.state || '',
    postalCode: a.postalCode || '',
    country: a.country || '',
  };
}

function normalizeProfile(p: Profile) {
  return {
    vendorName: (p.vendorName || '').trim(),
    email: (p.email || '').trim(),
    phone: (p.phone || '').trim(),
    website: normalizeWebsite(p.website || ''),
    address: toAddress(p.address),
  };
}

export default function ProfileRoleButtons({
  profile,
  nextAfterVendor = '/vendor/dashboard?flash=vendor-profile-saved',
  nextAfterProposer = '/new?flash=proposer-profile-saved',
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<'idle' | 'vendor' | 'proposer'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function go(kind: 'vendor' | 'proposer') {
    if (saving !== 'idle') return;
    setErr(null);
    setSaving(kind);
    try {
      const payload = normalizeProfile(profile);

      if (kind === 'vendor') {
        await saveVendorProfile(payload);
      } else {
        await saveProposerProfile(payload);
      }

      // choose role and persist JWT so future reads include Bearer
      const res = await chooseRole(kind);
      if (res?.token) {
        try {
          localStorage.setItem('lx_jwt', res.token);
          // helps Safari/3rd-party cookie cases when SSR hits /auth/role
          document.cookie = `lx_jwt=${res.token}; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=None; Secure`;
        } catch {}
      }

      setOk(true);
      router.replace(kind === 'vendor' ? nextAfterVendor : nextAfterProposer);
    } catch (e: any) {
      setErr(e?.message || `Failed to continue as ${kind}`);
      setSaving('idle');
    }
  }

  return (
    <div data-role-buttons className="space-y-3">
      {ok && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2">
          Profile saved successfully.
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
          {err}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => go('vendor')}
          disabled={saving !== 'idle'}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl shadow-sm disabled:opacity-60"
        >
          {saving === 'vendor' ? 'Saving…' : 'Continue as Vendor (Submit a Bid)'}
        </button>

        <button
          type="button"
          onClick={() => go('proposer')}
          disabled={saving !== 'idle'}
          className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl shadow-sm disabled:opacity-60"
        >
          {saving === 'proposer' ? 'Saving…' : 'Continue as Entity (Submit Proposal)'}
        </button>
      </div>
    </div>
  );
}

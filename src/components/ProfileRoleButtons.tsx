// src/components/ProfileRoleButtons.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJSON } from '@/lib/api';

type Address = {
  line1?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

type ProfileMin = {
  vendorName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: Address | string; // server ignores wallet field; takes it from JWT
};

export default function ProfileRoleButtons({
  profile,
  nextAfterVendor = '/vendor/dashboard',
  nextAfterProposer = '/new',
}: {
  profile: ProfileMin;
  nextAfterVendor?: string;
  nextAfterProposer?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'vendor' | 'proposer' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function continueAsVendor() {
    setErr(null);
    setBusy('vendor');
    try {
      // 1) Save profile (server uses wallet from JWT)
      await postJSON('/vendor/profile', profile);
      // 2) Switch session role to vendor
      await postJSON('/auth/switch-role', { role: 'vendor' });
      // 3) Land on vendor dashboard
      router.replace(nextAfterVendor);
    } catch (e: any) {
      setErr(e?.message || 'Failed to continue as vendor');
    } finally {
      setBusy(null);
    }
  }

  async function continueAsProposer() {
    setErr(null);
    setBusy('proposer');
    try {
      // If you also save an "entity profile", do it here. Otherwise just switch.
      await postJSON('/auth/switch-role', { role: 'proposer' });
      router.replace(nextAfterProposer);
    } catch (e: any) {
      setErr(e?.message || 'Failed to continue as proposer');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {err && <div className="text-rose-700">{err}</div>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={continueAsVendor}
          disabled={busy !== null}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-60"
        >
          {busy === 'vendor' ? 'Saving…' : 'Continue as Vendor (Submit a Bid)'}
        </button>

        <button
          type="button"
          onClick={continueAsProposer}
          disabled={busy !== null}
          className="px-4 py-2 rounded-xl border"
        >
          {busy === 'proposer' ? 'Switching…' : 'Continue as Entity (Submit Proposal)'}
        </button>
      </div>
    </div>
  );
}

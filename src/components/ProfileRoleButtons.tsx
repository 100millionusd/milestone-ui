// src/components/ProfileRoleButtons.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveVendorProfile, saveProposerProfile, chooseRole } from '@/lib/api';

// Define proper types
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

type ProfileRoleButtonsProps = {
  profile: Profile;
  nextAfterVendor?: string;
  nextAfterProposer?: string;
};

export default function ProfileRoleButtons({
  profile,
  nextAfterVendor = '/vendor/dashboard',
  nextAfterProposer = '/new',
}: ProfileRoleButtonsProps) {
  const router = useRouter();
  const [saving, setSaving] = useState<'idle' | 'vendor' | 'proposer'>('idle');
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleVendor = async () => {
    if (saving !== 'idle') return;
    setErr(null);
    setSaving('vendor');
    try {
      await saveVendorProfile(profile);
      await chooseRole('vendor');
      setOk(true);
      setTimeout(() => router.push(nextAfterVendor), 800);
    } catch (e: any) {
      setErr(e?.message || 'Failed to continue as vendor');
      setSaving('idle');
    }
  };

  const handleProposer = async () => {
    if (saving !== 'idle') return;
    setErr(null);
    setSaving('proposer');
    try {
      await saveProposerProfile(profile);
      await chooseRole('proposer');
      setOk(true);
      setTimeout(() => router.push(nextAfterProposer), 800);
    } catch (e: any) {
      setErr(e?.message || 'Failed to continue as proposer');
      setSaving('idle');
    }
  };

  return (
    <div className="space-y-3">
      {ok && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2">
          Profile saved successfully.
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">{err}</div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleVendor}
          disabled={saving !== 'idle'}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl shadow-sm disabled:opacity-60"
        >
          {saving === 'vendor' ? 'Saving...' : 'Continue as Vendor (Submit a Bid)'}
        </button>

        <button
          type="button"
          onClick={handleProposer}
          disabled={saving !== 'idle'}
          className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl shadow-sm disabled:opacity-60"
        >
          {saving === 'proposer' ? 'Saving...' : 'Continue as Entity (Submit Proposal)'}
        </button>
      </div>
    </div>
  );
}
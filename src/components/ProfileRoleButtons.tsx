// src/components/ProfileRoleButtons.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveVendorProfile, saveProposerProfile, switchRole } from '@/lib/api';

type Address = {
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

type Profile = {
  vendorName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: Address | string | null;
};

export default function ProfileRoleButtons({
  profile,
  nextAfterVendor = '/vendor/dashboard',
  nextAfterProposer = '/new',
}: {
  profile: Profile;
  nextAfterVendor?: string;
  nextAfterProposer?: string;
}) {
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
      await switchRole('vendor');
      setOk(true);
      setTimeout(() => router.push(nextAfterVendor), 800);
    } catch (e: any) {
      setErr(e?.message || 'Failed to continue as vendor');
    } finally {
      setSaving('idle');
    }
  };

  const handleProposer = async () => {
    if (saving !== 'idle') return;
    setErr(null);
    setSaving('proposer');
    try {
      await saveProposerProfile(profile);
      await switchRole('proposer');
      router.push(`${nextAfterProposer}?flash=proposer-profile-saved`);
    } catch (e: any) {
      setErr(e?.message || 'Failed to continue as proposer');
    } finally {
      setSaving('idle');
    }
  };

  return (
    <div className="space-y-3">
      {ok && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2">
          Profile saved. An admin will review and approve your vendor account.
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">{err}</div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"                    // ← added
          onClick={handleVendor}
          disabled={saving !== 'idle'}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl shadow-sm disabled:opacity-60"
        >
          Continue as Vendor (Submit a Bid)
        </button>

        <button
          type="button"                    // ← added
          onClick={handleProposer}
          disabled={saving !== 'idle'}
          className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl shadow-sm disabled:opacity-60"
        >
          Continue as Entity (Submit Proposal)
        </button>
      </div>
    </div>
  );
}

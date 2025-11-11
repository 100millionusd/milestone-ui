'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfile, chooseRole } from '@/lib/api';

type Busy = 'vendor' | 'proposer' | null;

export default function ProfileRoleButtons({
  profile,
  nextAfterVendor = '/vendor',
  nextAfterProposer = '/new',
}: {
  profile: any;
  nextAfterVendor?: string;
  nextAfterProposer?: string;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const router = useRouter();

  async function onSaveVendor() {
    try {
      setBusy('vendor');
      await saveProfile(profile);        // save generic profile fields first
      await chooseRole('vendor');        // seed vendor (pending) + set JWT roles
      alert('Saved as Vendor. Waiting for admin approval.');
      router.push(nextAfterVendor);
    } catch (e: any) {
      alert(`Vendor save failed: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  }

  async function onSaveProposer() {
    try {
      setBusy('proposer');
      await saveProfile(profile);        // save generic profile fields first
      await chooseRole('proposer');      // mark as entity/proposer + set JWT roles
      alert('Saved as Entity. You can now submit a proposal.');
      router.push(nextAfterProposer);
    } catch (e: any) {
      alert(`Entity save failed: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 flex flex-col sm:flex-row gap-3">
      <button
        type="button"
        onClick={onSaveVendor}
        disabled={busy !== null}
        className="inline-flex items-center justify-center rounded-xl bg-cyan-600 px-5 py-3 text-white font-semibold hover:bg-cyan-700 disabled:opacity-60"
      >
        {busy === 'vendor' ? 'Saving…' : 'Save as Vendor (Submit a Bid)'}
      </button>

      <button
        type="button"
        onClick={onSaveProposer}
        disabled={busy !== null}
        className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
      >
        {busy === 'proposer' ? 'Saving…' : 'Save as Entity (Submit a Proposal)'}
      </button>
    </div>
  );
}

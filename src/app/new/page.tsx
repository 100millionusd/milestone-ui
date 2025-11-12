// src/app/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createProposal, uploadFileToIPFS, getAuthRoleOnce, getProposerProfile } from "@/lib/api";
import Link from 'next/link';


// ✅ Guard: only allow submit when the clicked button opts in
const allowOnlyExplicitSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
  // @ts-ignore nativeEvent is fine in Next/React DOM
  const submitter = e.nativeEvent?.submitter as HTMLElement | undefined;
  if (!submitter || submitter.getAttribute('data-allow-submit') !== 'true') {
    e.preventDefault();
  }
};

// Is the user's profile “complete” enough to allow proposal submit?
// Require a name AND at least one contact (email OR phone/WhatsApp OR Telegram)
const isProfileReady = (p: any) => {
  if (!p) return false;

  const hasName =
    (typeof p.vendor_name === 'string' && p.vendor_name.trim() !== '') ||
    (typeof p.vendorName === 'string' && p.vendorName.trim() !== '');

  const hasEmail =
    typeof p.email === 'string' && p.email.trim() !== '';

  const hasPhone =
    (typeof p.phone === 'string' && p.phone.trim() !== '') ||
    (typeof p.whatsapp === 'string' && p.whatsapp.trim() !== '');

  const hasTelegram =
    (typeof p.telegram_username === 'string' && p.telegram_username.trim() !== '') ||
    (typeof p.telegramUsername === 'string' && p.telegramUsername.trim() !== '') ||
    (typeof p.telegram_chat_id === 'string' && p.telegram_chat_id.trim() !== '') ||
    (typeof p.telegramChatId === 'string' && p.telegramChatId.trim() !== '');

  return hasName && (hasEmail || hasPhone || hasTelegram);
};

export default function NewProposalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const bot = process.env.NEXT_PUBLIC_TG_BOT_NAME || 'YourBotName'; // without '@'
  const [profile, setProfile] = useState<any>(null);
  const profileReady = isProfileReady(profile);
  const [flash, setFlash] = useState<string | null>(null);

useEffect(() => {
  const u = new URL(window.location.href);
  const f = u.searchParams.get('flash');
  if (f) {
    setFlash(f);
    u.searchParams.delete('flash');
    window.history.replaceState({}, '', u.toString());
  }
}, []);


  const [formData, setFormData] = useState({
    orgName: '',
    title: '',
    summary: '',
    contact: '',
    address: '',
    city: '',
    country: '',
    amountUSD: '',
    ownerPhone: '', // NEW
  });
  const [files, setFiles] = useState<File[]>([]);

  // Load connected wallet (for Telegram deep-link)
  useEffect(() => {
  (async () => {
    try {
      const j = await getAuthRoleOnce();
      if (j?.address) setWallet(j.address);
    } catch { /* ignore */ }
  })();
}, []);

// Load proposer profile (fallback to vendor if empty)
useEffect(() => {
  let alive = true;
  (async () => {
    try {
      const p = await getProposerProfile();
      if (!alive) return;
      setProfile(p || null);
      console.log('[new] proposer profile →', p);
    } catch (e) {
      if (!alive) return;
      console.warn('[new] proposer profile error', e);
      setProfile(null);
    }
  })();
  return () => { alive = false; };
}, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Block submit until profile is complete
if (!profileReady) {
  alert('Please complete your profile first (email, phone/WhatsApp, or Telegram).');
  setLoading(false);
  return;
}

    try {
      // Upload files to IPFS if any
      const docs: Array<{ cid: string; url: string; name: string; size: number }> = [];
      for (const file of files) {
        const uploadResult = await uploadFileToIPFS(file);
        docs.push({
          cid: uploadResult.cid,
          url: uploadResult.url,
          name: file.name,
          size: file.size
        });
      }

      const amount = parseFloat(formData.amountUSD);
      const body = {
        orgName: formData.orgName,
        title: formData.title,
        summary: formData.summary,
        contact: formData.contact,
        address: formData.address,
        city: formData.city,
        country: formData.country,
        amountUSD: Number.isFinite(amount) ? amount : 0,
        docs,
        ownerPhone: (formData.ownerPhone || '').trim(), // NEW (E.164 recommended, e.g. +34600111222)
      };

      const res = await createProposal(body);

      if (res?.proposalId) {
        router.push(`/admin/proposals/${res.proposalId}`);
      } else {
        // Fallback: stay and notify
        alert('Proposal created, but no proposalId returned.');
      }
    } catch (error) {
      console.error('Error creating proposal:', error);
      alert('Failed to create proposal: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create New Proposal</h1>
      {flash === 'proposer-profile-saved' && (
  <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
    Profile saved. You can submit your proposal now.
  </div>
)}
      {!profileReady && (
  <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
    <div className="font-medium mb-1">Complete your profile first</div>
 <div className="text-sm">
  Add your name and at least one contact method (email, phone/WhatsApp, or Telegram) to your profile.
</div>
    <div className="mt-3">
      <Link
        href="/proposer/profile"
        className="inline-flex items-center px-3 py-2 rounded-lg border border-sky-600 text-sky-700 hover:bg-sky-50"
      >
        Open Profile
      </Link>
    </div>
  </div>
)}

 <form
  onSubmit={(e) => {
    allowOnlyExplicitSubmit(e);
    if (e.defaultPrevented) return;
    handleSubmit(e);
  }}
  className="space-y-6"
>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization Name *</label>
            <input
              type="text"
              required
              value={formData.orgName}
              onChange={(e) => setFormData({...formData, orgName: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contact Email *</label>
            <input
              type="email"
              required
              value={formData.contact}
              onChange={(e) => setFormData({...formData, contact: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Project Title *</label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Project Summary *</label>
          <textarea
            required
            value={formData.summary}
            onChange={(e) => setFormData({...formData, summary: e.target.value})}
            className="w-full p-2 border rounded"
            rows={4}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Budget (USD)</label>
            <input
              type="number"
              step="0.01"
              value={formData.amountUSD}
              onChange={(e) => setFormData({...formData, amountUSD: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({...formData, city: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Country</label>
            <input
              type="text"
              value={formData.country}
              onChange={(e) => setFormData({...formData, country: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Address</label>
          <textarea
            value={formData.address}
            onChange={(e) => setFormData({...formData, address: e.target.value})}
            className="w-full p-2 border rounded"
            rows={2}
          />
        </div>

        {/* NEW: Phone + Connect Telegram */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Phone (for WhatsApp)</label>
            <input
              type="tel"
              placeholder="+34600111222"
              value={formData.ownerPhone}
              onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
<label className="block text-sm font-medium mb-1">Telegram</label>
<div className="flex items-center gap-3">
{/* Status + username (safer) */}
{(profile?.telegram_username || profile?.telegramUsername || profile?.telegram_chat_id || profile?.telegramChatId) ? (
  <span className="text-emerald-600 text-sm">
    Connected
    {(profile?.telegram_username || profile?.telegramUsername)
      ? ` (@${String(profile.telegram_username ?? profile.telegramUsername).replace(/^@/, '')})`
      : ''}
  </span>
) : (
  <span className="text-slate-500 text-sm">Not connected</span>
)}

  {/* Deep-link to connect */}
  {wallet ? (
    <a
      href={`https://t.me/${bot}?start=link_${(wallet || '').toLowerCase()}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center px-3 py-2 rounded-xl border hover:bg-slate-50"
    >
      {(profile?.telegram_username || profile?.telegramUsername) ? 'Re-link' : 'Connect Telegram'}
    </a>
  ) : (
    <div className="text-sm text-gray-500">
      Connect wallet to enable Telegram linking.
    </div>
  )}
</div>
<p className="text-xs text-gray-500 mt-1">
  Opens Telegram to link this wallet to your account.
</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Supporting Documents</label>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="w-full p-2 border rounded"
          />
          <p className="text-sm text-gray-500 mt-1">Upload any relevant documents (PDF, images, etc.)</p>
        </div>

        <div className="flex gap-4">
          {/* ✅ Only this button may submit */}
          <button
            type="submit"
            data-allow-submit="true"
            disabled={loading || !profileReady}
            title={!profileReady ? 'Complete your profile first' : undefined}
            className="bg-blue-600 text-white px-6 py-2 rounded disabled:bg-gray-400"
          >
            {loading ? 'Creating...' : 'Create Proposal'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-500 text-white px-6 py-2 rounded"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

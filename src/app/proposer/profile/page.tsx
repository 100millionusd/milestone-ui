// src/app/proposer/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProposerProfile, saveProposerProfile, chooseRole } from '@/lib/api'; // Added chooseRole import

type Address = { 
  line1?: string; 
  city?: string; 
  state?: string; 
  postalCode?: string; 
  country?: string;
  postal_code?: string; // For backward compatibility
};

type ProposerProfile = {
  vendorName?: string;
  vendor_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: Address;
};

export default function ProposerProfilePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<{
    vendorName: string;
    email: string;
    phone: string;
    website: string;
    address: Address;
  }>({
    vendorName: '',
    email: '',
    phone: '',
    website: '',
    address: { line1: '', city: '', state: '', postalCode: '', country: '' },
  });

  // Load current ENTITY profile
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p: ProposerProfile = await getProposerProfile();
        if (!alive) return;
        
        setForm({
          vendorName: String(p?.vendorName ?? p?.vendor_name ?? ''),
          email: String(p?.email ?? ''),
          phone: String(p?.phone ?? ''),
          website: String(p?.website ?? ''),
          address: {
            line1: String(p?.address?.line1 ?? ''),
            city: String(p?.address?.city ?? ''),
            state: String(p?.address?.state ?? ''),
            postalCode: String(p?.address?.postalCode ?? p?.address?.postal_code ?? ''),
            country: String(p?.address?.country ?? ''),
          },
        });
      } catch (error) {
        if (!alive) return;
        console.error('Failed to load profile:', error);
        // keep empty form
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    if (busy) return;
    
    // Basic validation
    if (!form.vendorName.trim()) {
      setErr('Organization name is required');
      return;
    }

    setBusy(true); 
    setErr(null);
    
    try {
      await saveProposerProfile(form);
      await chooseRole('proposer');
      
      // Use replace instead of push to avoid going back to this page
      router.replace('/new?flash=proposer-profile-saved');
    } catch (e: any) {
      setErr(e?.message || 'Failed to save entity profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Entity Profile</h1>
      <p className="text-slate-600">Complete your organization profile to submit proposals.</p>
      
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
          {err}
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium">Organization / Entity Name *</span>
        <input 
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          value={form.vendorName}
          onChange={e => setForm({...form, vendorName: e.target.value})}
          placeholder="Enter your organization name"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input 
          type="email"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          value={form.email}
          onChange={e => setForm({...form, email: e.target.value})}
          placeholder="contact@organization.com"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Phone</span>
        <input 
          type="tel"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          value={form.phone}
          onChange={e => setForm({...form, phone: e.target.value})}
          placeholder="+1 (555) 123-4567"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Website</span>
        <input 
          type="url"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          value={form.website}
          onChange={e => setForm({...form, website: e.target.value})}
          placeholder="https://example.com"
        />
      </label>

      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-4">
        <legend className="text-sm font-medium px-2">Address</legend>
        
        <label className="block md:col-span-2">
          <span className="text-sm">Address Line 1</span>
          <input 
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.line1}
            onChange={e => setForm({...form, address: {...form.address, line1: e.target.value}})}
          />
        </label>
        
        <label className="block">
          <span className="text-sm">City</span>
          <input 
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.city}
            onChange={e => setForm({...form, address: {...form.address, city: e.target.value}})}
          />
        </label>
        
        <label className="block">
          <span className="text-sm">State/Province</span>
          <input 
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.state}
            onChange={e => setForm({...form, address: {...form.address, state: e.target.value}})}
          />
        </label>
        
        <label className="block">
          <span className="text-sm">Postal Code</span>
          <input 
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.postalCode}
            onChange={e => setForm({...form, address: {...form.address, postalCode: e.target.value}})}
          />
        </label>
        
        <label className="block md:col-span-2">
          <span className="text-sm">Country</span>
          <input 
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            value={form.address.country}
            onChange={e => setForm({...form, address: {...form.address, country: e.target.value}})}
          />
        </label>
      </fieldset>

      <div className="flex gap-3 pt-4">
        <button
          onClick={save}
          disabled={busy}
          className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-xl disabled:opacity-60 font-medium"
        >
          {busy ? 'Saving…' : 'Save Entity Profile'}
        </button>
        <button 
          onClick={() => router.back()} 
          className="px-6 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
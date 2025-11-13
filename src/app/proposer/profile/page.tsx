// src/app/proposer/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProposerProfile, saveProposerProfile, chooseRole } from '@/lib/api';

type Address = { 
  line1?: string; 
  city?: string; 
  state?: string; 
  postalCode?: string; 
  country?: string;
};

export default function ProposerProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [debug, setDebug] = useState<string[]>([]);

  const addDebug = (message: string) => {
    console.log(`🔍 DEBUG: ${message}`);
    setDebug(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

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
        setLoading(true);
        addDebug('Starting to load profile...');
        
        const p = await getProposerProfile();
        addDebug(`Received profile data: ${JSON.stringify(p)}`);
        
        if (!alive) {
          addDebug('Component unmounted, skipping state update');
          return;
        }
        
        if (p && typeof p === 'object') {
          addDebug('Profile data exists, parsing...');
          
          let address: Address = { line1: '', city: '', state: '', postalCode: '', country: '' };
          
          // Handle address data
          if (p.address && typeof p.address === 'object') {
            addDebug('Using address object from response');
            address = {
              line1: p.address.line1 || '',
              city: p.address.city || '',
              state: p.address.state || '',
              postalCode: p.address.postalCode || p.address.postal_code || '',
              country: p.address.country || '',
            };
          } else if (p.addressText) {
            addDebug('Parsing address from addressText');
            const parts = p.addressText.split(', ');
            if (parts.length >= 3) {
              address = {
                line1: parts[0] || '',
                city: parts[1] || '',
                postalCode: parts[2] || '',
                country: parts[3] || '',
                state: '',
              };
            }
          }

          const newForm = {
            vendorName: p.vendorName || p.vendor_name || '',
            email: p.email || '',
            phone: p.phone || '',
            website: p.website || '',
            address,
          };

          addDebug(`Setting form with: ${JSON.stringify(newForm)}`);
          setForm(newForm);
          addDebug('Form state updated successfully');
        } else {
          addDebug('No profile data found or invalid format');
        }
      } catch (error: any) {
        if (!alive) return;
        addDebug(`Error loading profile: ${error.message}`);
        console.error('Failed to load profile:', error);
      } finally {
        if (alive) {
          setLoading(false);
          addDebug('Loading completed');
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    if (saving) return;
    
    // Basic validation
    if (!form.vendorName.trim()) {
      setErr('Organization name is required');
      return;
    }

    setSaving(true); 
    setErr(null);
    addDebug('Starting save process...');
    
    try {
      addDebug(`Form data to save: ${JSON.stringify(form)}`);
      
      // Prepare data for API
      const profileData = {
        vendorName: form.vendorName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        website: form.website.trim(),
        address: form.address,
      };

      addDebug(`Sending to API: ${JSON.stringify(profileData)}`);
      
      const result = await saveProposerProfile(profileData);
      addDebug(`Save API response: ${JSON.stringify(result)}`);
      
      addDebug('Setting role to proposer...');
      await chooseRole('proposer');
      addDebug('Role set successfully');
      
      addDebug('Redirecting to /new...');
      router.push('/new?flash=proposer-profile-saved');
      
    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to save entity profile';
      addDebug(`Save error: ${errorMsg}`);
      setErr(errorMsg);
    } finally {
      setSaving(false);
      addDebug('Save process completed');
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
          <span className="ml-3">Loading profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Entity Profile</h1>
      <p className="text-slate-600">Complete your organization profile to submit proposals.</p>
      
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
          {err}
        </div>
      )}

      {/* Debug panel - you can remove this later */}
      <details className="bg-slate-100 p-4 rounded-lg">
        <summary className="cursor-pointer font-mono text-sm">Debug Info</summary>
        <div className="mt-2 max-h-40 overflow-y-auto">
          {debug.map((msg, i) => (
            <div key={i} className="text-xs font-mono border-b border-slate-200 py-1">
              {msg}
            </div>
          ))}
        </div>
      </details>

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
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-xl disabled:opacity-60 font-medium"
        >
          {saving ? 'Saving…' : 'Save Entity Profile'}
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
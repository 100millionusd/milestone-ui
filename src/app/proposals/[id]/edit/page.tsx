'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getProposal, updateProposal, type Proposal } from '@/lib/api';

export default function EditProposalPage() {
  const { id } = useParams() as { id: string };
  const pid = Number(id);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form state (add any fields you want editable)
  const [orgName, setOrgName] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [amountUSD, setAmountUSD] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const p: Proposal = await getProposal(pid);
        if (!alive) return;
        setOrgName(p.orgName || '');
        setTitle(p.title || '');
        setSummary(p.summary || '');
        setContact(p.contact || '');
        setAddress(p.address || '');
        setCity(p.city || '');
        setCountry(p.country || '');
        setAmountUSD(p.amountUSD || 0);
      } catch (e: any) {
        setError(e?.message || 'Failed to load proposal');
      } finally {
        setLoading(false);
      }
    }
    if (Number.isFinite(pid)) load();
    return () => { alive = false; };
  }, [pid]);

  async function onSave() {
    try {
      setSaving(true);
      await updateProposal(pid, {
        orgName, title, summary, contact, address, city, country, amountUSD,
      });
      router.push(`/proposals/${pid}`); // or back to list
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!Number.isFinite(pid)) return <div className="p-6">Invalid proposal id.</div>;
  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Edit Proposal #{pid}</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}

      <label className="block">
        <span className="text-sm font-medium">Organization</span>
        <input className="mt-1 w-full border rounded p-2" value={orgName} onChange={e=>setOrgName(e.target.value)} />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Title</span>
        <input className="mt-1 w-full border rounded p-2" value={title} onChange={e=>setTitle(e.target.value)} />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Summary</span>
        <textarea className="mt-1 w-full border rounded p-2" rows={5} value={summary} onChange={e=>setSummary(e.target.value)} />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">Contact (email)</span>
          <input className="mt-1 w-full border rounded p-2" value={contact} onChange={e=>setContact(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Amount (USD)</span>
          <input type="number" className="mt-1 w-full border rounded p-2"
                 value={amountUSD} onChange={e=>setAmountUSD(Number(e.target.value)||0)} />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="block">
          <span className="text-sm font-medium">Address</span>
          <input className="mt-1 w-full border rounded p-2" value={address} onChange={e=>setAddress(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">City</span>
          <input className="mt-1 w-full border rounded p-2" value={city} onChange={e=>setCity(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Country</span>
          <input className="mt-1 w-full border rounded p-2" value={country} onChange={e=>setCountry(e.target.value)} />
        </label>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}


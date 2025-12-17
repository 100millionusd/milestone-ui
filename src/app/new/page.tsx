'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  createProposal,
  uploadProofFiles,
  getAuthRoleOnce,
  getProposerProfile,
  API_BASE
} from "@/lib/api";
import Link from 'next/link';
import { MapPin, AlertCircle, Loader2, Search, FileText, UploadCloud } from 'lucide-react';

// ✅ Guard: only allow submit when the clicked button opts in
const allowOnlyExplicitSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
  // @ts-ignore
  const submitter = e.nativeEvent?.submitter as HTMLElement | undefined;
  if (!submitter || submitter.getAttribute('data-allow-submit') !== 'true') {
    e.preventDefault();
  }
};

const isProfileReady = (p: any) => {
  if (!p) return false;
  const hasName = (p.vendor_name?.trim() || p.vendorName?.trim());
  const hasContact = p.email?.trim() || p.phone?.trim() || p.whatsapp?.trim() ||
    p.telegram_username?.trim() || p.telegramUsername?.trim() ||
    p.telegram_chat_id?.trim() || p.telegramChatId?.trim();
  return !!(hasName && hasContact);
};

export default function NewProposalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const bot = process.env.NEXT_PUBLIC_TG_BOT_NAME || 'YourBotName';
  const [profile, setProfile] = useState<any>(null);
  const profileReady = isProfileReady(profile);
  const [flash, setFlash] = useState<string | null>(null);

  // GPS State
  const [gps, setGps] = useState<{ lat: number | null, lon: number | null }>({ lat: null, lon: null });
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

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
    ownerPhone: '',
  });
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const j = await getAuthRoleOnce();
        if (j?.address) setWallet(j.address);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await getProposerProfile();
        if (!alive) return;
        setProfile(p || null);
      } catch (e) {
        if (!alive) return;
        setProfile(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  // --- 🌍 AUTOMATIC GEOCODING ---
  // Triggered when user clicks "Find Location"
  const handleGeocode = async () => {
    const query = [formData.address, formData.city, formData.country].filter(Boolean).join(', ');

    if (!query || query.length < 5) {
      setGpsError("Please enter a valid address, city, and country first.");
      return;
    }

    setIsGeocoding(true);
    setGpsError(null);

    try {
      // Use OpenStreetMap Nominatim API (Free, no key required for low volume)
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'LithiumX-Proposal-App' } });
      const data = await res.json();

      if (data && data.length > 0) {
        setGps({
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon)
        });
      } else {
        setGpsError("Could not find coordinates for this address. Please check spelling or enter GPS manually.");
        setGps({ lat: null, lon: null });
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setGpsError("Failed to fetch location. Please enter GPS manually.");
    } finally {
      setIsGeocoding(false);
    }
  };


  // --- PDF AUTO-FILL ---
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setIsParsingPdf(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Hardcode Railway URL to ensure we hit production
      const res = await fetch(`https://milestone-api-production.up.railway.app/api/parse-proposal-pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to parse PDF');

      const data = await res.json();

      // Auto-fill form
      setFormData(prev => ({
        ...prev,
        orgName: data.orgName || prev.orgName,
        title: data.title || prev.title,
        summary: data.summary || prev.summary,
        contact: data.contact || prev.contact,
        address: data.address || prev.address,
        city: data.city || prev.city,
        country: data.country || prev.country,
        amountUSD: data.amountUSD ? String(data.amountUSD) : prev.amountUSD,
        ownerPhone: data.ownerPhone || prev.ownerPhone,
      }));

      // Trigger Geocode if address is present
      if (data.address || data.city) {
        // We can't call handleGeocode directly easily because it uses state that might not be updated yet.
        // But we can set the state and let the user click or trigger it manually.
        // Or we can try to trigger it:
        // For now, let's just fill the fields.
      }

      alert("Form auto-filled from PDF!");

    } catch (error) {
      console.error("PDF parse error:", error);
      alert("Failed to extract data from PDF. Please fill manually.");
    } finally {
      setIsParsingPdf(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!profileReady) {
      alert('Please complete your profile first.');
      setLoading(false);
      return;
    }

    if (!gps.lat || !gps.lon) {
      alert('Please verify the School Location (GPS) before submitting.');
      setLoading(false);
      return;
    }

    try {
      let docs: Array<{ cid: string; url: string; name: string; size: number }> = [];
      if (files.length > 0) {
        const uploaded = await uploadProofFiles(files);
        docs = uploaded.map((u, i) => ({
          cid: u.cid,
          url: u.url,
          name: u.name,
          size: files[i]?.size || 0
        }));
      }

      const rawStr = formData.amountUSD.toString().replace(/,/g, '');
      const amountNum = parseFloat(rawStr);
      const finalAmount = Number.isFinite(amountNum) ? amountNum : 0;
      const finalString = finalAmount.toString();

      const body: any = {
        orgName: formData.orgName,
        title: formData.title,
        summary: formData.summary,
        contact: formData.contact,
        address: formData.address,
        city: formData.city,
        country: formData.country,
        amount: finalAmount,
        amountUSD: finalAmount,
        amount_usd: finalAmount,
        price: finalAmount,
        budget: finalAmount,
        amountStr: finalString,
        budgetStr: finalString,
        totalBudgetUSD: finalAmount,
        docs,
        ownerPhone: (formData.ownerPhone || '').trim(),
        location: { lat: gps.lat, lon: gps.lon }
      };

      const res = await createProposal(body);

      if (res?.proposalId) {
        window.location.href = `/admin/proposals/${res.proposalId}`;
      } else {
        alert('Proposal created, but no ID returned.');
      }
    } catch (error) {
      console.error('Error creating proposal:', error);
      alert('Failed to create proposal.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create New Proposal</h1>

      {/* PDF Upload Button */}
      <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-indigo-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Auto-fill from PDF
          </h3>
          <p className="text-sm text-indigo-700 mt-1">
            Upload your proposal PDF and we'll extract the details for you.
          </p>
        </div>
        <div className="relative">
          <input
            type="file"
            accept=".pdf"
            ref={fileInputRef}
            onChange={handlePdfUpload}
            disabled={isParsingPdf}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsingPdf}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isParsingPdf ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing PDF...
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                Upload Proposal PDF
              </>
            )}
          </button>
        </div>
      </div>

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
            <Link href="/vendor/profile" className="inline-flex items-center px-3 py-2 rounded-lg border border-sky-600 text-sky-700 hover:bg-sky-50">
              Open Profile
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} className="space-y-6">

        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization Name *</label>
            <input type="text" required value={formData.orgName} onChange={(e) => setFormData({ ...formData, orgName: e.target.value })} className="w-full p-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contact Email *</label>
            <input type="email" required value={formData.contact} onChange={(e) => setFormData({ ...formData, contact: e.target.value })} className="w-full p-2 border rounded" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Project Title *</label>
          <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full p-2 border rounded" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Project Summary *</label>
          <textarea required value={formData.summary} onChange={(e) => setFormData({ ...formData, summary: e.target.value })} className="w-full p-2 border rounded" rows={4} />
        </div>

        {/* Budget */}
        <div>
          <label className="block text-sm font-medium mb-1">Budget (USD)</label>
          <input type="text" inputMode="decimal" placeholder="e.g. 75000" value={formData.amountUSD} onChange={(e) => { if (/^[0-9.,]*$/.test(e.target.value)) setFormData({ ...formData, amountUSD: e.target.value }); }} className="w-full p-2 border rounded" />
        </div>

        {/* --- Location Section (Address -> GPS) --- */}
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <MapPin size={18} className="text-emerald-600" />
            School Location
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Address / Street</label>
              <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full p-2 border rounded bg-white" placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full p-2 border rounded bg-white" placeholder="New York" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Country</label>
                <input type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="w-full p-2 border rounded bg-white" placeholder="USA" />
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-end pt-2 border-t border-slate-200">
            <div className="flex-1 w-full">
              <label className="text-xs text-slate-500 mb-1 block">Latitude</label>
              <input
                type="number"
                step="any"
                value={gps.lat ?? ''}
                onChange={(e) => setGps({ ...gps, lat: parseFloat(e.target.value) || null })}
                className="w-full p-2 border rounded bg-slate-100 text-slate-600"
                placeholder="Auto-filled"
              />
            </div>
            <div className="flex-1 w-full">
              <label className="text-xs text-slate-500 mb-1 block">Longitude</label>
              <input
                type="number"
                step="any"
                value={gps.lon ?? ''}
                onChange={(e) => setGps({ ...gps, lon: parseFloat(e.target.value) || null })}
                className="w-full p-2 border rounded bg-slate-100 text-slate-600"
                placeholder="Auto-filled"
              />
            </div>
            <button
              type="button"
              onClick={handleGeocode}
              disabled={isGeocoding}
              className="w-full md:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 mb-[1px]"
            >
              {isGeocoding ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Find GPS from Address
            </button>
          </div>

          {gpsError && (
            <div className="flex items-center gap-2 mt-2 text-rose-600 text-xs">
              <AlertCircle size={14} />
              {gpsError}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-1">
            Click "Find GPS" to auto-fill coordinates based on the address above. These are required for verifying delivery reports.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Phone (for WhatsApp)</label>
            <input type="tel" placeholder="+34600111222" value={formData.ownerPhone} onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })} className="w-full p-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Telegram</label>
            <div className="flex items-center gap-3">
              {(profile?.telegram_username || profile?.telegramUsername || profile?.telegram_chat_id || profile?.telegramChatId) ? (
                <span className="text-emerald-600 text-sm">Connected</span>
              ) : (
                <span className="text-slate-500 text-sm">Not connected</span>
              )}
              {wallet ? (
                <a href={`https://t.me/${bot}?start=link_${(wallet || '').toLowerCase()}`} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 py-2 rounded-xl border hover:bg-slate-50">
                  Link Telegram
                </a>
              ) : (
                <div className="text-sm text-gray-500">Connect wallet first</div>
              )}
            </div>
          </div>
        </div>

        {/* Files Section */}
        <div>
          <label className="block text-sm font-medium mb-1">Supporting Documents</label>
          <div className="space-y-3">
            <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleFileChange} className="w-full p-2 border rounded" />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-sm text-slate-700 shadow-sm">
                    <span className="truncate max-w-[180px]" title={file.name}>{file.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-rose-600 transition-colors" title="Remove file">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <button type="submit" data-allow-submit="true" disabled={loading || !profileReady} className="bg-blue-600 text-white px-6 py-2 rounded disabled:bg-gray-400 hover:bg-blue-700 transition-colors">
            {loading ? 'Creating...' : 'Create Proposal'}
          </button>
          <button type="button" onClick={() => router.back()} className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
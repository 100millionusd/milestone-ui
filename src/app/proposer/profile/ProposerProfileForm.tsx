// src/app/proposer/profile/ProposerProfileForm.tsx
'use client';

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProposerProfile, chooseRole, getProposerProfile } from "@/lib/api";

type Address = {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type Initial = {
  vendorName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: Address | string | null;
  addressText?: string | null;
};

function parseAddress(raw: Initial["address"], addressText?: string | null): Address {
  // accept object or "line1, city, postal, country"
  if (raw && typeof raw === "object") {
    return {
      line1: raw.line1 || "",
      city: raw.city || "",
      state: (raw as any).state || "",
      postalCode: raw.postalCode || "",
      country: raw.country || "",
    };
  }
  if (typeof raw === "string" && raw.trim()) {
    const parts = raw.split(",").map(s => s.trim());
    return {
      line1: parts[0] || "",
      city: parts[1] || "",
      postalCode: parts[2] || "",
      country: parts[3] || "",
      state: "",
    };
  }
  if (addressText && addressText.trim()) {
    const parts = addressText.split(",").map(s => s.trim());
    return {
      line1: parts[0] || "",
      city: parts[1] || "",
      postalCode: parts[2] || "",
      country: parts[3] || "",
      state: "",
    };
  }
  return { line1: "", city: "", state: "", postalCode: "", country: "" };
}

export default function ProposerProfileForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const inited = useRef(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false); // ✅ added (was missing in your previous file)
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState(() => ({
    vendorName: initial?.vendorName || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    website: initial?.website || "",
    address: parseAddress(initial?.address, initial?.addressText),
  }));

  // Refetch on mount (client) to populate after hydration even if SSR had no auth
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        console.log("[PROFILE] refetch on mount…");
        const p = await getProposerProfile();
        console.log("[PROFILE] refetched:", p);
        if (!alive) return;

        let address: Address = { line1: "", city: "", state: "", postalCode: "", country: "" };

        if (p?.address && typeof p.address === "object") {
          address = {
            line1: p.address.line1 || "",
            city: p.address.city || "",
            state: p.address.state || "",
            postalCode: p.address.postalCode || "",
            country: p.address.country || "",
          };
        } else if (p?.addressText) {
          const parts = String(p.addressText).split(", ");
          if (parts.length >= 3) {
            address = {
              line1: parts[0] || "",
              city: parts[1] || "",
              postalCode: parts[2] || "",
              country: parts[3] || "",
              state: "",
            };
          }
        }

        setForm({
          vendorName: p?.vendorName || "",
          email: p?.email || "",
          phone: p?.phone || "",
          website: p?.website || "",
          address,
        });
      } catch (e) {
        console.warn("[PROFILE] refetch failed:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Guard against double re-init in React strict mode
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    setForm({
      vendorName: initial?.vendorName || "",
      email: initial?.email || "",
      phone: initial?.phone || "",
      website: initial?.website || "",
      address: parseAddress(initial?.address, initial?.addressText),
    });
  }, [initial]);

  async function onContinueAsEntity() {
    if (saving) return;
    if (!form.vendorName.trim()) {
      setErr("Organization name is required");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      // 1) save
      await saveProposerProfile({
        vendorName: form.vendorName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        website: form.website.trim(),
        address: form.address,
      });

      // 2) choose role
      await chooseRole("proposer");

      // 3) refetch to confirm & refresh local state once
      const reread = await getProposerProfile();
      setForm({
        vendorName: reread?.vendorName || "",
        email: reread?.email || "",
        phone: reread?.phone || "",
        website: reread?.website || "",
        address: parseAddress(reread?.address, reread?.addressText),
      });

      // 4) go next (your flow)
      router.replace("/new?flash=proposer-profile-saved");
    } catch (e: any) {
      setErr(e?.message || "Failed to save entity profile");
    } finally {
      setSaving(false);
    }
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

      {loading && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2">
          Loading latest profile…
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium">Organization / Entity Name *</span>
        <input
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.vendorName}
          onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
          placeholder="Enter your organization name"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="contact@organization.com"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Phone</span>
        <input
          type="tel"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+1 (555) 123-4567"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Website</span>
        <input
          type="url"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          placeholder="https://example.com"
        />
      </label>

      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-4">
        <legend className="text-sm font-medium px-2">Address</legend>

        <label className="block md:col-span-2">
          <span className="text-sm">Address Line 1</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.line1}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, line1: e.target.value } })
            }
          />
        </label>

        <label className="block">
          <span className="text-sm">City</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.city}
            onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
          />
        </label>

        <label className="block">
          <span className="text-sm">State/Province</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.state}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, state: e.target.value } })
            }
          />
        </label>

        <label className="block">
          <span className="text-sm">Postal Code</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.postalCode}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, postalCode: e.target.value } })
            }
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm">Country</span>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
            value={form.address.country}
            onChange={(e) =>
              setForm({ ...form, address: { ...form.address, country: e.target.value } })
            }
          />
        </label>
      </fieldset>

      <div className="flex gap-3 pt-4">
        <button
          onClick={onContinueAsEntity}
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-xl disabled:opacity-60 font-medium"
        >
          {saving ? "Saving…" : "Save Entity Profile"}
        </button>
      </div>
    </div>
  );
}

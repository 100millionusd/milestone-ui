// src/app/bids/page.tsx
"use client";

import { useState } from "react";
// IMPORTANT: this path is from src/app/bids/page.tsx -> src/lib/api.ts
import { postJSON, uploadFileToIPFS } from "../../lib/api";

type Upload = { name: string; cid: string; url: string; size: number };

export default function BidsPage() {
  const [proposalCid, setProposalCid] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [contact, setContact] = useState("");
  const [wallet, setWallet] = useState("");
  const [milestonesTxt, setMilestonesTxt] = useState("1.0, 2.0");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setMsg(null);
    const newUps: Upload[] = [];
    for (const f of Array.from(files)) {
      try {
        const up = await uploadFileToIPFS(f);
        newUps.push({ name: f.name, cid: up.cid, url: up.url, size: f.size });
      } catch (err: any) {
        setMsg(`Upload failed: ${err?.message || String(err)}`);
        return;
      }
    }
    setUploads((u) => [...u, ...newUps]);
  }

  async function submitBid() {
    try {
      setBusy(true);
      setMsg(null);
      const milestones = milestonesTxt
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((amount) => ({ label: "Milestone", amount }));

      const docs = uploads.map((u) => u.cid);
      const out = await postJSON("/bids", {
        proposalCid,
        vendorName,
        contact,
        wallet,
        milestones,
        docs,
      });
      setMsg(`Bid submitted. bidId=${out.bidId}`);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Submit a Bid</h1>
      {msg && <p className="p-2 rounded bg-yellow-50 border">{msg}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <div className="text-sm opacity-70">Proposal CID</div>
          <input className="w-full border p-2 rounded" value={proposalCid} onChange={(e) => setProposalCid(e.target.value)} />
        </label>

        <label className="block">
          <div className="text-sm opacity-70">Vendor / Company Name</div>
          <input className="w-full border p-2 rounded" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
        </label>

        <label className="block">
          <div className="text-sm opacity-70">Contact (email / phone)</div>
          <input className="w-full border p-2 rounded" value={contact} onChange={(e) => setContact(e.target.value)} />
        </label>

        <label className="block">
          <div className="text-sm opacity-70">Payout Wallet (EVM address)</div>
          <input className="w-full border p-2 rounded" value={wallet} onChange={(e) => setWallet(e.target.value)} />
        </label>

        <label className="block sm:col-span-2">
          <div className="text-sm opacity-70">Milestone amounts (comma separated)</div>
          <input className="w-full border p-2 rounded" value={milestonesTxt} onChange={(e) => setMilestonesTxt(e.target.value)} />
        </label>

        <label className="block sm:col-span-2">
          <div className="text-sm opacity-70">Attachments (PDF/JPG/PNG)</div>
          <input type="file" multiple onChange={onFiles} />
          {uploads.length > 0 && (
            <ul className="mt-2 text-sm list-disc pl-5">
              {uploads.map((u) => (
                <li key={u.cid}><a className="text-blue-600 underline" href={u.url} target="_blank">{u.name}</a></li>
              ))}
            </ul>
          )}
        </label>
      </div>

      <button
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        onClick={submitBid}
        disabled={busy || !proposalCid || !vendorName || !wallet}
      >
        {busy ? "Submitting..." : "Submit Bid"}
      </button>
    </main>
  );
}

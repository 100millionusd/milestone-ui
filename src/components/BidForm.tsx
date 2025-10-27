"use client";

import { useState } from "react";
import { postJSON, uploadFileToIPFS } from "@/lib/api";

type Props = { proposalId: number };

export default function BidForm({ proposalId }: Props) {
  const [bidderName, setBidderName] = useState("");
  const [contact, setContact] = useState("");
  const [amountUSD, setAmountUSD] = useState<number | string>("");
  const [summary, setSummary] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<
    { name: string; cid: string; url: string; size: number }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // FIX: Handle file selection - APPEND instead of replace
  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    
    const newFiles = Array.from(selectedFiles);
    setFiles(prev => [...prev, ...newFiles]); // ← This is the fix: APPEND files
  };

  // NEW: Remove individual file
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // NEW: Clear all files
  const clearAllFiles = () => {
    setFiles([]);
    setUploads([]);
    setMsg(null);
  };

  async function handleUpload() {
    setErr(null);
    try {
      const results: typeof uploads = [];
      for (const f of files) {
        const u = await uploadFileToIPFS(f);
        results.push({
          name: f.name,
          cid: u.cid,
          url: u.url,
          size: f.size,
        });
      }
      setUploads(results);
      setMsg(`Uploaded ${results.length} file(s).`);
    } catch (e: any) {
      setErr(`Upload failed: ${e?.message || String(e)}`);
    }
  }

  async function submitBid() {
    setErr(null);
    setMsg(null);
    setSubmitting(true);
    try {
      const body = {
        proposalId,
        bidderName,
        contact,
        amountUSD:
          typeof amountUSD === "string" ? parseFloat(amountUSD || "0") : amountUSD,
        summary,
        files: uploads,
      };
      const res = await postJSON("/bids", body);
      setMsg(`Bid submitted! ${res?.id ? `bidId=${res.id}` : ""}`);
    } catch (e: any) {
      setErr(e?.message || "Bid failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 border rounded p-4">
      {msg && <div className="p-2 bg-green-100 text-green-800 text-sm rounded">{msg}</div>}
      {err && <div className="p-2 bg-red-100 text-red-800 text-sm rounded">{err}</div>}

      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm">Company / Bidder Name</span>
          <input
            className="border rounded px-3 py-2"
            value={bidderName}
            onChange={(e) => setBidderName(e.target.value)}
            placeholder="Shamba Pumps Ltd"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm">Contact (email or phone)</span>
          <input
            className="border rounded px-3 py-2"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="shamba@example.com"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm">Bid Amount (USD)</span>
          <input
            type="number"
            className="border rounded px-3 py-2"
            value={amountUSD}
            onChange={(e) => setAmountUSD(e.target.value)}
            placeholder="12500"
            min="0"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm">Summary</span>
          <textarea
            className="border rounded px-3 py-2"
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Borehole drilling + solar pump system..."
          />
        </label>

        {/* FIXED: Attachments section with multi-file support */}
        <div className="grid gap-2 border rounded p-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Attach files (optional)</span>
            {files.length > 0 && (
              <button
                type="button"
                onClick={clearAllFiles}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Clear all
              </button>
            )}
          </div>
          
          <input
            type="file"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
            className="text-sm"
          />
          
          {/* Show selected files with remove buttons */}
          {files.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium mb-1">
                Selected files ({files.length}):
              </div>
              <ul className="space-y-1 text-xs">
                {files.map((file, index) => (
                  <li key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-gray-500 ml-2 text-xs">
                      {Math.round(file.size / 1024)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="ml-2 text-red-500 hover:text-red-700 text-xs"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={handleUpload}
            className="px-3 py-2 rounded bg-gray-900 text-white disabled:opacity-50 text-sm"
            disabled={!files.length}
          >
            Upload {files.length} file(s) to IPFS
          </button>
          
          {uploads.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium mb-1">Uploaded files:</div>
              <ul className="text-xs list-disc pl-5 space-y-1">
                {uploads.map((u) => (
                  <li key={u.cid}>
                    <a
                      className="underline"
                      href={u.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {u.name}
                    </a>{" "}
                    ({Math.round(u.size / 1024)} KB)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={submitBid}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={submitting || !bidderName || !contact || !amountUSD}
        >
          {submitting ? "Submitting…" : "Submit Bid"}
        </button>
      </div>
    </div>
  );
}
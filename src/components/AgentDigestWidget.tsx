"use client";

import { useEffect, useMemo, useState } from "react";
import { getDigest, markDigestSeen } from "@/lib/api";

export default function AgentDigestWidget() {
  const [data, setData] = useState<null | Awaited<ReturnType<typeof getDigest>>>(null);
  const [loading, setLoading] = useState(true);
  const [since, setSince] = useState<string | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  async function load(s?: string) {
    setLoading(true);
    setErr(null);
    try {
      const d = await getDigest(s, 50);
      setData(d);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(since);
    const id = setInterval(() => load(since), 60_000); // refresh every 60s
    return () => clearInterval(id);
  }, [since]);

  const counts = data?.counts;
  const items = data?.items || [];

  return (
    <div className="rounded-2xl shadow p-4 bg-white border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Agent 2 — What’s New</h3>
        <div className="flex gap-2">
          <button
            onClick={() => load(since)}
            className="px-3 py-1 rounded-xl border"
          >
            Refresh
          </button>
          <button
            onClick={async () => {
              await markDigestSeen();
              // after marking seen, use NOW as since so next load shows only truly new
              setSince(new Date().toISOString());
            }}
            className="px-3 py-1 rounded-xl border"
          >
            Mark as read
          </button>
        </div>
      </div>

      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}

      {data && (
        <>
          <div className="flex gap-4 text-sm mb-3">
            <span>Proposals: <strong>{counts?.proposals_new ?? 0}</strong></span>
            <span>Bids: <strong>{counts?.bids_new ?? 0}</strong></span>
            <span>Proofs: <strong>{counts?.proofs_new ?? 0}</strong></span>
            <span className="opacity-70">since {new Date(data.since).toLocaleString()}</span>
          </div>

          <div className="text-sm whitespace-pre-wrap mb-3 border rounded-xl p-3 bg-gray-50">
            {data.ai_summary}
          </div>

          <ul className="space-y-2 max-h-72 overflow-auto pr-1">
            {items.map((it: any) => (
              <li key={`${it.type}-${it.id}-${it.updated_at}`} className="border rounded-xl p-3">
                <div className="text-xs uppercase opacity-60">{it.type}</div>
                <div className="font-medium">
                  {it.title || it.vendor || it.id}
                </div>
                <div className="text-xs opacity-70">
                  Updated {new Date(it.updated_at).toLocaleString()}
                </div>
                {it.link && (
                  <a href={it.link} className="text-xs underline">Open</a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

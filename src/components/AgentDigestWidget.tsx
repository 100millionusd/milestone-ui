"use client";

import { useEffect, useMemo, useState } from "react";
import { getDigest, markDigestSeen } from "@/lib/api";

type DigestCounts = {
  proposals_new: number;
  bids_new: number;
  proofs_new: number;
};

type DigestItem = {
  type: "proposal" | "bid" | "proof" | string;
  id: string | number;
  title?: string | null;
  vendor?: string | null;
  wallet?: string | null;
  proposalId?: string | number | null;
  bidId?: string | number | null;
  milestoneIndex?: number | null;
  amountUSD?: number | null;
  status?: string | null;
  updated_at?: string;
  submitted_at?: string;
  link?: string | null;
};

type DigestResponse = {
  since: string;
  counts: DigestCounts;
  items: DigestItem[];
  ai_summary: string;
};

export default function AgentDigestWidget() {
  const [data, setData] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [since, setSince] = useState<string | undefined>(undefined);

  async function load(s?: string) {
    setLoading(true);
    setErr(null);
    try {
      const d = await getDigest(s, 50);
      setData(d);
    } catch (e: any) {
      setErr(e?.message || "Failed to load digest");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(since);
    const id = setInterval(() => load(since), 60_000); // refresh every 60s
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since]);

  const counts = data?.counts;
  const items = data?.items ?? [];
  const sinceLabel = useMemo(() => {
    if (!data?.since) return "";
    try {
      return new Date(data.since).toLocaleString();
    } catch {
      return data.since;
    }
  }, [data?.since]);

  return (
    <div className="rounded-2xl shadow p-4 bg-white border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Agent 2 — What’s New</h3>
        <div className="flex gap-2">
          <button
            onClick={() => load(since)}
            className="px-3 py-1 rounded-xl border text-sm"
          >
            Refresh
          </button>
          <button
            onClick={async () => {
              await markDigestSeen();
              // Use NOW as the new baseline. Next loads show only truly new items.
              setSince(new Date().toISOString());
            }}
            className="px-3 py-1 rounded-xl border text-sm"
          >
            Mark as read
          </button>
        </div>
      </div>

      {/* status row */}
      <div className="flex flex-wrap gap-3 text-sm mb-3">
        <span className="inline-flex items-center gap-1">
          Proposals: <strong>{counts?.proposals_new ?? 0}</strong>
        </span>
        <span className="inline-flex items-center gap-1">
          Bids: <strong>{counts?.bids_new ?? 0}</strong>
        </span>
        <span className="inline-flex items-center gap-1">
          Proofs: <strong>{counts?.proofs_new ?? 0}</strong>
        </span>
        {data?.since && (
          <span className="opacity-70">since {sinceLabel}</span>
        )}
      </div>

      {/* loading / error */}
      {loading && (
        <div className="text-sm opacity-70 mb-2">Loading…</div>
      )}
      {err && (
        <div className="text-sm text-red-600 mb-2">{err}</div>
      )}

      {/* AI summary */}
      {!!data?.ai_summary && (
        <div className="text-sm whitespace-pre-wrap mb-3 border rounded-xl p-3 bg-gray-50">
          {data.ai_summary}
        </div>
      )}

      {/* list */}
      <ul className="space-y-2 max-h-72 overflow-auto pr-1">
        {items.map((it) => {
          const ts =
            it.updated_at ||
            it.submitted_at ||
            undefined;
          const tsLabel = ts
            ? (() => {
                try {
                  return new Date(ts).toLocaleString();
                } catch {
                  return ts;
                }
              })()
            : null;

          return (
            <li
              key={`${it.type}-${it.id}-${ts || Math.random()}`}
              className="border rounded-xl p-3"
            >
              <div className="text-[10px] uppercase tracking-wide opacity-60">
                {it.type}
              </div>
              <div className="font-medium">
                {it.title || it.vendor || `#${it.id}`}
              </div>
              <div className="text-xs opacity-70">
                {tsLabel ? <>Updated {tsLabel}</> : null}
                {it.status ? <> • {it.status}</> : null}
                {typeof it.milestoneIndex === "number" ? (
                  <> • Milestone {it.milestoneIndex + 1}</>
                ) : null}
                {typeof it.amountUSD === "number" ? (
                  <> • ${it.amountUSD.toLocaleString()}</>
                ) : null}
              </div>
              {it.link ? (
                <a
                  href={it.link}
                  className="text-xs underline mt-1 inline-block"
                >
                  Open
                </a>
              ) : null}
            </li>
          );
        })}
        {!loading && !err && items.length === 0 && (
          <li className="text-sm opacity-70">No updates yet.</li>
        )}
      </ul>
    </div>
  );
}

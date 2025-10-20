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

  // 🔧 Normalize server shapes -> widget-friendly items
  const items = useMemo(() => {
    const src = (data?.items ?? []) as any[];
    return src.map((raw) => {
      const typeRaw = String(raw.type ?? "").toLowerCase();

      const id =
        raw.id ??
        raw.proposal_id ??
        raw.bid_id ??
        raw.proof_id ??
        "—";

      const title =
        raw.title ??
        raw.vendor ??
        raw.vendor_name ??
        null;

      const updated_at =
        raw.updated_at ??
        raw.ts ??
        raw.submitted_at ??
        null;

      const milestoneIndex =
        raw.milestoneIndex ??
        raw.milestone_index ??
        null;

      const amountUSD =
        raw.amountUSD ??
        raw.amount_usd ??
        null;

      const link =
        raw.link ??
        (typeRaw.includes("proposal")
          ? `/admin/proposals/${id}`
          : (typeRaw.includes("bid") ||
             typeRaw.includes("proof") ||
             typeRaw.includes("payment") ||
             typeRaw.includes("decision"))
          ? `/admin/bids/${raw.bid_id ?? id}`
          : null);

      const typeLabel = (() => {
        if (typeRaw === "proposal" || typeRaw.includes("proposal")) return "Proposal";
        if (typeRaw === "bid" || typeRaw.includes("bid_submitted")) return "Bid";
        if (typeRaw === "proof" || typeRaw.includes("proof_submitted")) return "Proof submitted";
        if (typeRaw.includes("proof_decision")) return "Proof decision";
        if (typeRaw.includes("payment_released")) return "Payment released";
        return (raw.type ?? "").toString();
      })();

      return {
        ...raw,
        type: typeLabel,
        id,
        title,
        updated_at,
        milestoneIndex,
        amountUSD,
        link,
      } as DigestItem & {
        type: string;
        updated_at?: string | null;
      };
    });
  }, [data?.items]);

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
            (it as any).updated_at ||
            (it as any).submitted_at ||
            (it as any).ts ||
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
              key={`${String((it as any).type)}-${String(it.id)}-${ts || Math.random()}`}
              className="border rounded-xl p-3"
            >
              <div className="text-[10px] uppercase tracking-wide opacity-60">
                {(it as any).type}
              </div>
              <div className="font-medium">
                {it.title || (it as any).vendor || `#${String(it.id)}`}
              </div>
              <div className="text-xs opacity-70">
                {tsLabel ? <>Updated {tsLabel}</> : null}
                {(it as any).status ? <> • {(it as any).status}</> : null}
                {typeof (it as any).milestoneIndex === "number" ? (
                  <> • Milestone {(it as any).milestoneIndex + 1}</>
                ) : null}
                {typeof (it as any).amountUSD === "number" ? (
                  <> • ${(it as any).amountUSD.toLocaleString()}</>
                ) : null}
              </div>
              {(it as any).link ? (
                <a
                  href={(it as any).link}
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

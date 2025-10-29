"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getBidsOnce } from "@/lib/api";

// --- Helpers for Activity "Open" links ---
const safeStringify = (o: any) => {
  try { return JSON.stringify(o); } catch { return "{}"; }
};

const makePayloadQS = (row: any) =>
  new URLSearchParams({
    payload: safeStringify(row?.changes ?? {}),
  }).toString();

// --- open JSON payload in a new tab (Activity "View" link) ---
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" } as any)[m]
  );
}
function openJsonInNewTab(title: string, payload: any) {
  const pretty = JSON.stringify(payload ?? {}, null, 2);
  const html = `<!doctype html>
<html><head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  html,body{margin:0;padding:16px;background:#0b0b0b;color:#e5e5e5;font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
  pre{white-space:pre-wrap;word-break:break-word}
  .wrap{max-width:1000px;margin:0 auto}
  .h{color:#9CA3AF;margin-bottom:8px}
</style>
</head><body>
<div class="wrap">
  <div class="h">${escapeHtml(title)}</div>
  <pre>${escapeHtml(pretty)}</pre>
</div>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ------------------------------------------------------------
// Admin Oversight — polished
// - Pure React + Tailwind (no external UI packages)
// - Drop into app/admin/page.tsx or pages/admin.tsx
// - Uses NEXT_PUBLIC_API_BASE_URL to call /admin/oversight (server) or /api/admin/oversight (Next API)
// - Adds: auto-refresh, keyboard shortcuts, CSV export, sticky headers, a11y, sorting, toasts, persisted tab/query
// ------------------------------------------------------------

// —— Types that match your /api/admin/oversight payload ——
// (unchanged; mirror server output)

type Oversight = {
  tiles: {
    openProofs: number;
    breachingSla: number;
    pendingPayouts: { count: number; totalUSD: number };
    escrowsLocked: number;
    p50CycleHours: number;
    revisionRatePct: number;
  };
  queue: Array<{
    id: number;
    vendor: string;
    project: string;
    milestone: number;
    ageHours: number;
    status: string;
    risk: string;
    actions?: { bidId?: number; proposalId?: number };
  }>;
  vendors: Array<{
    vendor: string;
    wallet: string;
    proofs: number;
    approved: number;
    cr: number;
    approvalPct: number;
    bids: number;
    lastActivity: string;
  }>;
  alerts: Array<{
    type: string;
    createdAt: string;
    bidId?: string | number;
    details?: any;
  }>;
  payouts: {
    pending: any[];
    recent: Array<{
      id: string;
      bid_id: string;
      milestone_index: number;
      amount_usd: string | number;
      released_at: string;
    }>;
  };
  recent: Array<{
    created_at: string;
    actor_role: string;
    actor_wallet: string | null;
    bid_id?: string | number;
    changes: Record<string, any>;
  }>;
};
// ——— Lightweight rows for new tabs ———
type ProposalRow = {
  id: number;
  title?: string;
  status?: string;
  owner_wallet?: string | null;
  owner_email?: string | null;
  created_at?: string;
  updated_at?: string;
};

type BidRow = {
  id: number;
  proposal_id?: number;
  vendor_name?: string | null;
  status?: string;
  amount_usd?: number | string | null;
  amount?: number | string | null;
  created_at?: string;
  updated_at?: string;
};

// ——— Lightweight rows for Proofs tab ———
type ProofRow = {
  id: number;
  bid_id?: number | string | null;
  milestone_index?: number | null;
  vendor_name?: string | null;
  wallet_address?: string | null;
  title?: string | null;
  status?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// —— Small inline icon set (no deps) ——
const Icon = {
  Alert: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86a2 2 0 0 1 3.42 0l8.37 14.48A2 2 0 0 1 20.37 22H3.63a2 2 0 0 1-1.71-3.66L10.29 3.86Z"/></svg>
  ),
  Clock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>
  ),
  Lock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  ),
  Dollar: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><path d="M12 1v22"/><path d="M17 5.5C17 3.6 15.2 2 13 2H9.5a3.5 3.5 0 0 0 0 7H13a3.5 3.5 0 0 1 0 7H7"/></svg>
  ),
  Check: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="m20 6-11 11-5-5"/></svg>
  ),
  Ticket: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v2a2 2 0 0 0-2 2 2 2 0 0 0 2 2v2a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-2a2 2 0 0 0 2-2 2 2 0 0 0-2-2V9Z"/></svg>
  ),
  Refresh: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12a8 8 0 1 1-8-8 8 8 0 0 1 8 8Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6"/></svg>
  ),
  Proof: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><path d="M9 12h6M9 16h6M9 8h6"/><path d="M5 3h10l4 4v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>
  ),
  Download: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>
  ),
  Play: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7-11-7Z"/></svg>
  ),
  Stop: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
  ),
  Copy: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" aria-hidden="true" {...props}><rect x="9" y="9" width="13" height="13" rx="2"/><rect x="2" y="2" width="13" height="13" rx="2"/></svg>
  ),
};

// —— Helpers ——
const cls = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");
const fmtInt = (n: number) => new Intl.NumberFormat().format(Math.round(n ?? 0));
const fmtUSD0 = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n ?? 0));
const fmtUSDcompact = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(n ?? 0));
const fmtPct = (n: number) => `${Math.round(n ?? 0)}%`;
const shortAddr = (w: string) => (w?.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);
const dt = (s: string) => new Date(s);
const humanTime = (s: string) => dt(s).toLocaleString();
const changeLabel = (changes: Record<string, any>) => (Object.keys(changes)[0] || "").replaceAll("_", " ");
const copy = async (t: string, onDone?: () => void) => { try { await navigator.clipboard.writeText(t); onDone?.(); } catch { /* ignore */ } };

function normalizePending(p: any) {
  // allow number or object, accept many key names
  const count =
    (typeof p === "number" ? p : Number(p?.count)) || 0;

  const usd =
    Number(
      typeof p === "number"
        ? 0
        : p?.totalUSD ?? p?.usd ?? (p?.usdCents != null ? p.usdCents / 100 : 0)
    ) || 0;

  return { count, usd };
}

function normalizeProofs(rows: any[]): ProofRow[] {
  return (rows || []).map((r: any) => ({
    id: Number(r?.id ?? r?.proof_id ?? r?.proofId),
    bid_id: Number(r?.bid_id ?? r?.bidId ?? r?.bid?.id ?? r?.bidID ?? r?.bid) || r?.bid_id || r?.bidId || null,
    milestone_index: Number(r?.milestone_index ?? r?.milestoneIndex ?? r?.milestone) ?? null,
    vendor_name: r?.vendor_name ?? r?.vendorName ?? r?.vendor ?? r?.vendor_profile?.vendor_name ?? r?.vendor_profile?.name ?? null,
    wallet_address: r?.wallet_address ?? r?.walletAddress ?? r?.wallet ?? null,
    title: r?.title ?? r?.name ?? r?.proof_title ?? null,
    status: r?.status ?? r?.state ?? r?.proof_status ?? null,
    submitted_at: r?.submitted_at ?? r?.submittedAt ?? r?.created_at ?? r?.createdAt ?? null,
    created_at: r?.created_at ?? r?.createdAt ?? null,
    updated_at: r?.updated_at ?? r?.updatedAt ?? null,
  }));
}

// ——— Normalizers for backend shape drift ———
function normalizeProposals(rows: any[]): ProposalRow[] {
  return (rows || []).map((r: any) => ({
    id: Number(r?.id ?? r?.proposal_id ?? r?.proposalId),
    title: r?.title ?? r?.name ?? r?.project_title ?? r?.projectName ?? null,
    status: r?.status ?? r?.state ?? r?.proposal_status ?? null,
    owner_wallet: r?.owner_wallet ?? r?.ownerWallet ?? r?.wallet_address ?? r?.walletAddress ?? null,
    owner_email: r?.owner_email ?? r?.ownerEmail ?? r?.email ?? null,
    created_at: r?.created_at ?? r?.createdAt ?? r?.created ?? r?.inserted_at ?? null,
    updated_at: r?.updated_at ?? r?.updatedAt ?? r?.updated ?? r?.modified_at ?? null,
  }));
}

function normalizeBids(rows: any[]): BidRow[] {
  return (rows || []).map((r: any) => ({
    id: Number(r?.id ?? r?.bid_id ?? r?.bidId),
    proposal_id: Number(r?.proposal_id ?? r?.proposalId ?? r?.proposal?.id ?? r?.proposalID),
    vendor_name:
      r?.vendor_name ??
      r?.vendorName ??
      r?.vendor ??
      r?.vendor_name_text ??
      r?.vendor_profile?.vendor_name ??
      r?.vendor_profile?.name ??
      r?.vendor_profile?.vendor ??
      null,
    status: r?.status ?? r?.state ?? r?.bid_status ?? 'pending',
    amount_usd:
      r?.amount_usd ??
      r?.amountUsd ??
      r?.usd ??
      (r?.usdCents != null ? r.usdCents / 100 : r?.amount ?? null),
    created_at: r?.created_at ?? r?.createdAt ?? r?.created ?? r?.inserted_at ?? null,
    updated_at: r?.updated_at ?? r?.updatedAt ?? r?.updated ?? r?.modified_at ?? null,
  }));
}

// Convenience formatters used in the table cells
const getVendorName = (b: BidRow) => b.vendor_name ?? '—';
const getProposalId = (b: BidRow) =>
  (typeof b.proposal_id === 'number' && Number.isFinite(b.proposal_id)) ? `#${b.proposal_id}` : '—';

// —— Tiny primitives ——
function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${v}%` }} />
    </div>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral"|"danger"|"warning"|"success" }) {
  const t = {
    neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  }[tone];
  return <span className={cls("inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium", t)}>{children}</span>;
}

function Card({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; }) {
  return (
    <section className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur" aria-label={title}>
      <header className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function Th({ children, className, onClick, sorted, dir }: { children: React.ReactNode; className?: string; onClick?: () => void; sorted?: boolean; dir?: "asc"|"desc" }) {
  return (
    <th scope="col" aria-sort={sorted ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cls("px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 select-none", onClick ? "cursor-pointer" : "", className)}
      onClick={onClick}
    >
      <div className="flex items-center gap-1">{children}{sorted && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}</div>
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cls("px-4 py-3 align-top", className)}>{children}</td>;
}
function RowPlaceholder({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="p-6">
        <div className="space-y-2">
          <div className="animate-pulse h-4 w-full rounded bg-neutral-200 dark:bg-neutral-800"/>
          <div className="animate-pulse h-4 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800"/>
        </div>
      </td>
    </tr>
  );
}

function StatCard({ label, value, sub, tone = "neutral", icon }: { label: string; value: React.ReactNode; sub?: string; tone?: "neutral"|"danger"|"success"|"warning"; icon?: React.ReactNode; }) {
  const toneRing = {
    neutral: "ring-neutral-200 dark:ring-neutral-800",
    danger: "ring-rose-300/60 dark:ring-rose-500/40",
    success: "ring-emerald-300/60 dark:ring-emerald-500/40",
    warning: "ring-amber-300/60 dark:ring-amber-500/40",
  }[tone];
  const toneGlow = {
    neutral: "",
    danger: "shadow-[0_0_40px_-10px_rgba(244,63,94,0.35)]",
    success: "shadow-[0_0_40px_-10px_rgba(16,185,129,0.35)]",
    warning: "shadow-[0_0_40px_-10px_rgba(245,158,11,0.35)]",
  }[tone];
  return (
 <div className={cls("relative rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur p-4 ring-1", toneRing, toneGlow)}>
  <div className="flex items-center gap-3">
    {icon && <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 shrink-0">{icon}</div>}
    <div className="flex-1 min-w-0"> {/* ← allow shrink so truncate works */}
      <div className="text-sm text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-0.5 font-semibold leading-tight">
        <div className="text-xl sm:text-2xl whitespace-nowrap truncate tabular-nums">{value}</div>
      </div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  </div>
</div>
  );
}

function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: React.ReactNode; count?: number }[]; active: string; onChange: (k: string) => void; }) {
  return (
    <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar" aria-label="Admin sections">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={cls(
            "whitespace-nowrap inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700",
            active === t.key
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900/10 dark:border-white/10"
              : "bg-white/70 dark:bg-neutral-900/50 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          )}>
          <span>{t.label}</span>
          {typeof t.count === "number" && (
            <span className={cls("text-xs px-1.5 py-0.5 rounded", active === t.key ? "bg-black/20 dark:bg-white/20" : "bg-neutral-100 dark:bg-neutral-800")}>{t.count}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; } catch { return initial; }
  });
  useEffect(() => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue] as const;
}

function useInterval(callback: () => void, delay: number | null) {
  const savedRef = useRef(callback);
  useEffect(() => { savedRef.current = callback; }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function Spinner() {
  return (
    <div role="status" aria-live="polite" className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-500" />
  );
}

export default function AdminOversightPage() {
  const [data, setData] = useState<Oversight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = usePersistentState<string>("oversight.tab", "overview");
  const [query, setQuery] = usePersistentState<string>("oversight.query", "");
  const [autoRefresh, setAutoRefresh] = usePersistentState<boolean>("oversight.autoRefresh", true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ——— Proofs state & sorting ———
const [proofs, setProofs] = useState<ProofRow[] | null>(null);
const [proofsLoading, setProofsLoading] = useState(false);
const [proofsError, setProofsError] = useState<string | null>(null);
const [proofSort, setProofSort] = usePersistentState<{ key: keyof ProofRow; dir: "asc"|"desc" }>(
  "oversight.proofs.sort",
  { key: "submitted_at", dir: "desc" }
);

  // ——— Proposals & Bids state ———
const [proposals, setProposals] = useState<ProposalRow[] | null>(null);
const [bids, setBids] = useState<BidRow[] | null>(null);
const [pbLoading, setPbLoading] = useState(false);
const [pbError, setPbError] = useState<string | null>(null);

// Sorting prefs for new tabs
const [proposalSort, setProposalSort] = usePersistentState<{ key: keyof ProposalRow; dir: "asc"|"desc" }>(
  "oversight.proposals.sort",
  { key: "created_at", dir: "desc" }
);
const [bidSort, setBidSort] = usePersistentState<{ key: keyof BidRow; dir: "asc"|"desc" }>(
  "oversight.bids.sort",
  { key: "created_at", dir: "desc" }
);

// Numeric parser tolerant to "$1,234.56"
const toNumber = (v: unknown) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.replace(/[^0-9.-]/g, "")) || 0;
  return 0;
};

  // sorting
  const [queueSort, setQueueSort] = usePersistentState<{ key: keyof Oversight["queue"][number]; dir: "asc"|"desc" }>("oversight.queue.sort", { key: "ageHours", dir: "desc" });
  const [vendorSort, setVendorSort] = usePersistentState<{ key: keyof Oversight["vendors"][number]; dir: "asc"|"desc" }>("oversight.vendors.sort", { key: "approvalPct", dir: "desc" });

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  const PATH = API_BASE ? "/admin/oversight" : "/api/admin/oversight";
  const baseUrl = `${API_BASE}${PATH}`;

  // Always use same-origin proxy so we never hit CORS
const api = (p: string) => (API_BASE ? `${API_BASE}${p}` : `/api${p}`);

  async function load(signal?: AbortSignal) {
  try {
    setError(null);
    setLoading(true);

    // cache-buster so we ALWAYS get fresh data
    const res = await fetch(`${baseUrl}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal,
    });

    if (!res.ok) {
      // try to surface server error text if available
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.text();
        if (err) msg += ` — ${err.slice(0, 300)}`;
      } catch {}
      throw new Error(msg);
    }

    const json = (await res.json()) as Oversight;
    setData(json);
    setLastUpdated(Date.now());
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    setError(e?.message || "Failed to load");
  } finally {
    setLoading(false);
  }
}

  // initial load + abort on unmount
  useEffect(() => {
    const ctr = new AbortController();
    load(ctr.signal);
    return () => ctr.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefetch lists so tab counts are correct without clicking any tab
// Prefetch lists so tab counts are correct without clicking any tab
useEffect(() => {
  if (!data) return; // wait for /admin/oversight to load once
  let aborted = false;

  (async () => {
    try {
      // Proposals
      if (proposals == null) {
        const pRes = await fetch(`${api("/proposals")}?t=${Date.now()}`, {
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!aborted && pRes.ok) {
          const pj = await pRes.json();
          setProposals(normalizeProposals(pj?.proposals ?? pj ?? []));
        }
      }

      // Bids
      if (bids == null) {
  const bj = await getBidsOnce();
  if (!aborted) {
    setBids(normalizeBids(bj));
  }
}
      // (intentionally NO direct /proofs prefetch — backend rejects it without bidId)
    } catch { /* ignore network errors here */ }
  })();

  return () => { aborted = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [!!data]); // run once after first /admin/oversight load

  // auto refresh
  useInterval(() => { if (!document.hidden) load(); }, autoRefresh ? 30000 : null);

  // keyboard shortcuts: "/" focus search, "r" refresh, "[" prev tab, "]" next tab
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      if (e.key.toLowerCase() === "r" && (e.ctrlKey || e.metaKey || !e.shiftKey)) { e.preventDefault(); load(); }
      if (e.key === "[") { e.preventDefault(); stepTab(-1); }
      if (e.key === "]") { e.preventDefault(); stepTab(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

 // ——— Lazy load Proofs on demand ———
// ——— Lazy load Proofs on demand ———
useEffect(() => {
  if (tab !== "proofs" || proofs !== null) return;

  let aborted = false;
  (async () => {
    try {
      setProofsError(null);
      setProofsLoading(true);

      // Always aggregate per-bid; do NOT call /proofs without bidId
      let list: any[] = [];

      // ensure we have bids
 let bidList = bids;
if (!bidList) {
  const bj = await getBidsOnce();
  bidList = normalizeBids(bj);
  setBids(bidList);
}
      const ids = (bidList || []).map(b => b.id).filter(Boolean);
      const results: any[] = [];

      // modest concurrency to avoid hammering the API
      const CONCURRENCY = 6;
      let idx = 0;
      async function runBatch() {
        const batch = ids.slice(idx, idx + CONCURRENCY);
        idx += CONCURRENCY;
        const reqs = batch.map(id =>
          fetch(`${api("/proofs")}?bidId=${id}&t=${Date.now()}`, {
            cache: "no-store",
            credentials: "include",
            headers: { Accept: "application/json" },
          })
            .then(r => r.ok ? r.json() : null)
            .then(j => (Array.isArray(j) ? j : (j?.proofs ?? [])))
            .catch(() => [])
        );
        const chunks = await Promise.all(reqs);
        chunks.forEach(arr => { if (Array.isArray(arr)) results.push(...arr); });
        if (idx < ids.length) await runBatch();
      }

      if (ids.length) {
        await runBatch();
        list = results;
      }

      if (!aborted) setProofs(normalizeProofs(list));
    } catch (e: any) {
      if (!aborted) setProofsError(e?.message || "Failed to load proofs");
    } finally {
      if (!aborted) setProofsLoading(false);
    }
  })();

  return () => { aborted = true; };
}, [tab, proofs, bids]);
  
 // ——— Lazy fetch for proposals/bids when tabs opened ———
useEffect(() => {
  const needProposals = tab === "proposals" && proposals == null;
  const needBids = tab === "bids" && bids == null;
  if (!needProposals && !needBids) return;

  let aborted = false;
  (async () => {
    try {
      setPbError(null);
      setPbLoading(true);

      const [pRes, bj] = await Promise.all([
        needProposals
          ? fetch(`${api("/proposals")}?t=${Date.now()}`, {
              cache: "no-store",
              credentials: "include",
            })
          : null,
        needBids ? getBidsOnce() : null,
      ]);

      if (!aborted && pRes) {
        const pj = await pRes.json();
        setProposals(normalizeProposals(pj?.proposals ?? pj ?? []));
      }

      if (!aborted && bj) {
        setBids(normalizeBids(bj));
      }
    } catch (e: any) {
      if (!aborted) setPbError(e?.message || "Failed to load proposals/bids");
    } finally {
      if (!aborted) setPbLoading(false);
    }
  })();

  return () => { aborted = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab]);

const tabs = useMemo(() => [
  { key: "overview", label: "Overview" },
  { key: "queue", label: "Queue", count: data?.queue?.length ?? 0 },
  { key: "vendors", label: "Vendors", count: data?.vendors?.length ?? 0 },
  { key: "proposals", label: "Proposals", count: proposals?.length ?? 0 },
  { key: "bids", label: "Bids", count: bids?.length ?? 0 },              // ← added
  { key: "proofs", label: "Proofs", count: proofs?.length ?? 0 },
  { key: "alerts", label: "Alerts", count: data?.alerts?.length ?? 0 },
  { key: "payouts", label: "Payouts", count: data?.payouts?.recent?.length ?? 0 },
  { key: "activity", label: "Activity", count: data?.recent?.length ?? 0 },
], [data, proposals, bids, proofs]); // ← ensure bids & proposals in deps

  function stepTab(delta: number) {
    const idx = tabs.findIndex(t => t.key === tab);
    const next = tabs[(idx + delta + tabs.length) % tabs.length]?.key || "overview";
    setTab(next);
  }

  // — simple client-side filters —
  const filteredAlerts = useMemo(() => {
    if (!query) return data?.alerts || [];
    const q = query.toLowerCase();
    return (data?.alerts || []).filter(a => (
      a.type.toLowerCase().includes(q) ||
      String(a.bidId ?? "").toLowerCase().includes(q) ||
      JSON.stringify(a.details || {}).toLowerCase().includes(q)
    ));
  }, [query, data]);

  const filteredActivity = useMemo(() => {
    if (!query) return data?.recent || [];
    const q = query.toLowerCase();
    return (data?.recent || []).filter(r => (
      r.actor_role.toLowerCase().includes(q) ||
      String(r.bid_id ?? "").toLowerCase().includes(q) ||
      JSON.stringify(r.changes || {}).toLowerCase().includes(q)
    ));
  }, [query, data]);

  const filteredQueue = useMemo(() => {
    const list = data?.queue || [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(x => (
      String(x.id).includes(q) || x.vendor.toLowerCase().includes(q) || x.project.toLowerCase().includes(q) || String(x.actions?.bidId ?? "").includes(q)
    ));
  }, [query, data]);

  const filteredVendors = useMemo(() => {
    const list = data?.vendors || [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(v => (
      v.vendor.toLowerCase().includes(q) || v.wallet.toLowerCase().includes(q)
    ));
  }, [query, data]);

  // sorting
  const sortedQueue = useMemo(() => {
    const arr = [...filteredQueue];
    return arr.sort((a, b) => {
      const k = queueSort.key as any;
      const av = (a as any)[k]; const bv = (b as any)[k];
      const cmp = typeof av === "string" ? av.localeCompare(bv) : (av as number) - (bv as number);
      return queueSort.dir === "asc" ? cmp : -cmp;
    });
  }, [filteredQueue, queueSort]);

  const sortedVendors = useMemo(() => {
    const arr = [...filteredVendors];
    return arr.sort((a, b) => {
      const k = vendorSort.key as any;
      const av = (a as any)[k]; const bv = (b as any)[k];
      const cmp = typeof av === "string" ? av.localeCompare(bv) : (av as number) - (bv as number);
      return vendorSort.dir === "asc" ? cmp : -cmp;
    });
  }, [filteredVendors, vendorSort]);

  // ——— PROPOSALS ———
const filteredProposals = useMemo(() => {
  const list = proposals ?? [];
  if (!query) return list;
  const q = query.toLowerCase();
  return list.filter(p =>
    String(p.id).includes(q) ||
    (p.title ?? "").toLowerCase().includes(q) ||
    (p.status ?? "").toLowerCase().includes(q) ||
    (p.owner_wallet ?? "").toLowerCase().includes(q) ||
    (p.owner_email ?? "").toLowerCase().includes(q)
  );
}, [proposals, query]);

const sortedProposals = useMemo(() => {
  const arr = [...filteredProposals];
  const k = proposalSort.key as keyof ProposalRow;
  return arr.sort((a, b) => {
    const av = (a as any)[k];
    const bv = (b as any)[k];
    const cmp =
      k === "created_at" || k === "updated_at" || typeof av === "string"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : (toNumber(av) - toNumber(bv));
    return proposalSort.dir === "asc" ? cmp : -cmp;
  });
}, [filteredProposals, proposalSort]);

// ——— BIDS ———
const filteredBids = useMemo(() => {
  const list = bids ?? [];
  if (!query) return list;
  const q = query.toLowerCase();
  return list.filter(b =>
    String(b.id).includes(q) ||
    String(b.proposal_id ?? "").includes(q) ||
    (b.vendor_name ?? "").toLowerCase().includes(q) ||
    (b.status ?? "").toLowerCase().includes(q)
  );
}, [bids, query]);

const sortedBids = useMemo(() => {
  const arr = [...filteredBids];
  const k = bidSort.key as keyof BidRow;
  return arr.sort((a, b) => {
    const av = (a as any)[k];
    const bv = (b as any)[k];
    const cmp =
      k === "amount" || k === "amount_usd"
        ? (toNumber(av) - toNumber(bv))
        : (typeof av === "string"
            ? String(av ?? "").localeCompare(String(bv ?? ""))
            : (toNumber(av) - toNumber(bv)));
    return bidSort.dir === "asc" ? cmp : -cmp;
  });
}, [filteredBids, bidSort]);

// ——— PROOFS ———
const filteredProofs = useMemo(() => {
  const list = proofs ?? [];
  if (!query) return list;
  const q = query.toLowerCase();
  return list.filter(p =>
    String(p.id).includes(q) ||
    String(p.bid_id ?? "").toLowerCase().includes(q) ||
    String(p.milestone_index ?? "").toLowerCase().includes(q) ||
    (p.vendor_name ?? "").toLowerCase().includes(q) ||
    (p.title ?? "").toLowerCase().includes(q) ||
    (p.status ?? "").toLowerCase().includes(q)
  );
}, [proofs, query]);

const sortedProofs = useMemo(() => {
  const arr = [...filteredProofs];
  const k = proofSort.key as keyof ProofRow;
  return arr.sort((a, b) => {
    const av: any = (a as any)[k];
    const bv: any = (b as any)[k];
    const cmp = (typeof av === "string" ? (av || "").localeCompare(bv || "") : (Number(av) - Number(bv)));
    return proofSort.dir === "asc" ? cmp : -cmp;
  });
}, [filteredProofs, proofSort]);

  const tiles = data?.tiles;
  const pending = useMemo(() => {
  // normalize the summary shape first
  const fromTiles = normalizePending(tiles?.pendingPayouts);
  if (fromTiles.count || fromTiles.usd) return fromTiles;

  // fallback: compute from the pending payouts list
  const list = data?.payouts?.pending || [];
  const count = Array.isArray(list) ? list.length : 0;
  const usd = (Array.isArray(list) ? list : []).reduce((sum, p: any) => {
    const v =
  p?.amount_usd ??
  p?.amountUsd ??
  p?.usd ??
  ((p?.usdCents != null) ? p.usdCents / 100 : 0);
    const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : Number(v);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  return { count, usd };
}, [tiles?.pendingPayouts, data?.payouts?.pending]);

  function toggleSort<T extends { key: any; dir: "asc"|"desc" }>(state: T, set: (v: T) => void, key: any) {
    if (state.key === key) set({ ...state, dir: state.dir === "asc" ? "desc" : "asc" });
    else set({ ...state, key, dir: "desc" });
  }

  function downloadCSV(filename: string, rows: any[], headers?: (keyof any)[]) {
    if (!rows?.length) return;
    const cols = headers || Object.keys(rows[0]);
    const csv = [
      cols.join(","),
      ...rows.map((r) => cols.map((c: any) => {
        const v = r[c];
        const s = v == null ? "" : String(v).replaceAll('"', '""');
        return s.includes(",") || s.includes("\n") ? `"${s}"` : s;
      }).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const lastUpdatedLabel = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "—";

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
      {/* Top bar */}
      <div className="sticky top-0 z-20 backdrop-blur bg-white/70 dark:bg-neutral-900/60 border-b border-neutral-200/60 dark:border-neutral-800">
        <div className="mx-auto max-w-[1400px] px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 grid place-items-center font-bold" aria-hidden>LX</div>
            <div>
              <div className="text-lg font-semibold">Admin Oversight</div>
              <div className="text-xs text-neutral-500">Ops cockpit • proofs, payouts, risk</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search (/, alerts/activity/queue/vendors)…"
              className="hidden md:block text-sm rounded-xl bg-white/70 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700"
              aria-label="Search" />
            <button onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm" aria-label="Refresh">
              {loading ? <Spinner/> : <Icon.Refresh className="h-4 w-4" />} Refresh
            </button>
            <button onClick={() => setAutoRefresh(!autoRefresh)} className={cls("inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm", autoRefresh ? "border-emerald-400/70 bg-emerald-50/60 dark:bg-emerald-900/20" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800")} aria-pressed={autoRefresh} aria-label="Toggle auto refresh">
              {autoRefresh ? <Icon.Stop className="h-4 w-4"/> : <Icon.Play className="h-4 w-4"/>}
              {autoRefresh ? "Auto" : "Manual"}
            </button>
            <div className="hidden md:block text-xs text-neutral-500">Updated {lastUpdatedLabel}</div>
          </div>
        </div>
      </div>

      {/* Tabs header */}
      <div className="mx-auto max-w-[1400px] px-5 pt-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* Content */}
      <div className="relative mx-auto max-w-[1400px] px-5 py-6 space-y-8">
        {loading && (
          <div className="absolute inset-0 pointer-events-none flex items-start justify-center pt-24">
            <div className="rounded-xl bg-white/70 dark:bg-neutral-900/60 backdrop-blur border border-neutral-200/70 dark:border-neutral-800 px-4 py-3 text-sm flex items-center gap-2">
              <Spinner/> Loading…
            </div>
          </div>
        )}

        {tab === "overview" && (
          <>
            {/* STAT TILES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
              <StatCard label="Open Proofs" value={loading?"—":fmtInt(tiles?.openProofs||0)} icon={<Icon.Proof className="h-5 w-5"/>} />
              <StatCard label="Breaching SLA" value={loading?"—":fmtInt(tiles?.breachingSla||0)} tone={(tiles?.breachingSla||0) > 0 ? "warning" : "neutral"} icon={<Icon.Clock className="h-5 w-5"/>} />
              <StatCard label="Pending Payouts" value={loading ? "—" : fmtInt(pending.count)} icon={<Icon.Ticket className="h-5 w-5"/>} />
              <StatCard label="Pending USD" value={<span title={fmtUSD0(pending.usd)} className="block whitespace-nowrap">{fmtUSDcompact(pending.usd)}</span>} icon={<Icon.Dollar className="h-5 w-5" />} />
              <StatCard label="Escrows Locked" value={loading?"—":fmtInt(tiles?.escrowsLocked||0)} icon={<Icon.Lock className="h-5 w-5"/>} />
              <StatCard label="P50 Cycle (h)" value={loading?"—":fmtInt(tiles?.p50CycleHours||0)} icon={<Icon.Clock className="h-5 w-5"/>} />
              <StatCard label="Revision Rate" value={loading?"—":fmtPct(tiles?.revisionRatePct||0)} icon={<Icon.Check className="h-5 w-5"/>} />
            </div>

            {/* Overview split: Queue & Vendors quick views */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-3">
              <Card title={`Queue (${data?.queue?.length ?? 0})`} subtitle="Oldest first">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                      <tr>
                        <Th onClick={() => toggleSort(queueSort, setQueueSort, "id")} sorted={queueSort.key === "id"} dir={queueSort.dir}>ID</Th>
                        <Th onClick={() => toggleSort(queueSort, setQueueSort, "vendor")} sorted={queueSort.key === "vendor"} dir={queueSort.dir}>Vendor</Th>
                        <Th onClick={() => toggleSort(queueSort, setQueueSort, "project")} sorted={queueSort.key === "project"} dir={queueSort.dir}>Project</Th>
                        <Th onClick={() => toggleSort(queueSort, setQueueSort, "milestone")} sorted={queueSort.key === "milestone"} dir={queueSort.dir}>Milestone</Th>
                        <Th className="text-right" onClick={() => toggleSort(queueSort, setQueueSort, "ageHours")} sorted={queueSort.key === "ageHours"} dir={queueSort.dir}>Age (h)</Th>
                        <Th>Status</Th><Th>Risk</Th><Th>Bid</Th><Th>Proposal</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && <RowPlaceholder cols={9} />}
                      {!loading && (sortedQueue?.length ?? 0) === 0 && (
                        <tr><td className="p-6 text-center text-neutral-500" colSpan={9}>Nothing in the queue</td></tr>
                      )}
                      {sortedQueue?.slice(0, 8).map((q) => (
                        <tr key={q.id} className={cls("border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40", q.risk === "sla" && "outline outline-1 -outline-offset-0 outline-rose-300/40")}> 
                          <Td>{q.id}</Td>
                          <Td className="max-w-[220px] truncate" title={q.vendor}>{q.vendor}</Td>
                          <Td>{q.project}</Td>
                          <Td>{q.milestone}</Td>
                          <Td className="text-right tabular-nums">{q.ageHours.toFixed(1)}</Td>
                          <Td><Badge tone={q.status === "pending" ? "warning" : "neutral"}>{q.status}</Badge></Td>
                          <Td><Badge tone={q.risk === "sla" ? "danger" : q.risk ? "warning" : "neutral"}>{q.risk || "—"}</Badge></Td>
                          <Td>
                            {q.actions?.bidId ? (
                              <button onClick={() => copy(String(q.actions!.bidId), () => setToast("Bid ID copied"))} className="inline-flex items-center gap-1 text-xs underline decoration-dotted hover:opacity-80">
                                {q.actions.bidId} <Icon.Copy className="h-3.5 w-3.5"/>
                              </button>
                            ) : "—"}
                          </Td>
                          <Td>{q.actions?.proposalId ?? "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              </div>

              <div className="xl:col-span-3">
                <Card title={`Vendors (${data?.vendors?.length ?? 0})`} subtitle="Performance" right={
                  <button onClick={() => downloadCSV(`vendors-${new Date().toISOString().slice(0,10)}.csv`, sortedVendors)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <Icon.Download className="h-4 w-4"/> CSV
                  </button>
                }>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                        <tr>
                          <Th onClick={() => toggleSort(vendorSort, setVendorSort, "vendor")} sorted={vendorSort.key === "vendor"} dir={vendorSort.dir}>Vendor</Th>
                          <Th>Wallet</Th>
                          <Th onClick={() => toggleSort(vendorSort, setVendorSort, "proofs")} sorted={vendorSort.key === "proofs"} dir={vendorSort.dir}>Proofs (A/T)</Th>
                          <Th onClick={() => toggleSort(vendorSort, setVendorSort, "cr")} sorted={vendorSort.key === "cr"} dir={vendorSort.dir}>CR</Th>
                          <Th onClick={() => toggleSort(vendorSort, setVendorSort, "approvalPct")} sorted={vendorSort.key === "approvalPct"} dir={vendorSort.dir}>Approval %</Th>
                          <Th onClick={() => toggleSort(vendorSort, setVendorSort, "bids")} sorted={vendorSort.key === "bids"} dir={vendorSort.dir}>Bids</Th>
                          <Th onClick={() => toggleSort(vendorSort, setVendorSort, "lastActivity")} sorted={vendorSort.key === "lastActivity"} dir={vendorSort.dir}>Last Activity</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading && <RowPlaceholder cols={7} />}
                        {!loading && sortedVendors.length === 0 && (
                          <tr><td className="p-6 text-center text-neutral-500" colSpan={7}>No vendors yet</td></tr>
                        )}
                        {sortedVendors.slice(0, 8).map((v) => (
                          <tr key={v.wallet} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                            <Td className="max-w-[220px] truncate" title={v.vendor}>{v.vendor}</Td>
                            <Td title={v.wallet}>
                              <button onClick={() => copy(v.wallet, () => setToast("Wallet copied"))} className="inline-flex items-center gap-1 font-mono text-xs underline decoration-dotted hover:opacity-80">
                                {shortAddr(v.wallet)} <Icon.Copy className="h-3.5 w-3.5"/>
                              </button>
                            </Td>
                            <Td>{v.approved}/{v.proofs}</Td>
                            <Td>{v.cr}</Td>
                            <Td className="min-w-[120px]"><div className="flex items-center gap-2"><Progress value={v.approvalPct} /><span className="w-10 text-right tabular-nums">{fmtPct(v.approvalPct)}</span></div></Td>
                            <Td>{v.bids}</Td>
                            <Td>{humanTime(v.lastActivity)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}

        {tab === "queue" && (
          <Card title={`Queue (${sortedQueue.length})`} subtitle="Oldest first" right={<>
            <input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter queue…" className="text-sm rounded-xl bg-white/70 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-700 px-3 py-2 mr-2"/>
          </>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                  <tr>
                    <Th onClick={() => toggleSort(queueSort, setQueueSort, "id")} sorted={queueSort.key === "id"} dir={queueSort.dir}>ID</Th>
                    <Th onClick={() => toggleSort(queueSort, setQueueSort, "vendor")} sorted={queueSort.key === "vendor"} dir={queueSort.dir}>Vendor</Th>
                    <Th onClick={() => toggleSort(queueSort, setQueueSort, "project")} sorted={queueSort.key === "project"} dir={queueSort.dir}>Project</Th>
                    <Th onClick={() => toggleSort(queueSort, setQueueSort, "milestone")} sorted={queueSort.key === "milestone"} dir={queueSort.dir}>Milestone</Th>
                    <Th className="text-right" onClick={() => toggleSort(queueSort, setQueueSort, "ageHours")} sorted={queueSort.key === "ageHours"} dir={queueSort.dir}>Age (h)</Th>
                    <Th>Status</Th><Th>Risk</Th><Th>Bid</Th><Th>Proposal</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <RowPlaceholder cols={9} />}
                  {!loading && sortedQueue.length === 0 && (
                    <tr><td className="p-6 text-center text-neutral-500" colSpan={9}>Nothing in the queue</td></tr>
                  )}
                  {sortedQueue.map((q) => (
                    <tr key={q.id} className={cls("border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40", q.risk === "sla" && "outline outline-1 -outline-offset-0 outline-rose-300/40")}>
                      <Td>{q.id}</Td>
                      <Td className="max-w-[260px] truncate" title={q.vendor}>{q.vendor}</Td>
                      <Td>{q.project}</Td>
                      <Td>{q.milestone}</Td>
                      <Td className="text-right tabular-nums">{q.ageHours.toFixed(1)}</Td>
                      <Td><Badge tone={q.status === "pending" ? "warning" : "neutral"}>{q.status}</Badge></Td>
                      <Td><Badge tone={q.risk === "sla" ? "danger" : q.risk ? "warning" : "neutral"}>{q.risk || "—"}</Badge></Td>
                      <Td>{q.actions?.bidId ?? "—"}</Td>
                      <Td>{q.actions?.proposalId ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "vendors" && (
          <Card title={`Vendors (${sortedVendors.length})`} subtitle="Performance" right={<>
            <input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter vendors…" className="text-sm rounded-xl bg-white/70 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-700 px-3 py-2 mr-2"/>
            <button onClick={() => downloadCSV(`vendors-${new Date().toISOString().slice(0,10)}.csv`, sortedVendors)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"><Icon.Download className="h-4 w-4"/> CSV</button>
          </>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                  <tr>
                    <Th onClick={() => toggleSort(vendorSort, setVendorSort, "vendor")} sorted={vendorSort.key === "vendor"} dir={vendorSort.dir}>Vendor</Th>
                    <Th>Wallet</Th>
                    <Th onClick={() => toggleSort(vendorSort, setVendorSort, "proofs")} sorted={vendorSort.key === "proofs"} dir={vendorSort.dir}>Proofs (A/T)</Th>
                    <Th onClick={() => toggleSort(vendorSort, setVendorSort, "cr")} sorted={vendorSort.key === "cr"} dir={vendorSort.dir}>CR</Th>
                    <Th onClick={() => toggleSort(vendorSort, setVendorSort, "approvalPct")} sorted={vendorSort.key === "approvalPct"} dir={vendorSort.dir}>Approval %</Th>
                    <Th onClick={() => toggleSort(vendorSort, setVendorSort, "bids")} sorted={vendorSort.key === "bids"} dir={vendorSort.dir}>Bids</Th>
                    <Th onClick={() => toggleSort(vendorSort, setVendorSort, "lastActivity")} sorted={vendorSort.key === "lastActivity"} dir={vendorSort.dir}>Last Activity</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <RowPlaceholder cols={7} />}
                  {!loading && sortedVendors.length === 0 && (
                    <tr><td className="p-6 text-center text-neutral-500" colSpan={7}>No vendors yet</td></tr>
                  )}
                  {sortedVendors.map((v) => (
                    <tr key={v.wallet} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                      <Td className="max-w-[260px] truncate" title={v.vendor}>{v.vendor}</Td>
                      <Td title={v.wallet}><button onClick={() => copy(v.wallet, () => setToast("Wallet copied"))} className="inline-flex items-center gap-1 font-mono text-xs underline decoration-dotted hover:opacity-80">{shortAddr(v.wallet)} <Icon.Copy className="h-3.5 w-3.5"/></button></Td>
                      <Td>{v.approved}/{v.proofs}</Td>
                      <Td>{v.cr}</Td>
                      <Td className="min-w-[140px]"><div className="flex items-center gap-2"><Progress value={v.approvalPct} /><span className="w-10 text-right tabular-nums">{fmtPct(v.approvalPct)}</span></div></Td>
                      <Td>{v.bids}</Td>
                      <Td>{humanTime(v.lastActivity)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "proposals" && (
  <Card
    title={`Proposals (${proposals?.length ?? 0})`}
    subtitle="Newest first (click headers to sort)"
    right={
      <>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter proposals…"
          className="text-sm rounded-xl bg-white/70 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-700 px-3 py-2 mr-2"
        />
        <button
          onClick={() => sortedProposals && downloadCSV(`proposals-${new Date().toISOString().slice(0,10)}.csv`, sortedProposals)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
        >
          <Icon.Download className="h-4 w-4" /> CSV
        </button>
      </>
    }
  >
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
          <tr>
            <Th onClick={() => toggleSort(proposalSort, setProposalSort, "id")} sorted={proposalSort.key==="id"} dir={proposalSort.dir}>ID</Th>
            <Th onClick={() => toggleSort(proposalSort, setProposalSort, "title")} sorted={proposalSort.key==="title"} dir={proposalSort.dir}>Title</Th>
            <Th onClick={() => toggleSort(proposalSort, setProposalSort, "status")} sorted={proposalSort.key==="status"} dir={proposalSort.dir}>Status</Th>
            <Th>Owner</Th>
            <Th onClick={() => toggleSort(proposalSort, setProposalSort, "created_at")} sorted={proposalSort.key==="created_at"} dir={proposalSort.dir}>Created</Th>
          </tr>
        </thead>
        <tbody>
          {(loading || pbLoading) && <RowPlaceholder cols={5} />}
          {pbError && (
            <tr><td colSpan={5} className="p-4 text-rose-600">{pbError}</td></tr>
          )}
          {!pbLoading && (sortedProposals.length === 0) && (
            <tr><td colSpan={5} className="p-6 text-center text-neutral-500">No proposals</td></tr>
          )}
          {sortedProposals.map(p => (
            <tr key={p.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
              <Td>#{p.id}</Td>
              <Td className="max-w-[360px] truncate" title={p.title || ""}>{p.title ?? "—"}</Td>
              <Td><Badge tone={p.status === "approved" ? "success" : p.status === "pending" ? "warning" : "neutral"}>{p.status ?? "—"}</Badge></Td>
              <Td className="font-mono text-xs">{shortAddr(p.owner_wallet ?? "") || (p.owner_email ?? "—")}</Td>
              <Td>{p.created_at ? humanTime(p.created_at) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
)}

{tab === "bids" && (
  <Card
    title={`Bids (${bids?.length ?? 0})`}
    subtitle="Newest first (click headers to sort)"
    right={
      <>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter bids…"
          className="text-sm rounded-xl bg-white/70 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-700 px-3 py-2 mr-2"
        />
        <button
          onClick={() => sortedBids && downloadCSV(`bids-${new Date().toISOString().slice(0,10)}.csv`, sortedBids)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
        >
          <Icon.Download className="h-4 w-4" /> CSV
        </button>
      </>
    }
  >
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
          <tr>
            <Th onClick={() => toggleSort(bidSort, setBidSort, "id")} sorted={bidSort.key==="id"} dir={bidSort.dir}>ID</Th>
            <Th onClick={() => toggleSort(bidSort, setBidSort, "proposal_id")} sorted={bidSort.key==="proposal_id"} dir={bidSort.dir}>Proposal</Th>
            <Th onClick={() => toggleSort(bidSort, setBidSort, "vendor_name")} sorted={bidSort.key==="vendor_name"} dir={bidSort.dir}>Vendor</Th>
            <Th onClick={() => toggleSort(bidSort, setBidSort, "status")} sorted={bidSort.key==="status"} dir={bidSort.dir}>Status</Th>
            <Th onClick={() => toggleSort(bidSort, setBidSort, "amount_usd")} sorted={bidSort.key==="amount_usd"} dir={bidSort.dir}>USD</Th>
            <Th onClick={() => toggleSort(bidSort, setBidSort, "created_at")} sorted={bidSort.key==="created_at"} dir={bidSort.dir}>Created</Th>
          </tr>
        </thead>
        <tbody>
          {(loading || pbLoading) && <RowPlaceholder cols={6} />}
          {pbError && (
            <tr><td colSpan={6} className="p-4 text-rose-600">{pbError}</td></tr>
          )}
          {!pbLoading && (sortedBids.length === 0) && (
            <tr><td colSpan={6} className="p-6 text-center text-neutral-500">No bids</td></tr>
          )}
          {sortedBids.map(b => {
            const amt = toNumber(b.amount_usd ?? b.amount);
            return (
              <tr key={b.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                <Td>#{b.id}</Td>
                <Td>#{b.proposal_id ?? "—"}</Td>
                <Td className="max-w-[260px] truncate" title={getVendorName(b)}>{getVendorName(b)}</Td>
                <Td><Badge tone={b.status === "approved" ? "success" : b.status === "pending" ? "warning" : "neutral"}>{b.status ?? "—"}</Badge></Td>
                <Td className="tabular-nums">{fmtUSD0(amt)}</Td>
                <Td>{b.created_at ? humanTime(b.created_at) : "—"}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </Card>
)}

{tab === "proofs" && (
  <Card
    title={`Proofs (${sortedProofs.length})`}
    subtitle="Newest first (click headers to sort)"
    right={
      <>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter proofs…"
          className="text-sm rounded-xl bg-white/70 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-700 px-3 py-2 mr-2"
        />
        <button
          onClick={() => sortedProofs && downloadCSV(`proofs-${new Date().toISOString().slice(0,10)}.csv`, sortedProofs)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
        >
          <Icon.Download className="h-4 w-4" /> CSV
        </button>
      </>
    }
  >
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
          <tr>
            <Th onClick={() => toggleSort(proofSort, setProofSort, "id")} sorted={proofSort.key==="id"} dir={proofSort.dir}>ID</Th>
            <Th onClick={() => toggleSort(proofSort, setProofSort, "bid_id")} sorted={proofSort.key==="bid_id"} dir={proofSort.dir}>Bid</Th>
            <Th onClick={() => toggleSort(proofSort, setProofSort, "milestone_index")} sorted={proofSort.key==="milestone_index"} dir={proofSort.dir}>Milestone</Th>
            <Th onClick={() => toggleSort(proofSort, setProofSort, "vendor_name")} sorted={proofSort.key==="vendor_name"} dir={proofSort.dir}>Vendor</Th>
            <Th onClick={() => toggleSort(proofSort, setProofSort, "status")} sorted={proofSort.key==="status"} dir={proofSort.dir}>Status</Th>
            <Th onClick={() => toggleSort(proofSort, setProofSort, "submitted_at")} sorted={proofSort.key==="submitted_at"} dir={proofSort.dir}>Submitted</Th>
            <Th>Title</Th>
          </tr>
        </thead>
        <tbody>
          {(loading || proofsLoading) && <RowPlaceholder cols={7} />}
          {proofsError && (
            <tr><td colSpan={7} className="p-4 text-rose-600">{proofsError}</td></tr>
          )}
          {!proofsLoading && sortedProofs.length === 0 && (
            <tr><td className="p-6 text-center text-neutral-500" colSpan={7}>No proofs</td></tr>
          )}
          {sortedProofs.map((p) => (
            <tr key={p.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
              <Td>#{p.id}</Td>
              <Td>{p.bid_id ?? "—"}</Td>
              <Td>{p.milestone_index ?? "—"}</Td>
              <Td className="max-w-[240px] truncate" title={p.vendor_name || ""}>{p.vendor_name ?? "—"}</Td>
              <Td><Badge tone={p.status==="approved" ? "success" : p.status==="pending" ? "warning" : "neutral"}>{p.status ?? "—"}</Badge></Td>
              <Td>{p.submitted_at ? humanTime(p.submitted_at) : (p.created_at ? humanTime(p.created_at) : "—")}</Td>
              <Td className="max-w-[360px] truncate" title={p.title || ""}>{p.title ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
)}

        {tab === "alerts" && (
          <Card title={`Alerts (${filteredAlerts.length})`} right={<input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter alerts…" className="text-sm rounded-xl bg-white/70 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-700 px-3 py-2"/>} subtitle="Newest first">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                  <tr>
                    <Th>Type</Th><Th>Created</Th><Th>Bid</Th><Th>Details</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <RowPlaceholder cols={4} />}
                  {!loading && filteredAlerts.length === 0 && (
                    <tr><td className="p-6 text-center text-neutral-500" colSpan={4}>No alerts 🎉</td></tr>
                  )}
                  {filteredAlerts.map((a, i) => (
                    <tr key={`${a.type}-${i}`} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                      <Td><Badge tone={a.type.includes("ipfs")?"danger":"neutral"}>{a.type}</Badge></Td>
                      <Td>{humanTime(a.createdAt)}</Td>
                      <Td>{a.bidId ?? "—"}</Td>
                      <Td>
                        <details className="max-w-[900px] text-xs text-neutral-600 dark:text-neutral-300">
                          <summary className="cursor-pointer select-none underline decoration-dotted">View</summary>
                          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(a.details || {}, null, 2)}</pre>
                        </details>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "payouts" && (
          <Card title={`Recent Payouts (${data?.payouts?.recent?.length ?? 0})`} right={
            <button onClick={() => data?.payouts?.recent && downloadCSV(`payouts-${new Date().toISOString().slice(0,10)}.csv`, data.payouts.recent)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"><Icon.Download className="h-4 w-4"/> CSV</button>
          }>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                  <tr>
                    <Th>ID</Th><Th>Bid</Th><Th>Milestone</Th><Th>USD</Th><Th>Released At</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <RowPlaceholder cols={5} />}
                  {!loading && (data?.payouts?.recent?.length ?? 0) === 0 && (
                    <tr><td className="p-6 text-center text-neutral-500" colSpan={5}>No payouts</td></tr>
                  )}
                  {data?.payouts?.recent?.map((p) => (
                    <tr key={p.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                      <Td>{p.id}</Td>
                      <Td>{p.bid_id}</Td>
                      <Td>{p.milestone_index}</Td>
                      <Td className="tabular-nums">{fmtUSD0(Number(p.amount_usd || 0))}</Td>
                      <Td>{humanTime(p.released_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "activity" && (
          <Card title={`Recent Activity (${filteredActivity.length})`} right={<input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter activity…" className="text-sm rounded-xl bg-white/70 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-700 px-3 py-2"/>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                  <tr>
                    <Th>Time</Th><Th>Actor</Th><Th>Bid</Th><Th>Change</Th><Th>Details</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <RowPlaceholder cols={5} />}
                  {!loading && filteredActivity.length === 0 && (
                    <tr><td className="p-6 text-center text-neutral-500" colSpan={5}>No activity</td></tr>
                  )}
                  {filteredActivity.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                      <Td>{humanTime(r.created_at)}</Td>
                      <Td className="max-w-[220px] truncate" title={`${r.actor_role} ${r.actor_wallet ?? ''}`}>
                        <span className="uppercase text-[11px] tracking-wide text-neutral-500">{r.actor_role}</span>{" "}
                        <button onClick={() => r.actor_wallet && copy(r.actor_wallet, () => setToast("Wallet copied"))} className="font-mono text-xs underline decoration-dotted hover:opacity-80">
                          {r.actor_wallet ? shortAddr(r.actor_wallet) : ""}
                        </button>
                      </Td>
                      <Td>{r.bid_id ?? "—"}</Td>
                      <Td><Badge>{changeLabel(r.changes)}</Badge></Td>
 <Td>
  <a
    href={`/admin/oversight/activity/${r.id}?${makePayloadQS(r)}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
  >
    Open
  </a>
</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-300/60 bg-rose-50/60 dark:bg-rose-950/30 dark:border-rose-800 p-4 text-rose-700 dark:text-rose-200">
            Failed to load: {error}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed right-4 bottom-4 z-50">
            <div className="rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border border-neutral-800/60 dark:border-neutral-200/60 shadow-lg px-3 py-2 text-sm">
              {toast}
            </div>
            {setTimeout(() => setToast(null), 1400) && null}
          </div>
        )}
      </div>
    </div>
  );
}

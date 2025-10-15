"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

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
const fmtPct = (n: number) => `${Math.round(n ?? 0)}%`;
const shortAddr = (w: string) => (w?.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);
const dt = (s: string) => new Date(s);
const humanTime = (s: string) => dt(s).toLocaleString();
const changeLabel = (changes: Record<string, any>) => (Object.keys(changes)[0] || "").replaceAll("_", " ");
const copy = async (t: string, onDone?: () => void) => { try { await navigator.clipboard.writeText(t); onDone?.(); } catch { /* ignore */ } };

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
        {icon && <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">{icon}</div>}
        <div className="flex-1">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">{label}</div>
          <div className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</div>
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

  // sorting
  const [queueSort, setQueueSort] = usePersistentState<{ key: keyof Oversight["queue"][number]; dir: "asc"|"desc" }>("oversight.queue.sort", { key: "ageHours", dir: "desc" });
  const [vendorSort, setVendorSort] = usePersistentState<{ key: keyof Oversight["vendors"][number]; dir: "asc"|"desc" }>("oversight.vendors.sort", { key: "approvalPct", dir: "desc" });

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  const PATH = API_BASE ? "/admin/oversight" : "/api/admin/oversight";
  const baseUrl = `${API_BASE}${PATH}`;

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

  // auto refresh
  useInterval(() => { if (!document.hidden) load(); }, autoRefresh ? 30000 : null);
  useInterval(() => { if (!document.hidden) load(); }, autoRefresh ? 15000 : null);

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

  const tabs = useMemo(() => [
    { key: "overview", label: "Overview" },
    { key: "queue", label: "Queue", count: data?.queue?.length ?? 0 },
    { key: "vendors", label: "Vendors", count: data?.vendors?.length ?? 0 },
    { key: "alerts", label: "Alerts", count: data?.alerts?.length ?? 0 },
    { key: "payouts", label: "Payouts", count: data?.payouts?.recent?.length ?? 0 },
    { key: "activity", label: "Activity", count: data?.recent?.length ?? 0 },
  ], [data]);

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

  const tiles = data?.tiles;

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
              <StatCard label="Pending Payouts" value={loading?"—":fmtInt(tiles?.pendingPayouts?.count||0)} icon={<Icon.Ticket className="h-5 w-5"/>} />
              <StatCard label="Payouts USD" value={loading?"—":fmtUSD0(tiles?.pendingPayouts?.totalUSD||0)} icon={<Icon.Dollar className="h-5 w-5"/>} />
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
                        <details className="max-w-[520px] text-xs text-neutral-600 dark:text-neutral-300">
                          <summary className="cursor-pointer select-none underline decoration-dotted">View</summary>
                          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(Object.values(r.changes)[0], null, 2)}</pre>
                        </details>
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

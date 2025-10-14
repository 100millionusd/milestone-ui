"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// ------------------------------------------------------------
// Admin Oversight — smart, pretty, tabbed
// Pure Tailwind (no UI libs). Drop this into app/admin/page.tsx
// ------------------------------------------------------------

// —— Types that match /api/admin/oversight ——
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

// —— Icons ——
const Icon = {
  Refresh: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6"/><path strokeLinecap="round" strokeLinejoin="round" d="M20 12a8 8 0 1 1-2.34-5.66"/></svg>
  ),
  Search: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
  ),
  Clock: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>
  ),
  Lock: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...p}><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  ),
  Dollar: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...p}><path d="M12 1v22"/><path d="M17 5.5C17 3.6 15.2 2 13 2H9.5a3.5 3.5 0 0 0 0 7H13a3.5 3.5 0 0 1 0 7H7"/></svg>
  ),
  Proof: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...p}><path d="M9 12h6M9 16h6M9 8h6"/><path d="M5 3h10l4 4v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>
  ),
  Shield: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...p}><path d="M12 3 5 6v6c0 5 3.5 7.5 7 9 3.5-1.5 7-4 7-9V6l-7-3Z"/></svg>
  ),
  Check: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="m20 6-11 11-5-5"/></svg>
  ),
};

// —— Helpers ——
const cls = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");
const fmtInt = (n?: number) => new Intl.NumberFormat().format(Math.round(n ?? 0));
const fmtUSD = (n?: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n?: number) => `${Math.round(n ?? 0)}%`;
const shortAddr = (w: string) => (w?.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);
const humanTime = (s: string) => new Date(s).toLocaleString();
const firstKey = (o: Record<string, any>) => Object.keys(o || {})[0] || "";

function downloadCSV(filename: string, rows: any[]) {
  if (!rows?.length) return;
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// —— UI atoms ——
function StatCard({ label, value, sub, icon, tone = "neutral" }:{ label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode; tone?: "neutral"|"warning"|"danger"|"success"; }) {
  const toneRing = { neutral: "ring-neutral-200/70 dark:ring-neutral-800/60", warning: "ring-amber-400/50", danger: "ring-rose-400/50", success: "ring-emerald-400/50" }[tone];
  const glow = { neutral: "", warning: "shadow-[0_0_50px_-15px_rgba(245,158,11,0.4)]", danger: "shadow-[0_0_50px_-15px_rgba(244,63,94,0.4)]", success: "shadow-[0_0_50px_-15px_rgba(16,185,129,0.4)]" }[tone];
  return (
    <div className={cls("rounded-2xl border border-neutral-200/70 dark:border-neutral-800/60 ring-1 bg-white/70 dark:bg-neutral-900/60 backdrop-blur p-4", toneRing, glow)}>
      <div className="flex items-center gap-3">
        {icon && <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">{icon}</div>}
        <div>
          <div className="text-sm text-neutral-500 dark:text-neutral-400">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
          {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cls("px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cls("px-4 py-3 align-top", className)}>{children}</td>;
}
function Badge({ children, tone = "neutral" }:{ children: React.ReactNode; tone?: "neutral"|"danger"|"warning"|"success" }) {
  const t = { neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300", danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200", warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200", success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200" }[tone];
  return <span className={cls("inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium", t)}>{children}</span>;
}
function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${v}%` }} />
    </div>
  );
}

// ——— Safe API base resolution (no Node `process` needed) ———
function __normalizeBase(base: any): string {
  return typeof base === "string" ? base.replace(/\/$/, "") : "";
}
function getApiBase(): string {
  const g: any = (typeof globalThis !== "undefined" ? (globalThis as any) : {});
  const fromEnv = g?.process?.env?.NEXT_PUBLIC_API_BASE_URL; // will be undefined in browsers without Node polyfill
  const fromWindow = (typeof window !== "undefined" ? (window as any).__API_BASE__ : undefined);
  return __normalizeBase(fromEnv ?? fromWindow ?? "");
}

// Tiny self‑tests for the helper (runs in browser only)
if (typeof window !== "undefined") {
  try {
    console.assert(__normalizeBase("https://x/") === "https://x", "normalize removes trailing slash");
    console.assert(__normalizeBase("https://x") === "https://x", "normalize keeps no slash");
    console.assert(__normalizeBase(undefined as any) === "", "normalize handles undefined");
  } catch {}
}

export default function AdminOversightPage() {
  const [data, setData] = useState<Oversight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(() => typeof window !== "undefined" ? localStorage.getItem("lx.admin.tab") || "overview" : "overview");
  const [q, setQ] = useState(""); // global search (alerts/activity tabs use this heavily)
  const [auto, setAuto] = useState<boolean>(() => typeof window !== "undefined" ? localStorage.getItem("lx.admin.auto") === "1" : false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [queueFilter, setQueueFilter] = useState<{status: string; risk: string}>({ status: "", risk: "" });
  const [queueSort, setQueueSort] = useState<string>("age_desc");
  const abortRef = useRef<AbortController | null>(null);

  const API_BASE = getApiBase();
  const url = `${API_BASE ? API_BASE : ""}/api/admin/oversight`;

  async function load() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setError(null);
      setLoading(true);
      const res = await fetch(url, { cache: "no-store", signal: controller.signal, credentials: "include" });
      if (!res.ok) {
        const hint = res.status === 404 ? `Endpoint not found at ${url}. Check NEXT_PUBLIC_API_BASE_URL.` : `HTTP ${res.status}`;
        throw new Error(hint);
      }
      const json = await res.json();
      setData(json);
      setLastRefreshed(new Date());
    } catch (e: any) {
      if (e?.name === "AbortError") return; // silent on abort
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Auto-refresh every 30s when enabled
  useEffect(() => {
    if (auto) {
      const id = setInterval(load, 30000);
      return () => clearInterval(id);
    }
  }, [auto]);

  // persist prefs
  useEffect(() => { try { localStorage.setItem("lx.admin.tab", tab); } catch {} }, [tab]);
  useEffect(() => { try { localStorage.setItem("lx.admin.auto", auto ? "1" : "0"); } catch {} }, [auto]);

  // —— Derived / filtered data ——
  const filteredQueue = useMemo(() => {
    let list = [...(data?.queue || [])];
    if (queueFilter.status) list = list.filter(x => x.status === queueFilter.status);
    if (queueFilter.risk) list = list.filter(x => (x.risk || "") === queueFilter.risk);
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(x => `${x.id} ${x.vendor} ${x.project} ${x.actions?.bidId ?? ""}`.toLowerCase().includes(s));
    }
    list.sort((a,b) => queueSort === "age_asc" ? a.ageHours - b.ageHours : b.ageHours - a.ageHours);
    return list;
  }, [data, q, queueFilter, queueSort]);

  const filteredVendors = useMemo(() => {
    let list = [...(data?.vendors || [])];
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(v => `${v.vendor} ${v.wallet}`.toLowerCase().includes(s));
    }
    return list;
  }, [data, q]);

  const filteredAlerts = useMemo(() => {
    let list = [...(data?.alerts || [])];
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(a => `${a.type} ${a.bidId} ${JSON.stringify(a.details||{})}`.toLowerCase().includes(s));
    }
    return list;
  }, [data, q]);

  const filteredActivity = useMemo(() => {
    let list = [...(data?.recent || [])];
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(r => `${r.actor_role} ${r.actor_wallet ?? ""} ${firstKey(r.changes)} ${r.bid_id ?? ""}`.toLowerCase().includes(s));
    }
    return list.slice(0, 100); // keep the page snappy
  }, [data, q]);

  const tiles = data?.tiles;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "queue", label: `Queue ${filteredQueue.length ? `(${filteredQueue.length})` : ""}` },
    { key: "vendors", label: `Vendors ${filteredVendors.length ? `(${filteredVendors.length})` : ""}` },
    { key: "alerts", label: `Alerts ${filteredAlerts.length ? `(${filteredAlerts.length})` : ""}` },
    { key: "payouts", label: `Payouts ${(data?.payouts?.recent?.length||0) ? `(${data?.payouts?.recent?.length})` : ""}` },
    { key: "activity", label: `Activity ${(data?.recent?.length||0) ? `(${Math.min(100, data?.recent?.length||0)})` : ""}` },
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
      {/* Top bar */}
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-neutral-900/60 border-b border-neutral-200/60 dark:border-neutral-800">
        <div className="mx-auto max-w-[1400px] px-5 py-4 flex items-center gap-4 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 grid place-items-center font-bold">LX</div>
            <div className="truncate">
              <div className="text-lg font-semibold truncate">Admin Oversight</div>
              <div className="text-xs text-neutral-500 truncate">Ops cockpit • proofs, payouts, risk</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Icon.Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search alerts/activity/vendors…" className="pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/60 outline-none w-[260px]"/>
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-500 select-none">
              <input type="checkbox" className="accent-neutral-900" checked={auto} onChange={e=>setAuto(e.target.checked)} />
              Auto‑refresh (30s)
            </label>
            <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm">
              <Icon.Refresh className="h-4 w-4"/> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-[1400px] px-5 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.key} onClick={()=>setTab(t.key)} className={cls("px-3 py-1.5 rounded-xl border text-sm", tab===t.key?"bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white":"border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800")}>{t.label}</button>
          ))}
        </div>

        {/* Tiles */}
        {(tab === "overview") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Open Proofs" value={loading?"—":fmtInt(tiles?.openProofs)} icon={<Icon.Proof className="h-5 w-5"/>} />
            <StatCard label="Breaching SLA" value={loading?"—":fmtInt(tiles?.breachingSla)} tone="warning" icon={<Icon.Clock className="h-5 w-5"/>} />
            <StatCard label="Pending Payouts" value={loading?"—":fmtInt(tiles?.pendingPayouts?.count)} icon={<Icon.Dollar className="h-5 w-5"/>} />
            <StatCard label="Payouts USD" value={loading?"—":fmtUSD(tiles?.pendingPayouts?.totalUSD)} icon={<Icon.Dollar className="h-5 w-5"/>} />
            <StatCard label="Escrows Locked" value={loading?"—":fmtInt(tiles?.escrowsLocked)} icon={<Icon.Lock className="h-5 w-5"/>} />
            <StatCard label="P50 Cycle (h)" value={loading?"—":fmtInt(tiles?.p50CycleHours)} icon={<Icon.Clock className="h-5 w-5"/>} />
          </div>
        )}

        {/* OVERVIEW quick lists */}
        {(tab === "overview") && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Queue (preview) */}
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
              <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between">
                <div className="text-sm font-semibold">Queue ({data?.queue?.length ?? 0})</div>
                <button className="text-xs text-neutral-500 hover:underline" onClick={()=>setTab("queue")}>View all</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left">
                    <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                      <Th>ID</Th><Th>Vendor</Th><Th>Project</Th><Th>Milestone</Th><Th className="text-right">Age (h)</Th><Th>Status</Th><Th>Risk</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.queue||[]).slice(0,6).map(q => (
                      <tr key={q.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                        <Td>{q.id}</Td>
                        <Td className="max-w-[240px] truncate" title={q.vendor}>{q.vendor}</Td>
                        <Td>{q.project}</Td>
                        <Td>{q.milestone}</Td>
                        <Td className="text-right tabular-nums">{q.ageHours.toFixed(1)}</Td>
                        <Td><Badge tone={q.status === "pending"?"warning":"neutral"}>{q.status}</Badge></Td>
                        <Td><Badge tone={q.risk === "sla"?"danger":"neutral"}>{q.risk || "—"}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Vendors (preview) */}
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
              <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between">
                <div className="text-sm font-semibold">Vendors ({data?.vendors?.length ?? 0})</div>
                <button className="text-xs text-neutral-500 hover:underline" onClick={()=>setTab("vendors")}>View all</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left">
                    <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                      <Th>Vendor</Th><Th>Wallet</Th><Th>Proofs (A/T)</Th><Th>CR</Th><Th>Approval %</Th><Th>Bids</Th><Th>Last Activity</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.vendors||[]).slice(0,6).map(v => (
                      <tr key={v.wallet} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                        <Td className="max-w-[220px] truncate" title={v.vendor}>{v.vendor}</Td>
                        <Td title={v.wallet}><span className="font-mono text-xs">{shortAddr(v.wallet)}</span></Td>
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
            </div>
          </div>
        )}

        {/* QUEUE tab */}
        {(tab === "queue") && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select value={queueFilter.status} onChange={e=>setQueueFilter(v=>({...v, status:e.target.value}))} className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/60 text-sm">
                <option value="">Status: Any</option>
                <option value="pending">Pending</option>
                <option value="done">Done</option>
              </select>
              <select value={queueFilter.risk} onChange={e=>setQueueFilter(v=>({...v, risk:e.target.value}))} className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/60 text-sm">
                <option value="">Risk: Any</option>
                <option value="sla">SLA</option>
                <option value="">None</option>
              </select>
              <select value={queueSort} onChange={e=>setQueueSort(e.target.value)} className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/60 text-sm">
                <option value="age_desc">Sort: Age ↓</option>
                <option value="age_asc">Sort: Age ↑</option>
              </select>
              <button onClick={()=>downloadCSV("queue.csv", filteredQueue)} className="ml-auto text-sm px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800">Export CSV</button>
            </div>

            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
              <div className="px-5 py-3 border-b border-neutral-200/60 dark:border-neutral-800 text-sm font-semibold">Queue ({filteredQueue.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                      <Th>ID</Th><Th>Vendor</Th><Th>Project</Th><Th>Milestone</Th><Th className="text-right">Age (h)</Th><Th>Status</Th><Th>Risk</Th><Th>Bid</Th><Th>Proposal</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueue.map(q => (
                      <tr key={q.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                        <Td>{q.id}</Td>
                        <Td className="max-w-[260px] truncate" title={q.vendor}>{q.vendor}</Td>
                        <Td>{q.project}</Td>
                        <Td>{q.milestone}</Td>
                        <Td className="text-right tabular-nums">{q.ageHours.toFixed(1)}</Td>
                        <Td><Badge tone={q.status === "pending"?"warning":"neutral"}>{q.status}</Badge></Td>
                        <Td><Badge tone={q.risk === "sla"?"danger":"neutral"}>{q.risk || "—"}</Badge></Td>
                        <Td>{q.actions?.bidId ?? "—"}</Td>
                        <Td>{q.actions?.proposalId ?? "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* VENDORS tab */}
        {(tab === "vendors") && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={()=>downloadCSV("vendors.csv", filteredVendors)} className="ml-auto text-sm px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800">Export CSV</button>
            </div>
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
              <div className="px-5 py-3 border-b border-neutral-200/60 dark:border-neutral-800 text-sm font-semibold">Vendors ({filteredVendors.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                      <Th>Vendor</Th><Th>Wallet</Th><Th>Proofs (A/T)</Th><Th>CR</Th><Th>Approval %</Th><Th>Bids</Th><Th>Last Activity</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVendors.map(v => (
                      <tr key={v.wallet} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                        <Td className="max-w-[300px] truncate" title={v.vendor}>{v.vendor}</Td>
                        <Td title={v.wallet}><span className="font-mono text-xs">{shortAddr(v.wallet)}</span></Td>
                        <Td>{v.approved}/{v.proofs}</Td>
                        <Td>{v.cr}</Td>
                        <Td className="min-w-[160px]"><div className="flex items-center gap-2"><Progress value={v.approvalPct}/><span className="w-12 text-right tabular-nums">{fmtPct(v.approvalPct)}</span></div></Td>
                        <Td>{v.bids}</Td>
                        <Td>{humanTime(v.lastActivity)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ALERTS tab */}
        {(tab === "alerts") && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={()=>downloadCSV("alerts.csv", filteredAlerts)} className="ml-auto text-sm px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800">Export CSV</button>
            </div>
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
              <div className="px-5 py-3 border-b border-neutral-200/60 dark:border-neutral-800 text-sm font-semibold">Alerts ({filteredAlerts.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                      <Th>Type</Th><Th>Created</Th><Th>Bid</Th><Th>Details</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map((a, i) => (
                      <tr key={`${a.type}-${i}`} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                        <Td><Badge tone={a.type.includes("ipfs")?"danger":"neutral"}>{a.type}</Badge></Td>
                        <Td>{humanTime(a.createdAt)}</Td>
                        <Td>{a.bidId ?? "—"}</Td>
                        <Td>
                          <details>
                            <summary className="cursor-pointer text-xs text-neutral-500">View</summary>
                            <pre className="mt-2 max-w-[1000px] whitespace-pre-wrap break-words text-xs text-neutral-600 dark:text-neutral-300">{JSON.stringify(a.details || {}, null, 2)}</pre>
                          </details>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* PAYOUTS tab */}
        {(tab === "payouts") && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={()=>downloadCSV("payouts.csv", data?.payouts?.recent || [])} className="ml-auto text-sm px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800">Export CSV</button>
            </div>
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
              <div className="px-5 py-3 border-b border-neutral-200/60 dark:border-neutral-800 text-sm font-semibold">Recent Payouts ({data?.payouts?.recent?.length ?? 0})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                      <Th>ID</Th><Th>Bid</Th><Th>Milestone</Th><Th>USD</Th><Th>Released At</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.payouts?.recent || []).map(p => (
                      <tr key={p.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                        <Td>{p.id}</Td>
                        <Td>{p.bid_id}</Td>
                        <Td>{p.milestone_index}</Td>
                        <Td className="tabular-nums">{fmtUSD(Number(p.amount_usd || 0))}</Td>
                        <Td>{humanTime(p.released_at)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ACTIVITY tab */}
        {(tab === "activity") && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={()=>downloadCSV("activity.csv", filteredActivity)} className="ml-auto text-sm px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800">Export CSV</button>
            </div>
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
              <div className="px-5 py-3 border-b border-neutral-200/60 dark:border-neutral-800 text-sm font-semibold">Recent Activity ({filteredActivity.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                      <Th>Time</Th><Th>Actor</Th><Th>Bid</Th><Th>Change</Th><Th>Details</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivity.map((r, i) => (
                      <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                        <Td>{humanTime(r.created_at)}</Td>
                        <Td className="max-w-[220px] truncate" title={`${r.actor_role} ${r.actor_wallet ?? ''}`}>
                          <span className="uppercase text-[11px] tracking-wide text-neutral-500">{r.actor_role}</span> {r.actor_wallet && <span className="font-mono text-xs">{shortAddr(r.actor_wallet)}</span>}
                        </Td>
                        <Td>{r.bid_id ?? "—"}</Td>
                        <Td><Badge>{firstKey(r.changes).replaceAll("_"," ")}</Badge></Td>
                        <Td>
                          <details>
                            <summary className="cursor-pointer text-xs text-neutral-500">View</summary>
                            <pre className="mt-2 max-w-[1000px] whitespace-pre-wrap break-words text-xs text-neutral-600 dark:text-neutral-300">{JSON.stringify(Object.values(r.changes)[0], null, 2)}</pre>
                          </details>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Footer: status */}
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <div>
            {lastRefreshed && <>Updated {lastRefreshed.toLocaleTimeString()} • </>}
            Source: <span className="font-mono">{url}</span>
          </div>
          {error && <div className="rounded-xl border border-rose-300/60 bg-rose-50/60 dark:bg-rose-950/30 dark:border-rose-800 px-3 py-2 text-rose-700 dark:text-rose-200">{String(error)}</div>}
        </div>
      </div>
    </div>
  );
}

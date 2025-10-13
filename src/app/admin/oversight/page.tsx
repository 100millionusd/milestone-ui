"use client";

import React, { useEffect, useMemo, useState } from "react";

// ------------------------------------------------------------
// Admin Oversight — beautiful, responsive, single‑file page
// No external UI libs required. Tailwind only. Drop into
// app/admin/page.tsx (App router) or pages/admin.tsx (Pages router).
// ------------------------------------------------------------

// —— Types that match your /api/admin/oversight payload ——
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
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86a2 2 0 0 1 3.42 0l8.37 14.48A2 2 0 0 1 20.37 22H3.63a2 2 0 0 1-1.71-3.66L10.29 3.86Z"/></svg>
  ),
  Clock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>
  ),
  Lock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...props}><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  ),
  Dollar: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...props}><path d="M12 1v22"/><path d="M17 5.5C17 3.6 15.2 2 13 2H9.5a3.5 3.5 0 0 0 0 7H13a3.5 3.5 0 0 1 0 7H7"/></svg>
  ),
  Check: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="m20 6-11 11-5-5"/></svg>
  ),
  Ticket: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...props}><path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v2a2 2 0 0 0-2 2 2 2 0 0 0 2 2v2a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-2a2 2 0 0 0 2-2 2 2 0 0 0-2-2V9Z"/></svg>
  ),
  Refresh: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12a8 8 0 1 1-8-8 8 8 0 0 1 8 8Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6"/></svg>
  ),
  Proof: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" {...props}><path d="M9 12h6M9 16h6M9 8h6"/><path d="M5 3h10l4 4v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>
  ),
};

// —— Helpers ——
const cls = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");
const fmtInt = (n: number) => new Intl.NumberFormat().format(Math.round(n ?? 0));
const fmtUSD = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n: number) => `${Math.round(n ?? 0)}%`;
const shortAddr = (w: string) => (w?.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);
const dt = (s: string) => new Date(s);
const humanTime = (s: string) => dt(s).toLocaleString();

function changeLabel(changes: Record<string, any>) {
  const key = Object.keys(changes)[0] || "";
  return key.replaceAll("_", " ");
}

function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${v}%` }} />
    </div>
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

export default function AdminOversightPage() {
  const [data, setData] = useState<Oversight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  const PATH = API_BASE ? "/admin/oversight" : "/api/admin/oversight";
  const url = `${API_BASE}${PATH}`;

  async function load() {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Oversight;
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tiles = data?.tiles;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
      {/* Top bar */}
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-neutral-900/60 border-b border-neutral-200/60 dark:border-neutral-800">
        <div className="mx-auto max-w-[1400px] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 grid place-items-center font-bold">LX</div>
            <div>
              <div className="text-lg font-semibold">Admin Oversight</div>
              <div className="text-xs text-neutral-500">Ops cockpit • proofs, payouts, risk</div>
            </div>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm">
            <Icon.Refresh className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-[1400px] px-5 py-6 space-y-8">
        {/* STAT TILES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
          <StatCard label="Open Proofs" value={loading?"—":fmtInt(tiles?.openProofs||0)} icon={<Icon.Proof className="h-5 w-5"/>} />
          <StatCard label="Breaching SLA" value={loading?"—":fmtInt(tiles?.breachingSla||0)} tone="warning" icon={<Icon.Clock className="h-5 w-5"/>} />
          <StatCard label="Pending Payouts" value={loading?"—":fmtInt(tiles?.pendingPayouts?.count||0)} icon={<Icon.Ticket className="h-5 w-5"/>} />
          <StatCard label="Payouts USD" value={loading?"—":fmtUSD(tiles?.pendingPayouts?.totalUSD||0)} icon={<Icon.Dollar className="h-5 w-5"/>} />
          <StatCard label="Escrows Locked" value={loading?"—":fmtInt(tiles?.escrowsLocked||0)} icon={<Icon.Lock className="h-5 w-5"/>} />
          <StatCard label="P50 Cycle (h)" value={loading?"—":fmtInt(tiles?.p50CycleHours||0)} icon={<Icon.Clock className="h-5 w-5"/>} />
          <StatCard label="Revision Rate" value={loading?"—":fmtPct(tiles?.revisionRatePct||0)} icon={<Icon.Check className="h-5 w-5"/>} />
        </div>

        {/* GRID: Queue + Vendors */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Queue */}
          <div className="xl:col-span-2 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
            <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between">
              <div className="text-sm font-semibold">Queue ({data?.queue?.length ?? 0})</div>
              <div className="text-xs text-neutral-500">Oldest first</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/80 backdrop-blur z-[1]">
                  <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                    <Th>ID</Th><Th>Vendor</Th><Th>Project</Th><Th>Milestone</Th><Th className="text-right">Age (h)</Th><Th>Status</Th><Th>Risk</Th><Th>Bid</Th><Th>Proposal</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <RowPlaceholder cols={9} />}
                  {!loading && data?.queue?.length === 0 && (
                    <tr><td className="p-6 text-center text-neutral-500" colSpan={9}>Nothing in the queue</td></tr>
                  )}
                  {data?.queue?.map((q) => (
                    <tr key={q.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                      <Td>{q.id}</Td>
                      <Td className="max-w-[220px] truncate" title={q.vendor}>{q.vendor}</Td>
                      <Td>{q.project}</Td>
                      <Td>{q.milestone}</Td>
                      <Td className="text-right tabular-nums">{q.ageHours.toFixed(1)}</Td>
                      <Td><Badge tone={q.status === "pending" ? "warning" : "neutral"}>{q.status}</Badge></Td>
                      <Td><Badge tone={q.risk === "sla" ? "danger" : "neutral"}>{q.risk || "—"}</Badge></Td>
                      <Td>{q.actions?.bidId ?? "—"}</Td>
                      <Td>{q.actions?.proposalId ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vendors */}
          <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
            <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between">
              <div className="text-sm font-semibold">Vendors ({data?.vendors?.length ?? 0})</div>
              <div className="text-xs text-neutral-500">Performance</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                    <Th>Vendor</Th><Th>Wallet</Th><Th>Proofs (A/T)</Th><Th>CR</Th><Th>Approval %</Th><Th>Bids</Th><Th>Last Activity</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <RowPlaceholder cols={7} />}
                  {!loading && data?.vendors?.length === 0 && (
                    <tr><td className="p-6 text-center text-neutral-500" colSpan={7}>No vendors yet</td></tr>
                  )}
                  {data?.vendors?.map((v) => (
                    <tr key={v.wallet} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                      <Td className="max-w-[220px] truncate" title={v.vendor}>{v.vendor}</Td>
                      <Td title={v.wallet}><span className="font-mono text-xs">{shortAddr(v.wallet)}</span></Td>
                      <Td>{v.approved}/{v.proofs}</Td>
                      <Td>{v.cr}</Td>
                      <Td className="min-w-[120px]">
                        <div className="flex items-center gap-2"><Progress value={v.approvalPct} /><span className="w-10 text-right tabular-nums">{fmtPct(v.approvalPct)}</span></div>
                      </Td>
                      <Td>{v.bids}</Td>
                      <Td>{humanTime(v.lastActivity)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
          <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon.Alert className="h-5 w-5 text-rose-500"/>
              <div className="text-sm font-semibold">Alerts ({data?.alerts?.length ?? 0})</div>
            </div>
            <div className="text-xs text-neutral-500">Newest first</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                  <Th>Type</Th><Th>Created</Th><Th>Bid</Th><Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {loading && <RowPlaceholder cols={4} />}
                {!loading && data?.alerts?.length === 0 && (
                  <tr><td className="p-6 text-center text-neutral-500" colSpan={4}>No alerts 🎉</td></tr>
                )}
                {data?.alerts?.map((a, i) => (
                  <tr key={`${a.type}-${i}`} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                    <Td><Badge tone={a.type.includes("ipfs")?"danger":"neutral"}>{a.type}</Badge></Td>
                    <Td>{humanTime(a.createdAt)}</Td>
                    <Td>{a.bidId ?? "—"}</Td>
                    <Td>
                      <pre className="max-w-[900px] whitespace-pre-wrap break-words text-xs text-neutral-600 dark:text-neutral-300">{JSON.stringify(a.details || {}, null, 0)}</pre>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payouts + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payouts */}
          <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
            <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between">
              <div className="text-sm font-semibold">Recent Payouts ({data?.payouts?.recent?.length ?? 0})</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
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
                      <Td className="tabular-nums">{fmtUSD(Number(p.amount_usd || 0))}</Td>
                      <Td>{humanTime(p.released_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity */}
          <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
            <div className="px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between">
              <div className="text-sm font-semibold">Recent Activity ({data?.recent?.length ?? 0})</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b border-neutral-200/60 dark:border-neutral-800">
                    <Th>Time</Th><Th>Actor</Th><Th>Bid</Th><Th>Change</Th><Th>Details</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <RowPlaceholder cols={5} />}
                  {!loading && data?.recent?.length === 0 && (
                    <tr><td className="p-6 text-center text-neutral-500" colSpan={5}>No activity</td></tr>
                  )}
                  {data?.recent?.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                      <Td>{humanTime(r.created_at)}</Td>
                      <Td className="max-w-[220px] truncate" title={`${r.actor_role} ${r.actor_wallet ?? ''}`}>
                        <span className="uppercase text-[11px] tracking-wide text-neutral-500">{r.actor_role}</span>{" "}
                        <span className="font-mono text-xs">{r.actor_wallet ? shortAddr(r.actor_wallet) : ""}</span>
                      </Td>
                      <Td>{r.bid_id ?? "—"}</Td>
                      <Td><Badge>{changeLabel(r.changes)}</Badge></Td>
                      <Td>
                        <pre className="max-w-[520px] whitespace-pre-wrap break-words text-xs text-neutral-600 dark:text-neutral-300">{JSON.stringify(Object.values(r.changes)[0], null, 0)}</pre>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-300/60 bg-rose-50/60 dark:bg-rose-950/30 dark:border-rose-800 p-4 text-rose-700 dark:text-rose-200">
            Failed to load: {error}
          </div>
        )}
      </div>
    </div>
  );
}

// —— tiny table helpers ——
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cls("px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cls("px-4 py-3 align-top", className)}>{children}</td>;
}
function RowPlaceholder({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="p-6">
        <div className="animate-pulse h-4 w-full rounded bg-neutral-200 dark:bg-neutral-800"/>
      </td>
    </tr>
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

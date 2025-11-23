"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";

// --- Types (Unchanged) ---
type CRResponseFile = { url?: string; cid?: string; name?: string };
type CRResponse = {
  id: number;
  createdAt: string;
  note?: string | null;
  files: CRResponseFile[];
};
type ChangeRequestRow = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  status: "open" | "resolved" | string;
  comment: string | null;
  checklist: string[];
  createdAt: string;
  resolvedAt: string | null;
  responses?: CRResponse[];
};

// ... imports

// 1. Get Token and Gateway
// ChangeRequestsPanel.tsx

// 1. Get the Gateway Domain and Token
const PINATA_GATEWAY =
  typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String((process as any).env.NEXT_PUBLIC_PINATA_GATEWAY)
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")}/ipfs`
    : "https://gateway.pinata.cloud/ipfs";

const GATEWAY_TOKEN = 
  typeof process !== "undefined" ? (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY_TOKEN : "";

// 2. The Fixed Function
function toUrl(f: CRResponseFile) {
  // PRIORITY 1: If we have a CID, construct a fresh URL with the token.
  // We ignore f.url because it might be the old public link or missing the token.
  if (f?.cid) {
    const baseUrl = `${PINATA_GATEWAY}/${f.cid}`;
    return GATEWAY_TOKEN 
      ? `${baseUrl}?pinataGatewayToken=${GATEWAY_TOKEN}` 
      : baseUrl;
  }

  // PRIORITY 2: Fallback to stored URL (e.g. if it's an external link)
  if (f?.url && /^https?:\/\//i.test(f.url)) return f.url;
  
  if (f?.url) return `https://${f.url.replace(/^https?:\/\//, "")}`;

  return "#";
}

function isImageHref(href: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(href);
}

type Props = {
  proposalId: number;
  initialMilestoneIndex?: number;
  forceMilestoneIndex?: number;
  hideMilestoneTabs?: boolean;
};

type Draft = { message: string; files: File[]; sending?: boolean; error?: string };

// --- Icons ---
const Icons = {
  Refresh: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
  ),
  CheckCircle: () => (
    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  Clock: () => (
    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  File: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 2v7h7" /></svg>
  ),
  ExternalLink: () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
  ),
  Send: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
  ),
  Attachment: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
  ),
  AdminUser: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
  ),
  ChevronDown: () => (
    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
  ),
  Alert: () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
  )
};

export default function ChangeRequestsPanel(props: Props) {
  const {
    proposalId,
    initialMilestoneIndex = 0,
    forceMilestoneIndex,
    hideMilestoneTabs,
  } = props;

  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(initialMilestoneIndex);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (typeof forceMilestoneIndex === "number") return;
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get("ms") ?? url.searchParams.get("milestone");
      const n = q ? Number(q) : NaN;
      if (Number.isFinite(n) && n >= 0) setActiveMilestoneIndex(n);
    } catch {}
  }, []);

  const idx = typeof forceMilestoneIndex === "number" ? forceMilestoneIndex : activeMilestoneIndex;

  const [rows, setRows] = useState<ChangeRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});

  const loadingRef = useRef(false);
  const lastLoadTs = useRef(0);

  const load = useCallback(async () => {
    if (!Number.isFinite(proposalId)) return;
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setErr(null);
    try {
      const url = new URL("/api/proofs/change-requests", window.location.origin);
      url.searchParams.set("proposalId", String(proposalId));
      url.searchParams.set("include", "responses");
      url.searchParams.set("status", "all");
      if (typeof forceMilestoneIndex === "number") {
        url.searchParams.set("milestoneIndex", String(forceMilestoneIndex));
      }

      const r = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list: ChangeRequestRow[] = await r.json();
      const safeList = Array.isArray(list) ? list : [];

      setRows(safeList);

      if (typeof forceMilestoneIndex !== "number") {
        const present = new Set<number>(
          safeList.map((row) => Number(row.milestoneIndex)).filter((x) => Number.isFinite(x))
        );
        if (!present.has(idx) && present.size > 0) {
          const latest = Math.max(...Array.from(present.values()));
          if (latest !== idx) setActiveMilestoneIndex(latest);
        }
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load change requests");
      setRows([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
      lastLoadTs.current = Date.now();
    }
  }, [proposalId, forceMilestoneIndex, idx]);

  useEffect(() => {
    load();
  }, [load, proposalId, idx]);

  useEffect(() => {
    const onAny = (ev: any) => {
      const pid = Number(ev?.detail?.proposalId);
      if (!Number.isFinite(pid) || pid !== proposalId) return;
      if (Date.now() - lastLoadTs.current < 500) return;
      load();
    };
    window.addEventListener("proofs:updated", onAny);
    window.addEventListener("proofs:changed", onAny);
    window.addEventListener("milestones:updated", onAny);
    return () => {
      window.removeEventListener("proofs:updated", onAny);
      window.removeEventListener("proofs:changed", onAny);
      window.removeEventListener("milestones:updated", onAny);
    };
  }, [proposalId, load]);

  const filteredRows = useMemo(
    () => (rows || []).filter((cr) => (cr.milestoneIndex ?? (cr as any).milestone_index ?? 0) === idx),
    [rows, idx]
  );

  // HELPER: Determine if a CR is truly actionable (Open status AND not resolved via date AND no reply yet)
  const isRowActionable = (r: ChangeRequestRow) => {
    const isResolved = r.status === "resolved" || !!r.resolvedAt;
    if (isResolved) return false;
    const hasReply = Array.isArray(r.responses) && r.responses.length > 0;
    // Status is open, not resolved by date, and vendor hasn't replied
    return r.status === "open" && !hasReply;
  };

  const actionableCount = useMemo(
    () => filteredRows.filter(isRowActionable).length,
    [filteredRows]
  );

  const allMilestones = useMemo(
    () => Array.from(new Set((rows || []).map((r) => r.milestoneIndex))).sort((a, b) => a - b),
    [rows]
  );

  const showTabs = !hideMilestoneTabs && typeof forceMilestoneIndex !== "number" && allMilestones.length > 1;

  const setDraft = useCallback((crId: number, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [crId]: { message: "", files: [], ...prev[crId], ...patch } }));
  }, []);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files?.length) return [];
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    const r = await fetch("/api/proofs/upload", {
      method: "POST",
      body: fd,
      credentials: "include",
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Upload failed (HTTP ${r.status})`);
    const data = await r.json().catch(() => ({}));
    const arr: any[] = Array.isArray(data) ? data : data.files ?? [];
    return arr
      .map((x) => {
        const cid = x?.cid || x?.IpfsHash || x?.Hash || x?.hash || "";
        const name = x?.name || x?.fileName || "file";
        const url = (x?.url && String(x.url)) || (cid ? `${PINATA_GATEWAY}/${cid}` : "");
        return { name, cid: cid || undefined, url };
      })
      .filter((it: any) => it.url);
  }, []);

  const submitReply = useCallback(
    async (cr: ChangeRequestRow) => {
      const d = drafts[cr.id] || { message: "", files: [] };
      if (!d.message && (!d.files || d.files.length === 0)) {
        setDraft(cr.id, { error: "Write a message or attach at least one file." });
        return;
      }
      setDraft(cr.id, { sending: true, error: undefined });
      try {
        const uploaded = await uploadFiles(d.files || []);
        const body = { comment: d.message ?? "", files: uploaded };
        const r = await fetch(`/api/proofs/change-requests/${cr.id}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(txt || `HTTP ${r.status}`);
        }
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[cr.id];
          return next;
        });
        await load();
        window.dispatchEvent(new CustomEvent("proofs:updated", { detail: { proposalId } }));
      } catch (e: any) {
        setDraft(cr.id, { error: e?.message || "Failed to send reply" });
      } finally {
        setDraft(cr.id, { sending: false });
      }
    },
    [drafts, load, proposalId, setDraft, uploadFiles]
  );

  // -------------------- render --------------------
  
  return (
    <div className={`mt-6 rounded-xl border bg-white shadow-sm overflow-hidden transition-all ${
        actionableCount > 0 && !isExpanded ? "border-red-200 shadow-red-50" : "border-slate-200"
    }`}>
      {/* --- Collapsible Header --- */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-6 py-4 bg-white hover:bg-slate-50/50 transition-colors text-left group"
      >
        <div className="flex flex-col items-start">
          <h4 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Request History
            {!loading && actionableCount > 0 ? (
                // Only show red if ACTUAL action is required (Open + No Reply + Not Resolved)
                <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full text-xs font-bold animate-pulse">
                   <Icons.Alert />
                   Action Required
                </span>
            ) : !loading && (
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    filteredRows.length > 0 ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-400"
                }`}>
                    {filteredRows.length}
                </span>
            )}
          </h4>
          <p className="text-sm text-slate-500 mt-1">Communications regarding Milestone {idx + 1}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`transform transition-transform duration-300 text-slate-400 group-hover:text-slate-600 ${isExpanded ? "rotate-180" : ""}`}>
             <Icons.ChevronDown />
          </div>
        </div>
      </button>

      {/* --- Expandable Content --- */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/30 px-6 pb-6 pt-4">
            
          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center space-y-3 text-slate-400 animate-pulse py-8">
                <div className="h-2 w-1/3 bg-slate-200 rounded"></div>
                <div className="h-2 w-1/4 bg-slate-200 rounded"></div>
            </div>
          )}

          {/* Error State */}
          {!loading && err && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {err}
            </div>
          )}

          {!loading && !err && (
            <>
              <div className="flex justify-end mb-4">
                <button
                    onClick={load}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-colors"
                >
                    <Icons.Refresh />
                    Refresh Thread
                </button>
              </div>

              {/* --- Tabs --- */}
              {showTabs && (
                <div className="mb-6 flex overflow-x-auto pb-2 no-scrollbar gap-2 border-b border-slate-100">
                  {allMilestones.map((mi) => (
                    <button
                      key={mi}
                      onClick={() => setActiveMilestoneIndex(mi)}
                      className={[
                        "relative px-4 py-2 rounded-t-lg text-sm font-medium transition-all duration-200",
                        mi === idx
                          ? "text-slate-900 bg-white border-x border-t border-slate-100 shadow-[0_-2px_6px_-2px_rgba(0,0,0,0.02)] z-10"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-50/50",
                      ].join(" ")}
                    >
                      Milestone {mi + 1}
                      {mi === idx && <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-white" />}
                    </button>
                  ))}
                </div>
              )}

              {/* --- Empty State --- */}
              {!filteredRows.length && (
                <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-white">
                  <div className="mx-auto w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-3">
                    <Icons.CheckCircle />
                  </div>
                  <p className="text-slate-500 text-sm">No change requests found for this milestone.</p>
                </div>
              )}

              {/* --- List --- */}
              <ol className="space-y-8">
                {filteredRows.map((cr) => {
                  const responses = Array.isArray(cr.responses) ? cr.responses : [];
                  const draft = drafts[cr.id];
                  const sending = !!draft?.sending;
                  
                  // ROBUST STATUS LOGIC:
                  // 1. If status is 'resolved' OR resolvedAt is present, it's Resolved.
                  const isResolved = cr.status === "resolved" || !!cr.resolvedAt;
                  // 2. If not resolved, check strictly for 'open'.
                  const isStatusOpen = !isResolved && cr.status === "open";
                  const hasReplied = responses.length > 0;

                  // "Action Required" = Open AND Not Resolved AND No Reply.
                  const isActionRequired = isStatusOpen && !hasReplied;
                  // "Waiting for Review" = Open AND Not Resolved AND Has Reply.
                  const isPendingReview = isStatusOpen && hasReplied;

                  return (
                    <li key={cr.id} className={`group relative bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                        isActionRequired ? "border-red-200 ring-1 ring-red-100" : "border-slate-200"
                    }`}>
                      
                      {/* Card Header */}
                      <div className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3 ${
                          isActionRequired 
                            ? "bg-red-50/30 border-red-100" 
                            : "bg-slate-50/50 border-slate-100"
                      }`}>
                        <div className="flex items-center gap-3">
                           {isActionRequired ? (
                                <div className="text-red-500 animate-pulse">
                                     <Icons.Alert />
                                </div>
                           ) : isPendingReview ? (
                                <div className="text-amber-500">
                                     <Icons.Clock />
                                </div>
                           ) : (
                                <Icons.CheckCircle />
                           )}
                          <div className="flex flex-col">
                             <div className="flex items-center gap-2">
                                 <span className="text-sm font-semibold text-slate-900">Change Request #{cr.id}</span>
                                 {isActionRequired && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
                             </div>
                             <span className="text-xs text-slate-500 tabular-nums">
                                {new Date(cr.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}
                             </span>
                          </div>
                        </div>
                        
                        {/* BADGE LOGIC */}
                        {isActionRequired ? (
                            <div className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 shadow-sm">
                                ACTION REQUIRED
                            </div>
                        ) : isPendingReview ? (
                            <div className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                WAITING FOR REVIEW
                            </div>
                        ) : (
                            <div className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                RESOLVED
                            </div>
                        )}
                      </div>

                      <div className="p-6">
                        {/* Admin Original Request */}
                        <div className="flex gap-4 mb-8">
                            <div className="flex-shrink-0 mt-1">
                                <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-sm">
                                    <Icons.AdminUser />
                                </div>
                            </div>
                            <div className="flex-grow">
                                <div className="bg-slate-50 border border-slate-100 rounded-xl rounded-tl-none p-4 text-sm text-slate-800 shadow-sm relative">
                                    {cr.comment && <p className="whitespace-pre-wrap leading-relaxed">{cr.comment}</p>}
                                    {cr.checklist?.length ? (
                                        <div className="mt-3 space-y-2">
                                            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Action Items</div>
                                            <ul className="space-y-2">
                                            {cr.checklist.map((c, i) => (
                                                <li key={i} className="flex items-start gap-2 text-slate-700">
                                                    <input type="checkbox" disabled className="mt-1 rounded border-slate-300 text-slate-900 focus:ring-0" />
                                                    <span className="opacity-80">{c}</span>
                                                </li>
                                            ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        {/* Thread / Timeline */}
                        {responses.length > 0 && (
                          <div className="relative ml-4 pl-8 border-l-2 border-slate-100 space-y-8 mb-8">
                            {responses.map((resp, idx) => (
                              <div key={idx} className="relative group/item">
                                <div className="absolute -left-[39px] top-0 w-5 h-5 rounded-full bg-white border-2 border-blue-500 ring-4 ring-white"></div>
                                
                                <div className="flex items-baseline justify-between mb-1">
                                    <span className="text-xs font-bold text-slate-900">Vendor Reply</span>
                                    <span className="text-xs text-slate-400 tabular-nums">{new Date(resp.createdAt).toLocaleString()}</span>
                                </div>

                                {resp.note && (
                                  <div className="text-sm text-slate-700 whitespace-pre-wrap bg-white mb-3">
                                    {resp.note}
                                  </div>
                                )}
                                
                                {resp.files?.length > 0 && (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {resp.files.map((f, i) => {
                                      const href = toUrl(f);
                                      const img = isImageHref(href);
                                      return img ? (
                                        <a
                                          key={i}
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="group/img relative block aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shadow-sm hover:shadow-md transition-all"
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={href}
                                            alt={f.name || "image"}
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110"
                                          />
                                          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors" />
                                        </a>
                                      ) : (
                                        <a
                                          key={i}
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex flex-col p-3 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 transition-colors group/file"
                                        >
                                          <div className="flex items-center justify-between mb-2 text-slate-400 group-hover/file:text-blue-500">
                                             <Icons.File />
                                             <Icons.ExternalLink />
                                          </div>
                                          <span className="text-xs font-medium text-slate-700 truncate w-full">{f.name || "Attachment"}</span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply Input Area (Only if Open) */}
                        {isStatusOpen && (
                          <div className="mt-6 bg-slate-50 rounded-xl border border-slate-200 p-1">
                            <textarea
                              className="w-full bg-white rounded-lg border-0 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 min-h-[100px] resize-y"
                              placeholder="Write your response here..."
                              value={draft?.message ?? ""}
                              onChange={(e) => setDraft(cr.id, { message: e.target.value })}
                              disabled={sending}
                            />
                            
                            <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center">
                                    <label className="cursor-pointer inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                                        <div className="relative">
                                            <input
                                                type="file"
                                                multiple
                                                onChange={(e) => setDraft(cr.id, { files: Array.from(e.target.files ?? []) })}
                                                disabled={sending}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                            <div className="flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-slate-200/50">
                                                <Icons.Attachment />
                                                <span>Attach Files</span>
                                            </div>
                                        </div>
                                    </label>
                                     {!!draft?.files?.length && (
                                        <span className="ml-3 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                            {draft.files.length} file{draft.files.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                     <button
                                        type="button"
                                        onClick={() =>
                                            setDrafts((prev) => {
                                            const n = { ...prev };
                                            delete n[cr.id];
                                            return n;
                                            })
                                        }
                                        disabled={sending || (!draft?.message && !draft?.files?.length)}
                                        className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 transition-colors"
                                        >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => submitReply(cr)}
                                        disabled={sending}
                                        className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                                    >
                                        {sending ? (
                                            <>Sending...</>
                                        ) : (
                                            <>
                                                <span>Send Reply</span>
                                                <Icons.Send />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                            {!!draft?.error && (
                                <div className="mx-3 mb-3 p-2 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">
                                    {draft.error}
                                </div>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
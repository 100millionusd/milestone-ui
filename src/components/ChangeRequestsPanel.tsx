"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";

type CRResponseFile = { url?: string; cid?: string; name?: string };
type CRResponse = {
  id: number; // proof id (or -1 if none)
  createdAt: string; // first file time in the window
  note?: string | null; // latest proof note if any
  files: CRResponseFile[];
};
type ChangeRequestRow = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  status: "open" | "resolved" | string;
  comment: string | null;
  checklist: string[]; // stored as string[] in Prisma
  createdAt: string;
  resolvedAt: string | null;
  responses?: CRResponse[]; // ← from API when include=responses
};

const PINATA_GATEWAY =
  typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String((process as any).env.NEXT_PUBLIC_PINATA_GATEWAY)
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")}/ipfs`
    : typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_IPFS_GATEWAY
    ? String((process as any).env?.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, "")
    : "https://gateway.pinata.cloud/ipfs";

function toUrl(f: CRResponseFile) {
  if (f?.url && /^https?:\/\//i.test(f.url)) return f.url;
  if (f?.url) return `https://${f.url.replace(/^https?:\/\//, "")}`;
  if (f?.cid) return `${PINATA_GATEWAY}/${f.cid}`;
  return "#";
}

function isImageHref(href: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(href);
}

type Props = {
  proposalId: number;
  initialMilestoneIndex?: number;
  // hard scoping from parent:
  forceMilestoneIndex?: number;
  hideMilestoneTabs?: boolean;
};

type Draft = { message: string; files: File[]; sending?: boolean; error?: string };

export default function ChangeRequestsPanel(props: Props) {
  const {
    proposalId,
    initialMilestoneIndex = 0,
    forceMilestoneIndex,
    hideMilestoneTabs,
  } = props;

  // keep local state for tabs when not forced
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(initialMilestoneIndex);

  // Allow URL to set default milestone: ?ms=4 or ?milestone=4
  useEffect(() => {
    if (typeof forceMilestoneIndex === "number") return;
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get("ms") ?? url.searchParams.get("milestone");
      const n = q ? Number(q) : NaN;
      if (Number.isFinite(n) && n >= 0) setActiveMilestoneIndex(n);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FINAL index used everywhere
  const idx = typeof forceMilestoneIndex === "number" ? forceMilestoneIndex : activeMilestoneIndex;

  const [rows, setRows] = useState<ChangeRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Draft replies per-CR
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});

  // Guards to prevent stampedes and event echo loops
  const loadingRef = useRef(false);
  const lastLoadTs = useRef(0);

  const load = useCallback(async () => {
    if (!Number.isFinite(proposalId)) return;
    if (loadingRef.current) return; // dedupe overlapping triggers

    loadingRef.current = true;
    setLoading(true);
    setErr(null);
    try {
      // Build URL and pass milestoneIndex ONLY when the parent forces it
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

      // --- Auto-focus a milestone that actually has CRs (only if not forced) ---
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

  // on mount & when proposal OR effective milestone index changes
  useEffect(() => {
    load();
  }, [load, proposalId, idx]);

  // Listen for external updates; now ONLY reload on targeted events for this proposal
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

  // Narrow to the currently scoped milestone
  const filteredRows = useMemo(
    () => (rows || []).filter((cr) => (cr.milestoneIndex ?? (cr as any).milestone_index ?? 0) === idx),
    [rows, idx]
  );

  // Optional tabs only when NOT forced and not hidden
  const allMilestones = useMemo(
    () => Array.from(new Set((rows || []).map((r) => r.milestoneIndex))).sort((a, b) => a - b),
    [rows]
  );

  const showTabs = !hideMilestoneTabs && typeof forceMilestoneIndex !== "number" && allMilestones.length > 1;

  // -------------------- helpers --------------------
  const setDraft = useCallback((crId: number, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [crId]: { message: "", files: [], ...prev[crId], ...patch } }));
  }, []);

  // Upload selected files to your existing Pinata-backed endpoint, return [{ name, cid, url }]
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
  if (loading) return <div className="mt-4 text-sm text-gray-500">Loading change requests…</div>;
  if (err) return <div className="mt-4 text-sm text-rose-600">{err}</div>;

  if (!filteredRows.length) {
    return (
      <div className="mt-4 p-4 border rounded-xl bg-white text-sm text-gray-500 shadow-sm">
        No change requests yet for <span className="font-medium">Milestone {idx + 1}</span>.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-base font-semibold tracking-tight">Change Request Thread</h4>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg text-sm bg-slate-900 text-white shadow-sm hover:opacity-95 active:opacity-90"
        >
          Refresh
        </button>
      </div>

      {showTabs && (
        <div className="mb-4 flex flex-wrap gap-2">
          {allMilestones.map((mi) => (
            <button
              key={mi}
              onClick={() => setActiveMilestoneIndex(mi)}
              className={[
                "px-3 py-1.5 rounded-full text-xs border transition",
                mi === idx
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
              ].join(" ")}
            >
              Milestone {mi + 1}
            </button>
          ))}
        </div>
      )}

      <ol className="space-y-5">
        {filteredRows.map((cr) => {
          const responses = Array.isArray(cr.responses) ? cr.responses : [];
          const draft = drafts[cr.id];
          const sending = !!draft?.sending;

          const statusClasses =
            cr.status === "open"
              ? "border-amber-400 bg-amber-50/60"
              : "border-emerald-500 bg-emerald-50/60";

          return (
            <li key={cr.id} className={`group relative border rounded-xl p-4 ps-5 shadow-sm ${statusClasses} border-s-4`}>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="font-medium">Milestone {Number(cr.milestoneIndex) + 1}</span>
                  <span className="opacity-50">•</span>
                  <time className="tabular-nums">{new Date(cr.createdAt).toLocaleString()}</time>
                </div>
                <span
                  className={[
                    "px-2.5 py-1 rounded-full text-xs font-medium border",
                    cr.status === "open"
                      ? "bg-amber-100 text-amber-900 border-amber-200"
                      : "bg-emerald-100 text-emerald-900 border-emerald-200",
                  ].join(" ")}
                >
                  {cr.status}
                </span>
              </div>

              {/* Admin request body */}
              {(cr.comment || (cr.checklist && cr.checklist.length)) && (
                <div className="mt-3 p-3 rounded-lg bg-white/70 border text-sm">
                  {cr.comment && <p className="mb-2 whitespace-pre-wrap text-slate-800">{cr.comment}</p>}
                  {cr.checklist?.length ? (
                    <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                      {cr.checklist.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}

              {/* Vendor replies */}
              {responses.length > 0 ? (
                <div className="mt-4">
                  <div className="relative pl-4">
                    <div className="absolute left-0 top-1.5 bottom-1.5 w-px bg-slate-300/70" />
                    {responses.map((resp, idx) => (
                      <div key={idx} className="relative ps-4 pb-4">
                        <div className="absolute left-[-7px] top-1.5 h-3 w-3 rounded-full bg-slate-400" />
                        <div className="text-xs text-gray-500">
                          Vendor reply at {new Date(resp.createdAt).toLocaleString()}
                        </div>
                        {resp.note && (
                          <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{resp.note}</div>
                        )}
                        {resp.files?.length ? (
                          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                            {resp.files.map((f, i) => {
                              const href = toUrl(f);
                              const img = isImageHref(href);
                              return img ? (
                                <a
                                  key={i}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group relative overflow-hidden rounded-lg border bg-white/60"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={href}
                                    alt={f.name || "image"}
                                    className="h-28 w-full object-cover group-hover:scale-[1.02] transition"
                                  />
                                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                                    {f.name || href.split("/").pop()}
                                  </div>
                                </a>
                              ) : (
                                <div key={i} className="p-2 rounded-lg border bg-white/70 text-xs">
                                  <div className="truncate mb-1">
                                    {f.name || href.split("/").pop()}
                                  </div>
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                  >
                                    Open
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                      <path d="M15 3h6v6" />
                                      <path d="M10 14 21 3" />
                                    </svg>
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-gray-500">No files in this reply.</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-xs text-gray-500">No vendor reply yet.</div>
              )}

              {/* Reply form (only when CR is open) */}
              {cr.status === "open" && (
                <div className="mt-4 p-4 border rounded-xl bg-white/80">
                  <label className="block text-sm font-medium text-slate-800">Your answer</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    rows={3}
                    placeholder="Write your answer to the admin’s request…"
                    value={draft?.message ?? ""}
                    onChange={(e) => setDraft(cr.id, { message: e.target.value })}
                    disabled={sending}
                  />

                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="file"
                      multiple
                      onChange={(e) => setDraft(cr.id, { files: Array.from(e.target.files ?? []) })}
                      className="text-sm"
                      disabled={sending}
                    />
                    {!!draft?.files?.length && (
                      <div className="text-xs text-gray-600">{draft.files.length} file(s) selected</div>
                    )}
                  </div>

                  {!!draft?.error && <div className="mt-2 text-xs text-rose-600">{draft.error}</div>}

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => submitReply(cr)}
                      disabled={sending}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm shadow-sm disabled:opacity-60"
                    >
                      {sending ? "Sending…" : "Send answer"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDrafts((prev) => {
                          const n = { ...prev };
                          delete n[cr.id];
                          return n;
                        })
                      }
                      disabled={sending}
                      className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-60"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// src/lib/api.ts

// ---- Types ----
export interface Proposal {
  proposalId: number;
  orgName: string;
  title: string;
  summary: string;
  contact: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  amountUSD: number;
  docs: any[];
  cid: string | null;
  status: "pending" | "approved" | "rejected" | "completed" | "archived";
  createdAt: string;
  ownerWallet?: string | null;
  ownerEmail?: string | null;
  updatedAt?: string;
}

export interface Milestone {
  name: string;
  amount: number;
  dueDate: string;
  completed?: boolean;
  completionDate?: string | null;
  proof?: string;
  paymentTxHash?: string | null;
  paymentDate?: string | null;

  // NEW — keep archive state coming from server
  archived?: boolean;
  archivedAt?: string | null;
  archiveReason?: string | null;
}

export interface Bid {
  bidId: number;
  proposalId: number;
  vendorName: string;
  priceUSD: number;
  days: number;
  notes: string;
  walletAddress: string;
  preferredStablecoin: "USDT" | "USDC";
  milestones: Milestone[];
  doc: any | null;
  status: "pending" | "approved" | "completed" | "rejected" | "archived";
  createdAt: string;
  aiAnalysis?: any;
}

export interface TransactionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  amount?: number;
  toAddress?: string;
  currency?: string;
}

export interface Proof {
  proofId?: number;
  bidId: number;
  milestoneIndex: number;
  vendorName: string;
  walletAddress: string;
  title: string;
  description: string;
  files: { name: string; url: string }[];
  status: "pending" | "approved" | "rejected" | "archived";
  submittedAt: string;
  aiAnalysis?: any;
}

/** Read-only public project view */
export interface PublicProject {
  bidId: number;
  proposalId: number;
  proposalTitle: string;
  orgName: string;
  vendorName: string;
  priceUSD: number;

  // Optional curated public content from server
  publicTitle?: string | null;
  publicSummary?: string | null;

  // Reuse your Milestone type and keep an index + "public" flag if provided
  milestones: Array<Milestone & { index: number; public?: boolean }>;

  // Only the curated/read-only proof fields needed for public display
  proofs: Array<{
    proofId?: number;
    milestoneIndex: number;
    title: string;
    publicText?: string | null;
    files: { name: string; url: string }[];
    submittedAt?: string | null;
  }>;

  updatedAt?: string | null;
}

export interface AuthInfo {
  address?: string;
  role: "admin" | "vendor" | "guest";
}

/** ✅ NEW: Admin vendor directory row */
export interface VendorSummary {
  vendorName: string;
  walletAddress: string;
  bidsCount: number;
  lastBidAt?: string | null;
  totalAwardedUSD: number;
}

/** ✅ NEW: Admin proposer/entity rollup row */
export interface ProposerSummary {
  orgName: string;

  // location
  address?: string | null;
  city?: string | null;
  country?: string | null;

  // contacts
  primaryEmail?: string | null;   // e.g. contactEmail
  ownerEmail?: string | null;
  ownerWallet?: string | null;

  // counts
  proposalsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;

  // money + recency
  totalBudgetUSD: number;
  lastActivityAt?: string | null;
}

/** Admin: identify an entity by any of these keys */
export type EntitySelector = {
  orgName?: string | null;
  contactEmail?: string | null;
  ownerWallet?: string | null;
};

/** ✅ NEW: Chat message type for SSE chat */
export type ChatMsg = { role: "user" | "assistant"; content: string };

// ---- Env-safe API base resolution ----
const DEFAULT_API_BASE = "https://milestone-api-production.up.railway.app";

function getApiBase(): string {
  if (typeof window === "undefined") {
    const s =
      (typeof process !== "undefined" && (process as any).env?.API_BASE_URL) ||
      (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_API_BASE_URL) ||
      (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_API_BASE) ||
      DEFAULT_API_BASE;
    return (s || DEFAULT_API_BASE).replace(/\/+$/, "");
  }
  const c =
    (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_API_BASE_URL) ||
    (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_API_BASE) ||
    DEFAULT_API_BASE;
  return (c || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export const API_BASE = getApiBase();
const trimSlashEnd = (s: string) => s.replace(/\/+$/, "");
const isBrowser = typeof window !== "undefined";

// ---- Helpers ----
function coerceJson(val: any) {
  if (!val) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return val;
}

function toIso(d: any): string {
  try {
    return new Date(d).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function getJwt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("lx_jwt");
  } catch {
    return null;
  }
}

function setJwt(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem("lx_jwt", token);
    else localStorage.removeItem("lx_jwt");
  } catch {}
}

function isAuthError(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    /\b401\b/.test(msg) ||
    /\b403\b/.test(msg)
  );
}

// ---- Small cache for /auth/role (to avoid duplicate calls) ----
let __roleCache: { value: AuthInfo; ts: number } | null = null;
let __roleInflight: Promise<AuthInfo> | null = null;
const ROLE_TTL = 60_000; // 60s

function __clearRoleCache() {
  __roleCache = null;
  __roleInflight = null;
}

// ---- Safari-safe fetch fallback (external → same-origin → /api) ----
async function fetchWithFallback(path: string, init: RequestInit): Promise<Response> {
  // path must start with "/"
  const p = path.startsWith("/") ? path : `/${path}`;
  const bases: string[] = [];

  if (!isBrowser) {
    bases.push(trimSlashEnd(API_BASE)); // server-side: only external
  } else {
    // 1) external (your current default)
    bases.push(trimSlashEnd(API_BASE));
    // 2) same-origin (requires rewrites like /auth, /bids, /vendor, /proposals, /proofs, /admin, /ipfs)
    bases.push("");
    // 3) same-origin "/api" (if your rewrites use /api/:path*)
    bases.push("/api");
  }

  let lastResp: Response | null = null;

  for (const b of bases) {
    const url = `${b}${p}`;
    try {
      const resp = await fetch(url, init);
      if (resp.ok) return resp;

      // Only fall through on the auth-ish failures (Safari third‑party cookies → 401/403)
      // and "route not found" (404 when rewrites don’t match this style).
      if ([401, 403, 404].includes(resp.status)) {
        lastResp = resp;
        continue;
      }
      // For other statuses (e.g. 500), don't keep trying different bases.
      return resp;
    } catch {
      // Network error — try next base.
      continue;
    }
  }

  // If we get here, nothing succeeded; throw using the last response status if we have it.
  if (lastResp) {
    const status = lastResp.status;
    let msg = `HTTP ${status}`;
    try {
      const j = await lastResp.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  throw new Error("Failed to fetch");
}

// ---- JSON Fetch helper ----
async function apiFetch(path: string, options: RequestInit = {}) {
  const method = (options.method || "GET").toUpperCase();

  // Bust caches on GETs
  let fullPath = path;
  if (method === "GET") {
    const sep = path.includes("?") ? "&" : "?";
    fullPath = `${path}${sep}_ts=${Date.now()}`;
  }

  // Your existing helpers
  const token = getJwt();
  const callerCT =
    (options.headers as any)?.["Content-Type"] ||
    (options.headers as any)?.["content-type"];
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: "application/json",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as any),
  };
  if (!callerCT && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = {
    ...options,
    cache: "no-store",
    mode: "cors",
    redirect: "follow",
    credentials: "include",
    headers,
  };

  const r = await fetchWithFallback(fullPath, init);

  // ✅ NEW: global unauthorized handler
  if (r.status === 401 || r.status === 403) {
    // drop the token your file already stores under "lx_jwt"
    setJwt(null);
    // optional: try server logout if you expose it
    // try { await fetchWithFallback('/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}

    // client-side redirect to login (don’t loop if already there)
    if (typeof window !== "undefined") {
      const next = location.pathname + location.search;
      if (!/\/login\b/.test(next)) {
        location.assign(`/login?next=${encodeURIComponent(next)}`);
      }
    }
    throw new Error(`HTTP ${r.status}`);
  }

  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;

  try {
    return await r.json();
  } catch {
    return null;
  }
}

// ---- POST helper ----
export const postJSON = async <T = any>(path: string, data: any): Promise<T> => {
  return apiFetch(path, { method: "POST", body: JSON.stringify(data) });
};

// ---- Auth ----
export async function getAuthRole(): Promise<AuthInfo> {
  const now = Date.now();

  // serve fresh cached value
  if (__roleCache && now - __roleCache.ts < ROLE_TTL) {
    return __roleCache.value;
  }

  // de-dupe concurrent calls
  if (__roleInflight) return __roleInflight;

  __roleInflight = (async () => {
    try {
      const info = await apiFetch("/auth/role");
      const role = (info?.role ?? "guest") as AuthInfo["role"];
      const address = typeof info?.address === "string" ? info.address : undefined;
      const value: AuthInfo = { address, role };
      __roleCache = { value, ts: Date.now() };
      return value;
    } catch {
      const value: AuthInfo = { role: "guest" };
      __roleCache = { value, ts: Date.now() };
      return value;
    } finally {
      __roleInflight = null;
    }
  })();

  return __roleInflight;
}

/**
 * Exchange a signed nonce for a JWT cookie (and token).
 * Call flow:
 *  1) GET/POST /auth/nonce to get `nonce` for your wallet address
 *  2) Sign that `nonce` with the wallet
 *  3) Call loginWithSignature(address, signature)
 * Returns `{ role }` and stores `token` to localStorage (lx_jwt) for Bearer fallback.
 */
export async function loginWithSignature(address: string, signature: string) {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ address, signature }),
  });
    // server returns { token, role }
  if (res?.token) setJwt(res.token);
  __clearRoleCache(); // ensure next getAuthRole() refetches
  return { role: (res?.role as AuthInfo["role"]) || "vendor" };
  }

/** Clears cookie on server and local JWT cache */
export async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {}
    setJwt(null);
  __clearRoleCache(); // invalidate cached role
}

// ---- Normalizers ----
function toProposal(p: any): Proposal {
  const rawId = p?.proposalId ?? p?.proposal_id ?? p?.id ?? p?.proposalID;

  const parsedId =
    typeof rawId === "number" ? rawId : rawId != null && rawId !== "" ? Number(rawId) : NaN;

  return {
    proposalId: Number.isFinite(parsedId) ? parsedId : NaN,
    orgName: p?.orgName ?? p?.org_name ?? p?.organization ?? "",
    title: p?.title ?? "",
    summary: p?.summary ?? p?.description ?? "",
    contact: p?.contact ?? p?.contact_email ?? "",
    address: p?.address ?? null,
    city: p?.city ?? null,
    country: p?.country ?? null,
    amountUSD: Number(p?.amountUSD ?? p?.amount_usd ?? p?.amount) || 0,
    docs: Array.isArray(p?.docs) ? p.docs : [],
    cid: p?.cid ?? null,
    status: (p?.status as Proposal["status"]) ?? "pending",
    createdAt: p?.createdAt ?? p?.created_at ?? new Date().toISOString(),
    ownerWallet: p?.ownerWallet ?? p?.owner_wallet ?? null,
    ownerEmail:  p?.ownerEmail  ?? p?.owner_email  ?? null,
    updatedAt:   p?.updatedAt   ?? p?.updated_at   ?? undefined,
  };
}

function coerceAnalysis(a: any) {
  if (!a) return null;
  if (typeof a === "string") {
    try {
      return JSON.parse(a);
    } catch {
      return null;
    }
  }
  return a;
}

function toMilestones(raw: any): Milestone[] {
  let arr: any[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }

  return arr.map((m: any) => ({
    name: m?.name ?? "",
    amount: Number(m?.amount ?? 0),
    dueDate: toIso(m?.dueDate ?? m?.due_date ?? new Date().toISOString()),
    completed: !!m?.completed,
    completionDate: m?.completionDate ?? null,
    proof: m?.proof ?? "",
    paymentTxHash: m?.paymentTxHash ?? null,
    paymentDate: m?.paymentDate ?? null,

    // NEW — do not drop archive flags
    archived: (m?.archived ?? m?.archived_flag ?? false) ? true : false,
    archivedAt: m?.archivedAt ?? m?.archived_at ?? null,
    archiveReason: m?.archiveReason ?? m?.archive_reason ?? null,
  }));
}

function toBid(b: any): Bid {
  const bidId = b?.bidId ?? b?.bid_id ?? b?.id;
  const proposalId = b?.proposalId ?? b?.proposal_id ?? b?.proposalID ?? b?.proposal;
  const aiRaw = b?.aiAnalysis ?? b?.ai_analysis;

  return {
    bidId: Number(bidId),
    proposalId: Number(proposalId),
    vendorName: b?.vendorName ?? b?.vendor_name ?? "",
    priceUSD: Number(b?.priceUSD ?? b?.price_usd ?? b?.price) || 0,
    days: Number(b?.days) || 0,
    notes: b?.notes ?? "",
    walletAddress: b?.walletAddress ?? b?.wallet_address ?? "",
    preferredStablecoin: (b?.preferredStablecoin ??
      b?.preferred_stablecoin) as Bid["preferredStablecoin"],
    milestones: toMilestones(b?.milestones),
    doc: coerceJson(b?.doc),
    status: (b?.status as Bid["status"]) ?? "pending",
    createdAt: b?.createdAt ?? b?.created_at ?? new Date().toISOString(),
    aiAnalysis: coerceAnalysis(aiRaw),
  };
}

function toProof(p: any): Proof {
  return {
    proofId: Number(p?.proofId ?? p?.id ?? p?.proof_id) || undefined,
    bidId: Number(p?.bidId ?? p?.bid_id),
    milestoneIndex: Number(p?.milestoneIndex ?? p?.milestone_index),
    vendorName: p?.vendorName ?? p?.vendor_name ?? "",
    walletAddress: p?.walletAddress ?? p?.wallet_address ?? "",
    title: p?.title ?? "",
    description: p?.description ?? "",
    files: Array.isArray(p?.files) ? p.files : [],
    status: p?.status ?? "pending",
    submittedAt: p?.submittedAt ?? p?.submitted_at ?? new Date().toISOString(),
    aiAnalysis: coerceAnalysis(p?.aiAnalysis ?? p?.ai_analysis),
  };
}

function toPublicProject(raw: any): PublicProject {
  const bid = raw?.bid ?? raw ?? {};
  const proposal = raw?.proposal ?? raw?.project ?? {};
  const proofsArr: any[] = Array.isArray(raw?.proofs) ? raw.proofs : [];

  // milestones can be on raw.bid.milestones or raw.milestones
  const msRaw: any[] = Array.isArray(bid?.milestones) ? bid.milestones
                    : Array.isArray(raw?.milestones) ? raw.milestones
                    : [];

  const milestones = msRaw.map((m: any, idx: number) => ({
    ...{
      name: m?.name ?? "",
      amount: Number(m?.amount ?? 0),
      dueDate: (m?.dueDate ?? m?.due_date) ? new Date(m?.dueDate ?? m?.due_date).toISOString() : new Date().toISOString(),
      completed: !!m?.completed,
      completionDate: m?.completionDate ?? null,
      proof: m?.proof ?? "",
      paymentTxHash: m?.paymentTxHash ?? null,
      paymentDate: m?.paymentDate ?? null,
      archived: (m?.archived ?? m?.archived_flag ?? false) ? true : false,
      archivedAt: m?.archivedAt ?? m?.archived_at ?? null,
      archiveReason: m?.archiveReason ?? m?.archive_reason ?? null,
    },
    index: Number.isInteger(m?.index) ? Number(m.index) : idx,
    public: !!(m?.public ?? m?.is_public ?? false),
  }));

  const proofs = proofsArr.map((p: any) => ({
    proofId: typeof p?.proofId === "number" ? p.proofId
          : typeof p?.id === "number" ? p.id
          : undefined,
    milestoneIndex: Number(p?.milestoneIndex ?? p?.milestone_index ?? 0),
    title: p?.title ?? "",
    publicText: p?.publicText ?? p?.public_text ?? null,
    files: Array.isArray(p?.publicFiles ?? p?.public_files)
      ? (p.publicFiles ?? p.public_files).map((f: any) => ({
          name: String(f?.name ?? "file"),
          url: String(f?.url ?? ""),
        }))
      : [],
    submittedAt: p?.submittedAt ?? p?.submitted_at ?? null,
  }));

  return {
    bidId: Number(bid?.bidId ?? bid?.bid_id ?? bid?.id ?? raw?.bidId ?? raw?.id ?? 0),
    proposalId: Number(proposal?.proposalId ?? proposal?.proposal_id ?? raw?.proposalId ?? 0),
    proposalTitle: proposal?.public_title ?? proposal?.publicTitle ?? proposal?.title ?? "",
    orgName: proposal?.orgName ?? proposal?.org_name ?? "",
    vendorName: bid?.vendorName ?? bid?.vendor_name ?? "",
    priceUSD: Number(bid?.priceUSD ?? bid?.price_usd ?? bid?.price ?? 0),

    publicTitle: proposal?.public_title ?? proposal?.publicTitle ?? null,
    publicSummary: proposal?.public_summary ?? proposal?.publicSummary ?? null,

    milestones,
    proofs,

    updatedAt: raw?.updatedAt ?? raw?.updated_at ?? bid?.updatedAt ?? bid?.updated_at ?? null,
  };
}

// ---- Proposals (open to all) ----
export async function listProposals(params?: {
  status?: Proposal["status"] | string;
  includeArchived?: boolean;
}): Promise<Proposal[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", String(params.status));
  if (params?.includeArchived) q.set("includeArchived", "true");
  const rows = await apiFetch(`/proposals${q.toString() ? `?${q.toString()}` : ""}`);
  return (Array.isArray(rows) ? rows : []).map(toProposal);
}

export async function getProposals(): Promise<Proposal[]> {
  return listProposals();
}

export async function getProposal(id: number): Promise<Proposal> {
  const p = await apiFetch(`/proposals/${encodeURIComponent(String(id))}`);
  return toProposal(p);
}

export async function createProposal(
  proposal: Omit<Proposal, "proposalId" | "status" | "createdAt" | "cid">
): Promise<Proposal> {
  const p = await apiFetch("/proposals", {
    method: "POST",
    body: JSON.stringify(proposal),
  });
  return toProposal(p);
}

export async function approveProposal(id: number): Promise<Proposal> {
  if (!Number.isFinite(id)) throw new Error("Invalid proposal ID");
  const p = await apiFetch(`/proposals/${encodeURIComponent(String(id))}/approve`, {
    method: "POST",
  });
  return toProposal(p);
}

export async function rejectProposal(id: number): Promise<Proposal> {
  if (!Number.isFinite(id)) throw new Error("Invalid proposal ID");
  const p = await apiFetch(`/proposals/${encodeURIComponent(String(id))}/reject`, {
    method: "POST",
  });
  return toProposal(p);
}

export async function archiveProposal(id: number): Promise<Proposal> {
  if (!Number.isFinite(id)) throw new Error("Invalid proposal ID");
  const p = await apiFetch(`/proposals/${encodeURIComponent(String(id))}/archive`, {
    method: "POST",
  });
  return toProposal(p);
}

export async function deleteProposal(id: number): Promise<boolean> {
  if (!Number.isFinite(id)) throw new Error("Invalid proposal ID");
  await apiFetch(`/proposals/${encodeURIComponent(String(id))}`, { method: "DELETE" });
  return true;
}

// Update a proposal (admin or owner)
export async function updateProposal(id: number, changes: Partial<Proposal>): Promise<Proposal> {
  if (!Number.isFinite(id)) throw new Error("Invalid proposal ID");
  const p = await apiFetch(`/proposals/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
  return toProposal(p);
}

// List proposals owned by the logged-in user
export async function getMyProposals(): Promise<Proposal[]> {
  const rows = await apiFetch(`/proposals/mine`);
  return (Array.isArray(rows) ? rows : []).map(toProposal);
}

// ---- Bids ----
export async function getBids(proposalId?: number): Promise<Bid[]> {
  const q = Number.isFinite(proposalId as number) ? `?proposalId=${proposalId}` : "";
  try {
    const rows = await apiFetch(`/bids${q}`);
    return (Array.isArray(rows) ? rows : []).map(toBid);
  } catch (e) {
    if (isAuthError(e)) return [];
    throw e;
  }
}

export async function getBid(id: number): Promise<Bid> {
  const b = await apiFetch(`/bids/${encodeURIComponent(String(id))}`);
  return toBid(b);
}

export async function createBid(
  bid: Omit<Bid, "bidId" | "status" | "createdAt" | "aiAnalysis">
): Promise<Bid> {
  const payload: any = { ...bid };
  payload.priceUSD = Number(payload.priceUSD);
  payload.days = Number(payload.days);
  payload.milestones = (payload.milestones || []).map((m: any) => ({
    name: m.name,
    amount: Number(m.amount),
    dueDate: toIso(m.dueDate),
  }));
  const b = await apiFetch("/bids", { method: "POST", body: JSON.stringify(payload) });
  return toBid(b);
}

export async function approveBid(id: number): Promise<Bid> {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  const b = await apiFetch(`/bids/${encodeURIComponent(String(id))}/approve`, {
    method: "POST",
  });
  return toBid(b);
}

export async function rejectBid(id: number): Promise<Bid> {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  const b = await apiFetch(`/bids/${encodeURIComponent(String(id))}/reject`, {
    method: "POST",
  });
  return toBid(b);
}

export async function archiveBid(id: number): Promise<Bid> {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  const b = await apiFetch(`/bids/${encodeURIComponent(String(id))}/archive`, {
    method: "POST",
  });
  return toBid(b);
}

export async function updateBidMilestones(id: number, milestones: Milestone[]): Promise<Bid> {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  const body = { milestones: milestones.map(m => ({
    name: m.name,
    amount: Number(m.amount),
    dueDate: m.dueDate,
    completed: !!m.completed,
    completionDate: m.completionDate ?? null,
    proof: m.proof ?? "",
    paymentTxHash: m.paymentTxHash ?? null,
    paymentDate: m.paymentDate ?? null,
  })) };
  const b = await apiFetch(`/bids/${encodeURIComponent(String(id))}/milestones`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return toBid(b);
}

export async function updateBid(
  id: number,
  patch: Partial<Pick<Bid, "preferredStablecoin" | "priceUSD" | "days" | "notes" | "status">>
): Promise<Bid> {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  const b = await apiFetch(`/bids/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return toBid(b);
}

export async function analyzeBid(id: number, prompt?: string): Promise<Bid> {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  // ✅ Always send a JSON body so server JSON parser runs (and to avoid proxy issues)
  const body = { prompt: (prompt ?? "").trim() || undefined };
  const b = await apiFetch(`/bids/${encodeURIComponent(String(id))}/analyze`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return toBid(b);
}

// ---- Vendor ----
export async function getVendorProfile(): Promise<any> {
  // returns the logged-in vendor’s profile from your backend
  return await apiFetch('/vendor/profile');
}

export async function getVendorBids(): Promise<Bid[]> {
  try {
    const rows = await apiFetch("/vendor/bids");
    return (Array.isArray(rows) ? rows : []).map(toBid);
  } catch (e) {
    if (isAuthError(e)) return [];
    throw e;
  }
}

export function completeMilestone(bidId: number, milestoneIndex: number, proof: string) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(`/bids/${encodeURIComponent(String(bidId))}/complete-milestone`, {
    method: "POST",
    body: JSON.stringify({ milestoneIndex, proof }),
  });
}

export async function getVendorPayments(): Promise<TransactionResult[]> {
  try {
    return await apiFetch("/vendor/payments");
  } catch (e) {
    if (isAuthError(e)) return [];
    throw e;
  }
}

// ---- Admin ----
export function adminCompleteMilestone(bidId: number, milestoneIndex: number, proof: string) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(`/bids/${encodeURIComponent(String(bidId))}/complete-milestone`, {
    method: "POST",
    body: JSON.stringify({ milestoneIndex, proof }),
  });
}

export function payMilestone(bidId: number, milestoneIndex: number) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(`/bids/${encodeURIComponent(String(bidId))}/pay-milestone`, {
    method: "POST",
    body: JSON.stringify({ milestoneIndex }),
  });
}

// keep older imports working by aliasing to payMilestone
export function sendTokens(params: {
  bidId: number;
  milestoneIndex: number;
  token?: string;               // accepted but unused by current API
  amount?: number | string;     // accepted but unused by current API
}) {
  return payMilestone(params.bidId, params.milestoneIndex);
}

// Reject a milestone’s proof (admin) — keep only this one
export function rejectMilestoneProof(
  bidId: number,
  milestoneIndex: number,
  reason?: string
) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0) {
    throw new Error("Invalid milestone index");
  }

  // Backend: POST /bids/:bidId/milestones/:idx/reject
  return apiFetch(
    `/bids/${encodeURIComponent(String(bidId))}/milestones/${encodeURIComponent(
      String(milestoneIndex)
    )}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason ?? "" }),
    }
  );
}

// Keep a named alias so any `import { rejectProof }` stays working
export { rejectMilestoneProof as rejectProof };

/** ✅ NEW: Admin — list all vendors (server must expose GET /admin/vendors) */
export async function getAdminVendors(): Promise<VendorSummary[]> {
  try {
    const rows = await apiFetch("/admin/vendors");
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      vendorName: r.vendorName ?? r.vendor_name ?? "",
      walletAddress: r.walletAddress ?? r.wallet_address ?? "",
      bidsCount: Number(r.bidsCount ?? r.bids_count ?? 0),
      lastBidAt: r.lastBidAt ?? r.last_bid_at ?? null,
      totalAwardedUSD: Number(r.totalAwardedUSD ?? r.total_awarded_usd ?? 0),
    }));
  } catch (e) {
    if (isAuthError(e)) return [];
    throw e;
  }
}

/** ✅ NEW: Admin — list all proposers/entities (server should expose GET /admin/proposers) */
export async function listProposers(): Promise<ProposerSummary[]> {
  try {
    const rows = await apiFetch("/admin/proposers");

    // Defensive mapping for snake_case / alt keys from server
    return (Array.isArray(rows) ? rows : []).map((r: any): ProposerSummary => ({
      orgName: r.orgName ?? r.org_name ?? r.organization ?? "",

      // address fields: accept either structured or one-line display from server
      address: r.address ?? r.addr_display ?? null,
      city: r.city ?? null,
      country: r.country ?? null,

      primaryEmail:
        r.primaryEmail ??
        r.primary_email ??
        r.contactEmail ??
        r.contact_email ??
        null,
      ownerEmail:  r.ownerEmail  ?? r.owner_email  ?? null,

      // 👇 add wallet_address fallback here
      ownerWallet: r.ownerWallet ?? r.owner_wallet ?? r.wallet_address ?? null,

      proposalsCount: Number(r.proposalsCount ?? r.proposals_count ?? r.count ?? 0),
      approvedCount:  Number(r.approvedCount  ?? r.approved_count  ?? 0),
      pendingCount:   Number(r.pendingCount   ?? r.pending_count   ?? 0),
      rejectedCount:  Number(r.rejectedCount  ?? r.rejected_count  ?? 0),

      totalBudgetUSD: Number(
        r.totalBudgetUSD ?? r.total_budget_usd ?? r.amountUSD ?? r.amount_usd ?? 0
      ),

      lastActivityAt:
        r.lastActivityAt ??
        r.last_activity_at ??
        r.updatedAt ??
        r.updated_at ??
        null,
    }));
  } catch (e) {
    if (isAuthError(e)) return [];
    throw e;
  }
}

/** Admin — entity actions */
export async function adminArchiveEntity(sel: EntitySelector) {
  // POST /admin/entities/archive  { orgName?, contactEmail?, ownerWallet? }
  return apiFetch("/admin/entities/archive", {
    method: "POST",
    body: JSON.stringify(sel),
  });
}

export async function adminUnarchiveEntity(sel: EntitySelector) {
  // POST /admin/entities/unarchive  { orgName?, contactEmail?, ownerWallet? }
  return apiFetch("/admin/entities/unarchive", {
    method: "POST",
    body: JSON.stringify(sel),
  });
}

export async function adminDeleteEntity(sel: EntitySelector) {
  // DELETE /admin/entities  { orgName?, contactEmail?, ownerWallet? }
  return apiFetch("/admin/entities", {
    method: "DELETE",
    body: JSON.stringify(sel),
  });
}

/** ✅ Alias to keep older UI calls working */
export async function getVendors(): Promise<VendorSummary[]> {
  return getAdminVendors();
}

// ---- Proofs ----
export async function getSubmittedProofs(): Promise<Proof[]> {
  try {
    const rows = await apiFetch("/proofs");
    return (Array.isArray(rows) ? rows : []).map(toProof);
  } catch (e) {
    if (isAuthError(e)) return [];
    throw e;
  }
}

export async function submitProof(input: {
  bidId: number;
  milestoneIndex: number;
  title?: string;
  description: string;
  files?: { name: string; url: string }[];
  prompt?: string;
}): Promise<Proof> {
  const files = Array.isArray(input.files) ? input.files : [];

  // Build a legacy-proof string in case the server only supports the old route
  let legacyProof = (input.description || "").trim();
  if (files.length) {
    legacyProof +=
      "\n\nAttachments:\n" +
      files.map((f) => `- ${f.name || "file"}: ${f.url}`).join("\n");
  }

  const payload = {
    bidId: Number(input.bidId),
    milestoneIndex: Number(input.milestoneIndex),
    title: input.title || "",
    description: input.description || "",
    files,
    ...(input.prompt ? { prompt: input.prompt } : {}),
    // legacy safety-net
    proof: legacyProof,
  };

  try {
    const p = await apiFetch("/proofs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return toProof(p);
  } catch (e: any) {
    // If the server doesn't support /proofs schema yet, fall back to legacy:
    const msg = String(e?.message || "").toLowerCase();
    const isSchema400 =
      msg.includes("invalid /proofs request") || msg.includes("http 400");
    if (!isSchema400) throw e;

    // Legacy fallback
    await completeMilestone(payload.bidId, payload.milestoneIndex, legacyProof);

    // Synthesize a minimal proof object so the UI can continue deterministically.
    return {
      proofId: undefined,
      bidId: payload.bidId,
      milestoneIndex: payload.milestoneIndex,
      vendorName: "",
      walletAddress: "",
      title:
        payload.title ||
        `Proof for Milestone ${payload.milestoneIndex + 1}`,
      description: payload.description,
      files,
      status: "pending",
      submittedAt: new Date().toISOString(),
      aiAnalysis: undefined,
    };
  }
}

export async function analyzeProof(proofId: number, prompt?: string): Promise<Proof> {
  if (!Number.isFinite(proofId)) throw new Error("Invalid proof ID");
  const p = await apiFetch(`/proofs/${encodeURIComponent(String(proofId))}/analyze`, {
    method: "POST",
    body: JSON.stringify(prompt ? { prompt } : {}),
  });
  return toProof(p);
}

export async function archiveProof(proofId: number): Promise<Proof> {
  if (!Number.isFinite(proofId)) throw new Error("Invalid proof ID");
  const p = await apiFetch(`/proofs/${encodeURIComponent(String(proofId))}/archive`, {
    method: "POST",
  });
  return toProof(p);
}

/** Approve a proof (admin-only) */
export async function approveProof(proofId: number, note?: string): Promise<Proof> {
  if (!Number.isFinite(proofId)) throw new Error("Invalid proof ID");
  const p = await apiFetch(
    `/proofs/${encodeURIComponent(String(proofId))}/approve`,
    {
      method: "POST",
      body: JSON.stringify(note ? { note } : {}),
    }
  );
  return toProof(p);
}

export async function getProofs(bidId?: number): Promise<Proof[]> {
  if (Number.isFinite(bidId as number)) {
    // vendor-safe (server should allow admin OR bid owner)
    const rows = await apiFetch(`/proofs/${encodeURIComponent(String(bidId))}`);
    return (Array.isArray(rows) ? rows : []).map(toProof);
  }
  // no bidId → admin list (still admin-only)
  const rows = await apiFetch(`/proofs`);
  return (Array.isArray(rows) ? rows : []).map(toProof);
}

/* ==========================
   Agent2 Proof Chat (SSE)
   - Streams tokens from POST /proofs/:id/chat
   - Must be called from a Client Component (browser)
   ========================== */

/** Internal SSE reader used by chatProof/chatProofOnce */
async function streamSSE(res: Response, onToken: (t: string) => void) {
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });

    // split on blank line between SSE frames
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      // server writes "data: <content>"
      const line = frame.startsWith("data: ") ? frame.slice(6) : frame;

      // ✅ preserve whitespace exactly as sent (no .trim())
      const data = line;

      // still recognize the terminator even if padded with spaces/newlines
      if (data.trim() === "[DONE]") return;

      // allow whitespace-only tokens (models often stream " " as a token)
      if (data === "") continue;

      onToken(data);
    }
  }
}

/** Chat about a PROOF (Agent2 uses proof description + file links like PDFs/images) */
export async function chatProof(
  proofId: number,
  messages: ChatMsg[],
  onToken: (t: string) => void
) {
  if (!Number.isFinite(proofId)) throw new Error("Invalid proof ID");
  const token = getJwt();

  const init: RequestInit = {
    method: "POST",
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      // ask server for an SSE stream
      Accept: "text/event-stream",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify({ messages }),
  };

  const res = await fetchWithFallback(
    `/proofs/${encodeURIComponent(String(proofId))}/chat`,
    init
  );

  await streamSSE(res, onToken);
}

/** Convenience helper: send a single question and get the full streamed answer */
export async function chatProofOnce(proofId: number, question: string): Promise<string> {
  let text = "";
  await chatProof(proofId, [{ role: "user", content: question }], (t) => {
    text += t;
  });
  return text;
}

// ---- IPFS ----
export function uploadJsonToIPFS(data: any) {
  return apiFetch(`/ipfs/upload-json`, { method: "POST", body: JSON.stringify(data) });
}

export async function uploadFileToIPFS(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const token = getJwt();

  const init: RequestInit = {
    method: "POST",
    body: fd,
    mode: "cors",
    redirect: "follow",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: "include",
  };

  const r = await fetchWithFallback(`/ipfs/upload-file`, init);

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j?.error || `HTTP ${r.status}`);
  }
  const result = await r.json();
  if (result?.cid && !result?.url) {
    const gateway =
      (typeof process !== "undefined" &&
        (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY) ||
      "gateway.pinata.cloud";
    result.url = `https://${gateway}/ipfs/${result.cid}`;
  }
  return result;
}

// ========= Proof uploads (Pinata via our Next API) =========
// 1) Upload <input type="file"> files to /api/proofs/upload
//    Returns: [{ cid, url, name }]
export async function uploadProofFiles(
  files: File[]
): Promise<Array<{ cid: string; url: string; name: string }>> {
  if (!files || files.length === 0) return [];

  const fd = new FormData();
  for (const f of files) fd.append('files', f, f.name);

  // IMPORTANT: relative fetch → hits Next /api route, not your external API_BASE
  const res = await fetch(`/api/proofs/upload`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });

  if (!res.ok) {
    let msg = `Upload HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error || j?.message || msg; } catch {}
    throw new Error(msg);
  }

  const json = await res.json().catch(() => ({}));
  const list = Array.isArray(json?.uploads) ? json.uploads : [];
  return list.map((u: any) => ({
    cid: String(u?.cid || ''),
    url: String(u?.url || ''),
    name: String(u?.name || (String(u?.url || '').split('/').pop() || 'file')),
  }));
}

// 2) Save the uploaded file URLs into your proofs table via /api/proofs
//    (this is what makes them appear in the Project “Files” tab automatically)
export async function saveProofFilesToDb(params: {
  proposalId: number;
  milestoneIndex: number; // ZERO-BASED (M1=0, M2=1, …)
  files: Array<{ url: string; name?: string; cid?: string }>;
  note?: string;
  replaceExisting?: boolean;       // ← optional: set true to wipe old files for this milestone
}) {
  const res = await fetch(`/api/proofs`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proposalId: Number(params.proposalId),
      milestoneIndex: Number(params.milestoneIndex),
      note: params.note ?? null,
      files: params.files,
      mode: params.replaceExisting ? 'replace' : 'append',  // ← new
    }),
  });

  if (!res.ok) {
    let msg = `Proof save HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error || j?.message || msg; } catch {}
    throw new Error(msg);
  }

  return await res.json();
}

// ---- Milestone archive helpers (batched + cached) ----
type ArchiveInfo = { archived: boolean; archivedAt?: string | null; archiveReason?: string | null };

// Per-bid cache so 5 lookups -> 1 request
const __ARCH_CACHE: Record<number, Promise<Record<number, ArchiveInfo>>> = {};

/** Fetch many milestone statuses at once. */
export async function getMilestonesArchiveMap(
  bidId: number,
  indices: number[] = [0, 1, 2, 3, 4]
): Promise<Record<number, ArchiveInfo>> {
  const qs = new URLSearchParams({ bidId: String(bidId), indices: indices.join(',') });
  const res = await fetch(`/api/milestones/bulk-status?${qs.toString()}`, {
    method: 'GET',
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Backwards-compatible: returns one index, but internally batches & caches. */
export async function getMilestoneArchive(bidId: number, milestoneIndex: number): Promise<ArchiveInfo> {
  if (!__ARCH_CACHE[bidId]) {
    // First call for this bidId -> fetch whole set once
    __ARCH_CACHE[bidId] = getMilestonesArchiveMap(bidId, [0, 1, 2, 3, 4]);
  }
  const map = await __ARCH_CACHE[bidId];
  return map[milestoneIndex] ?? { archived: false };
}

/** Archive ONE milestone via batch endpoint (then invalidate cache). */
export async function archiveMilestone(
  bidId: number,
  milestoneIndex: number,
  reason?: string
): Promise<{ ok: true; count: number }> {
  const res = await fetch('/api/milestones/bulk-archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify({ items: [{ bidId, milestoneIndex, reason: reason ?? '' }] }),
  });
  if (!res.ok) throw new Error(await res.text());
  delete __ARCH_CACHE[bidId]; // cache invalidation
  return res.json();
}

/** Unarchive ONE milestone via batch endpoint (then invalidate cache). */
export async function unarchiveMilestone(
  bidId: number,
  milestoneIndex: number
): Promise<{ ok: true; count: number }> {
  const res = await fetch('/api/milestones/bulk-archive', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify({ items: [{ bidId, milestoneIndex }] }),
  });
  if (!res.ok) throw new Error(await res.text());
  delete __ARCH_CACHE[bidId]; // cache invalidation
  return res.json();
}

// ---- Public Project (read-only, served by Next.js route) ----
export async function getPublicProject(bidId: number): Promise<PublicProject | null> {
  if (!Number.isFinite(bidId)) throw new Error('Invalid bidId');

  const res = await fetch(`/api/public/project/${encodeURIComponent(String(bidId))}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    if (res.status === 404) return null; // show "No public milestones/proofs yet"
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error || j?.message || msg; } catch {}
    throw new Error(msg);
  }

  const json = await res.json().catch(() => null);
  if (!json) return null;
  return toPublicProject(json);
}

// ---- Public Projects list (read-only, via Next API) ----
export async function getPublicProjects(): Promise<PublicProject[]> {
  const res = await fetch(`/api/public/projects`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error || j?.message || msg; } catch {}
    throw new Error(msg);
  }

  const json = await res.json().catch(() => []);
  const rows = Array.isArray(json) ? json : [];
  return rows.map(toPublicProject);
}

// ---- Health ----
export function healthCheck() {
  return apiFetch("/health");
}
export function testConnection() {
  return apiFetch("/test");
}

export default {
  // auth
  getAuthRole,
  loginWithSignature,
  logout,
  updateBidMilestones,

  // proposals
  listProposals,
  getProposals,
  getProposal,
  createProposal,
  approveProposal,
  rejectProposal,
  archiveProposal,
  deleteProposal,
  updateProposal,
  getMyProposals,

  // bids
  getBids,
  getBid,
  createBid,
  approveBid,
  rejectBid,
  analyzeBid,
  archiveBid,
  updateBid,

  // vendor/admin
  getVendorProfile,
  getVendorBids,
  completeMilestone,
  getVendorPayments,
  adminCompleteMilestone,
  payMilestone,

  // admin vendors
  getAdminVendors,
  getVendors, // alias
  listProposers,

  // admin entities
  adminArchiveEntity,
  adminUnarchiveEntity,
  adminDeleteEntity,

  // proofs
  getSubmittedProofs,
  approveProof,
  rejectMilestoneProof,
  rejectProof: rejectMilestoneProof,
  submitProof,
  analyzeProof,
  getProofs,
  archiveProof,

  // chat
  chatProof,
  chatProofOnce,

  // proofs uploads via Next API
  uploadProofFiles,
  saveProofFilesToDb,

  // milestone archive
  archiveMilestone,
  getMilestoneArchive,
  unarchiveMilestone,

  // public (read-only)
  getPublicProject,
  getPublicProjects, 

  // ipfs & misc
  uploadJsonToIPFS,
  uploadFileToIPFS,
  healthCheck,
  testConnection,
  postJSON,
};

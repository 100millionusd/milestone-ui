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
  docs?: any[]; 
  files?: any[];
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

/** 🆕 Agent Digest types */
export type DigestCounts = {
  proposals_new: number;
  bids_new: number;
  proofs_new: number;
};

export type DigestItem = {
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

export type DigestResponse = {
  since: string;
  counts: DigestCounts;
  items: DigestItem[];
  ai_summary: string;
};

export interface AuthInfo {
  address?: string;
  role: "admin" | "vendor" | "guest";
  vendorStatus?: "pending" | "approved" | "rejected";
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

// ---- SSR cookie/authorization forwarding (Next.js) ----
async function getServerForwardHeaders(): Promise<Record<string, string>> {
  try {
    const { cookies, headers } = await import("next/headers");
    const c = cookies();

    // forward all site cookies (sometimes backend reads auth from cookie)
    const cookieStr = c.getAll().map((k) => `${k.name}=${k.value}`).join("; ");

    // keep any incoming Authorization header if present
    const incomingAuth = headers().get("authorization");

    // 🔑 lift our site cookie lx_jwt and turn it into Bearer for the backend
    const lxJwt = c.get("lx_jwt")?.value;

    const out: Record<string, string> = {};
    if (cookieStr) out["cookie"] = cookieStr;
    if (incomingAuth) out["authorization"] = incomingAuth;
    else if (lxJwt) out["authorization"] = `Bearer ${lxJwt}`;

    return out;
  } catch {
    return {};
  }
}

// ---- Site origin helper (SSR + browser) ----
function getSiteOrigin(): string {
  if (typeof window !== "undefined" && window.location) return window.location.origin;
  const raw =
    (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_SITE_URL) ||
    (typeof process !== "undefined" && (process as any).env?.URL) ||
    (typeof process !== "undefined" && (process as any).env?.DEPLOY_PRIME_URL) ||
    (typeof process !== "undefined" && (process as any).env?.VERCEL_URL) ||
    "";
  const s = String(raw).trim().replace(/\/+$/, "");
  if (!s) return "";
  return s.startsWith("http") ? s : `https://${s}`;
}

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

// --- Sanitize text to avoid server-side JSON/DB "\u" parse errors ---
function _fixBrokenUnicodeEscapes(s: string): string {
  // turn any "\u" that is NOT followed by 4 hex digits into "\\u"
  return s.replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u");
}
function _fixUnpairedSurrogates(s: string): string {
  // replace lone surrogate halves with the Unicode replacement char
  s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "\uFFFD");       // high, no low
  s = s.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");       // low, no high
  return s;
}
function sanitizeUnicode(input: any): any {
  if (typeof input === "string") {
    return _fixUnpairedSurrogates(_fixBrokenUnicodeEscapes(input));
  } else if (Array.isArray(input)) {
    return input.map(sanitizeUnicode);
  } else if (input && typeof input === "object") {
    const out: any = {};
    for (const k of Object.keys(input)) out[k] = sanitizeUnicode(input[k]);
    return out;
  }
  return input;
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
    const ct = lastResp.headers.get("content-type") || "";
    let msg = `HTTP ${status}`;

    try {
      if (ct.includes("application/json")) {
        const j = await lastResp.clone().json();
        msg = j?.error || j?.message || msg;
      } else {
        const t = await lastResp.clone().text();
        if (t && t.trim()) msg = t.slice(0, 400);
      }
    } catch {
      try {
        const t2 = await lastResp.text();
        if (t2 && t2.trim()) msg = t2.slice(0, 400);
      } catch {}
    }

    throw new Error(msg);
  }

  // No last response captured (pure network failures across all bases)
  throw new Error("Network request failed");
}

/// ---- JSON Fetch helper ----
export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toString().toUpperCase();

 // Ensure leading slash (no cache-busting)
const basePath = path.startsWith('/') ? path : `/${path}`;
const fullPath = basePath;

  // Only set Content-Type when not FormData and caller didn't set it
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const callerCT =
    (options.headers as any)?.['Content-Type'] ||
    (options.headers as any)?.['content-type'];

  // Bearer fallback (when API cookie isn't available, e.g., cross-origin/Safari)
  const token = getJwt();

  // Forward cookies/authorization on the server for SSR calls
  const ssrForward = !isBrowser ? await getServerForwardHeaders() : {};

  const headers: Record<string, string> = {
  Accept: 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(options.headers as any),
  ...ssrForward,
};

  if (!callerCT && !isFormData && options.body != null) {
    headers['Content-Type'] = 'application/json';
  }

  const init: RequestInit = {
  ...options,
  cache: isBrowser ? 'no-store' : (options.cache ?? 'force-cache'),
  mode: 'cors',
  redirect: 'follow',
  credentials: 'include',
  headers,
};

  // Use the resilient base resolver (API_BASE → '' → '/api')
  const r = await fetchWithFallback(fullPath, init);

  // Auth errors → clear token + client redirect to login
  if (r.status === 401 || r.status === 403) {
    setJwt(null);
    if (typeof window !== 'undefined') {
      const next = location.pathname + location.search;
      if (!/\/login\b/.test(next)) {
        location.assign(`/login?next=${encodeURIComponent(next)}`);
      }
    }
    throw new Error(`HTTP ${r.status}`);
  }

  // Robust error parsing
  if (!r.ok) {
    const status = r.status;
    const ct = r.headers.get('content-type') || '';
    let msg = `HTTP ${status}`;

    try {
      const text = await r.clone().text();
      if (text && text.trim()) msg = text.slice(0, 400);
    } catch {}

    if (ct.includes('application/json')) {
      try {
        const j = await r.clone().json();
        if (j && (j.error || j.message)) msg = String(j.error || j.message);
      } catch {}
    }

    throw new Error(msg);
  }

  // Success
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    // allow 204/empty
    return null as any;
  }

  try {
    return (await r.json()) as T;
  } catch {
    return null as any;
  }
}

// ---- POST helper ----
// Keep ONLY ONE of these in the file.
export async function postJSON<T = any>(path: string, data: any, options: RequestInit = {}): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
}

// ---- Auth ----
export async function getAuthRole(opts?: { address?: string }): Promise<AuthInfo> {
  const q = opts?.address ? `?address=${encodeURIComponent(opts.address)}` : "";
  try {
    const r = await apiFetch(`/auth/role${q}`);
    const serverRole = String(r?.role || '').toLowerCase();
    const mapped: AuthInfo["role"] =
      serverRole === 'admin' ? 'admin' :
      r?.address ? 'vendor' : 'guest';

    return {
      address: r?.address ?? undefined,
      role: mapped,
      vendorStatus: (r?.vendorStatus as AuthInfo["vendorStatus"]) ?? undefined,
    };
  } catch {
    return { role: "guest" };
  }
}

// ---- Role: coalesced + TTL cache (single fetch per 30s) ----
let _authRoleMainInflight: Promise<AuthInfo> | null = null;
let _authRoleMainCache: { at: number; data: AuthInfo } | null = null;

export function getAuthRoleOnce(): Promise<AuthInfo> {
  const now = Date.now();
  if (_authRoleMainCache && now - _authRoleMainCache.at < 3_000) {
    return Promise.resolve(_authRoleMainCache.data);
  }
  if (_authRoleMainInflight) return _authRoleMainInflight;

  _authRoleMainInflight = getAuthRole().then((info) => {
    _authRoleMainCache = { at: Date.now(), data: info };
    return info;
  }).finally(() => {
    _authRoleMainInflight = null;
  });

  return _authRoleMainInflight;
}

// ---- Role/Bids cache clearers ----
export function clearAuthRoleCache() {
  _authRoleMainCache = null;
  _authRoleMainInflight = null;
}

export function clearBidsCache() {
  _bidsCache = null;
  _bidsInflight = null;
}

// alias for callers expecting invalidateBidsCache
export const invalidateBidsCache = clearBidsCache;

// ---- Bids: coalesced + TTL cache (single fetch per 30s) ----
let _bidsInflight: Promise<Bid[]> | null = null;
let _bidsCache: { at: number; data: Bid[] } | null = null;

export async function getBidsOnce(proposalId?: number): Promise<Bid[]> {
  const now = Date.now();
  // 1) serve cached for 30s
  if (_bidsCache && now - _bidsCache.at < 3_000) return _bidsCache.data;
  // 2) coalesce concurrent callers
  if (_bidsInflight) return _bidsInflight;

  _bidsInflight = (async () => {
    try {
      const bids = await getBids(proposalId);
      _bidsCache = { at: Date.now(), data: bids };
      return bids;
    } finally {
      _bidsInflight = null;
    }
  })();

  return _bidsInflight;
}

/**
 * Exchange a signed nonce for a JWT cookie (and token).
 * Call flow:
 *  1) GET/POST /auth/nonce to get `nonce` for your wallet address
 *  2) Sign that `nonce` with the wallet
 *  3) Call loginWithSignature(address, signature)
 * Returns `{ role }` and stores `token` to localStorage (lx_jwt) for Bearer fallback.
 */
export async function loginWithSignature(
  address: string,
  signature: string
): Promise<{ role: AuthInfo["role"]; token: string | null }> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ address, signature }),
  });

  const token = (res && res.token) ? String(res.token) : null;
  if (token) setJwt(token); // keep localStorage fallback in sync

  return {
    role: (res?.role as AuthInfo["role"]) || "vendor",
    token,
  };
}

/* ==========================
   🆕 Agent Digest (dashboard)
   - GET /agent/digest
   - POST /agent/seen
   ========================== */

/** Get a role-aware digest (admin sees all; vendor sees theirs). */
export async function getDigest(
  since?: string,
  limit = 50
): Promise<DigestResponse> {
  const qs = new URLSearchParams();
  if (since) qs.set("since", since);
  if (limit) qs.set("limit", String(limit));
  return apiFetch<DigestResponse>(
    `/agent/digest${qs.toString() ? `?${qs.toString()}` : ""}`
  );
}

/** Mark the digest as seen (server stores "now" for your wallet). */
export async function markDigestSeen(): Promise<{ ok: boolean; at?: string }> {
  return apiFetch(`/agent/seen`, {
    method: "POST",
    body: JSON.stringify({}), // keep body JSON so parsers behave consistently
  });
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

  // coerce doc/docs that might be JSON strings
  const oneDoc = coerceJson(b?.doc);
  const manyDocs = (() => {
    const raw = coerceJson(b?.docs);
    if (Array.isArray(raw)) return raw;
    // if only single .doc exists, surface it in docs[] too so UIs can iterate
    return oneDoc ? [oneDoc] : [];
  })();

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

    // single doc, kept for backward-compat
    doc: oneDoc ?? null,

    // NEW: arrays for multiple attachments
    docs: manyDocs,
    files: Array.isArray(b?.files) ? b.files : [],

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

// Admin Proofs-only: returns bids enriched with paymentPending / paymentTxHash
// Admin Proofs-only: returns bids enriched with paymentPending / paymentTxHash
export async function getProofBids(): Promise<any[]> {
  const rows = await apiFetch("/admin/proofs-bids");
  return Array.isArray(rows) ? rows : rows?.rows ?? [];
}

export async function getBid(id: number): Promise<Bid> {
  const b = await apiFetch(`/bids/${encodeURIComponent(String(id))}`);
  return toBid(b);
}

export async function createBid(
  bid: Omit<Bid, "bidId" | "status" | "createdAt" | "aiAnalysis">
): Promise<Bid> {
  let payload: any = { ...bid };
  payload.priceUSD = Number(payload.priceUSD);
  payload.days = Number(payload.days);
  payload.milestones = (payload.milestones || []).map((m: any) => ({
    name: m.name,
    amount: Number(m.amount),
    dueDate: toIso(m.dueDate),
  }));

  // 👇 sanitize recursively so bad "\u" sequences become safe
  payload = sanitizeUnicode(payload);

  const b = await apiFetch("/bids", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

export async function deleteBid(id: number): Promise<boolean> {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  await apiFetch(`/bids/${encodeURIComponent(String(id))}`, { method: "DELETE" });
  return true;
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

// SAFE — force routing via Safe (multisig)
export async function payMilestoneSafe(bidId: number, milestoneIndex: number) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(`/bids/${encodeURIComponent(String(bidId))}/pay-milestone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ milestoneIndex, method: "safe" }),
  });
}

// MANUAL — force legacy/admin path
export async function payMilestoneManual(bidId: number, milestoneIndex: number) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(`/bids/${encodeURIComponent(String(bidId))}/pay-milestone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ milestoneIndex, method: "eoa" }),
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

export async function approveVendor(walletAddress: string) {
  if (!walletAddress) throw new Error("walletAddress required");
  return apiFetch(`/admin/vendors/${encodeURIComponent(walletAddress)}/approve`, {
    method: "POST",
  });
}

export async function rejectVendor(walletAddress: string) {
  if (!walletAddress) throw new Error("walletAddress required");
  return apiFetch(`/admin/vendors/${encodeURIComponent(walletAddress)}/reject`, {
    method: "POST",
  });
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

export async function getProofs(bidId?: number | string): Promise<Proof[]> {
  // If bidId provided → coerce & validate
  if (bidId != null) {
    const id = Number(bidId);
    if (!Number.isFinite(id)) {
      throw new Error(`getProofs: invalid bidId "${bidId}"`);
    }
    const rows = await apiFetch(`/proofs?bidId=${encodeURIComponent(String(id))}`);
    return (Array.isArray(rows) ? rows : []).map(toProof);
  }

  // No bidId → admin list (unchanged behavior)
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

// Bulk archive cache for multiple bids
let __BULK_ARCH_CACHE: Record<number, Record<number, ArchiveInfo>> = {};

/** Fetch many milestone statuses at once. */
export async function getMilestonesArchiveMap(
  bidId: number,
  indices: number[] = [0, 1, 2, 3, 4]
): Promise<Record<number, ArchiveInfo>> {
  const qs = new URLSearchParams({ bidIds: String(bidId), indices: indices.join(',') });
  const res = await fetch(`/api/milestones/bulk-status?${qs.toString()}`, {
    method: 'GET',
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Backwards-compatible: returns one index, but internally batches & caches. */
export async function getMilestoneArchive(bidId: number, milestoneIndex: number): Promise<ArchiveInfo> {
  // If we already have this bid's data in bulk cache, use it
  if (__BULK_ARCH_CACHE[bidId]?.[milestoneIndex] !== undefined) {
    return __BULK_ARCH_CACHE[bidId][milestoneIndex];
  }

  // Fallback to individual request (existing behavior)
  if (!__ARCH_CACHE[bidId]) {
    __ARCH_CACHE[bidId] = getMilestonesArchiveMap(bidId, [0, 1, 2, 3, 4]);
  }
  const map = await __ARCH_CACHE[bidId];
  return map[milestoneIndex] ?? { archived: false };
}

/** Bulk archive status - uses your existing route */
export async function getBulkArchiveStatus(bidIds: number[]): Promise<Record<number, Record<number, ArchiveInfo>>> {
  if (!bidIds.length) return {};
  
  const qs = new URLSearchParams({
    bidIds: bidIds.join(',')
  });
  
  const res = await fetch(`/api/milestones/bulk-status?${qs.toString()}`, {
    method: 'GET',
    credentials: 'omit',
  });
  
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Function to update the bulk cache
export function updateBulkArchiveCache(data: Record<number, Record<number, ArchiveInfo>>) {
  __BULK_ARCH_CACHE = { ...__BULK_ARCH_CACHE, ...data };
}

// Clear bulk cache for a specific bid (useful after archive/unarchive operations)
export function clearBulkArchiveCache(bidId?: number) {
  if (bidId) {
    delete __BULK_ARCH_CACHE[bidId];
  } else {
    __BULK_ARCH_CACHE = {};
  }
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
  clearBulkArchiveCache(bidId); // clear bulk cache for this bid
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
  clearBulkArchiveCache(bidId); // clear bulk cache for this bid
  return res.json();
}
// ---- Public projects (read-only, no auth) ----

/**
 * Return the public “projects” list for the marketing page.
 * Prefer our Next API route (/api/public/projects) so it works with NO backend change.
 */
export async function getPublicProjects(): Promise<any[]> {
  // Try the Next API route first (SSR-safe + browser-safe)
  try {
    const url =
      typeof window !== "undefined"
        ? "/api/public/projects"
        : `${getSiteOrigin()}/api/public/projects`;
    const r = await fetch(url, { cache: "no-store" });
    if (r.ok) {
      const data = await r.json().catch(() => []);
      if (Array.isArray(data)) return data;
    }
  } catch {}

  // Fallbacks if the route is somehow unreachable
  const candidates = [
    "/bids?status=approved",
    "/bids?public=true",
    "/public/projects",
    "/public/bids",
    "/bids/public",
    "/bids?status=approved&visibility=public",
  ] as const;

  for (const path of candidates) {
    try {
      const rows = await apiFetch(path);
      if (Array.isArray(rows)) return rows;
    } catch {}
  }
  return [];
}

/**
 * Return one public project by its bidId.
 * Prefer a Next API detail route if you add one later; for now use backend with graceful fallbacks.
 */
export async function getPublicProject(bidId: number): Promise<any | null> {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");

  // If you later add /api/public/projects/[id], uncomment this preferred path:
  // try {
  //   const url =
  //     typeof window !== "undefined"
  //       ? `/api/public/projects/${encodeURIComponent(String(bidId))}`
  //       : `${getSiteOrigin()}/api/public/projects/${encodeURIComponent(String(bidId))}`;
  //   const r = await fetch(url, { cache: "no-store" });
  //   if (r.ok) return await r.json();
  // } catch {}

  const id = encodeURIComponent(String(bidId));
  const candidates = [
    `/public/projects/${id}`,
    `/public/bids/${id}`,
    `/bids/${id}`, // may succeed if backend exposes approved/public bids without auth
  ] as const;

  for (const path of candidates) {
    try {
      const row = await apiFetch(path);
      if (row && typeof row === "object") return row;
    } catch {}
  }
  return null;
}

// ---- Health ----
export function healthCheck() {
  return apiFetch("/health");
}
export function testConnection() {
  return apiFetch("/test");
}

// === Templates (marketplace) ===
export type TemplateSummary = {
  id: number;
  slug: string;
  title: string;
  locale?: string | null;
  category?: string | null;
  summary?: string | null;
  default_currency?: string | null;
  milestones: number;
};
export type TemplateDetail = TemplateSummary & {
  milestones: Array<{ idx: number; name: string; amount: number; days_offset: number; acceptance?: string[] }>;
};

export async function getTemplates(): Promise<TemplateSummary[]> {
  return apiFetch<TemplateSummary[]>(`/templates`);
}

export async function getTemplate(idOrSlug: number | string): Promise<TemplateDetail> {
  return apiFetch<TemplateDetail>(`/templates/${encodeURIComponent(String(idOrSlug))}`);
}

type FileInput =
  | File
  | string
  | { url: string; name?: string; mimetype?: string; contentType?: string }
  | { file: File; name?: string };

export async function createBidFromTemplate(input: {
  templateId?: number;
  slug?: string;
  proposalId: number;
  vendorName: string;
  walletAddress: string;
  preferredStablecoin?: 'USDT' | 'USDC';
  files?: any[];
  docs?: any[];
  doc?: any;
  notes?: string;
  milestones?: Array<{
    name: string;
    amount: number;
    dueDate: string;
    acceptance?: string[];
    archived?: boolean;
    description?: string;
    notes?: string;
    desc?: string;
  }>;
}): Promise<{ ok: boolean; bidId: number }> {
  
  console.log('🔍 API DEBUG - createBidFromTemplate input:', {
    templateId: input.templateId,
    slug: input.slug,
    proposalId: input.proposalId,
    vendorName: input.vendorName,
    notes: input.notes, // Check if notes are received
    notesLength: input.notes?.length || 0,
    milestonesCount: input.milestones?.length || 0,
    filesCount: input.files?.length || 0
  });

  const files = Array.isArray(input.files) ? input.files : [];
  const docs = Array.isArray(input.docs) ? input.docs : files;
  
  const milestones = Array.isArray(input.milestones)
    ? input.milestones.map((m) => {
        const text = m.description ?? m.notes ?? m.desc ?? '';
        return { 
          ...m, 
          description: text, 
          notes: text, 
          desc: text 
        };
      })
    : [];

  const doc = input.doc || files[0] || docs[0] || null;

  const payload = {
    templateId: input.templateId,
    slug: input.slug,
    proposalId: input.proposalId,
    vendorName: input.vendorName,
    walletAddress: input.walletAddress,
    preferredStablecoin: input.preferredStablecoin || 'USDT',
    milestones,
    doc,
    docs,
    files: docs,
    notes: input.notes, // Make sure notes are in payload
  };

  console.log('🔍 API DEBUG - Payload to /bids/from-template:', {
    notes: payload.notes,
    notesLength: payload.notes?.length || 0
  });

  const result = await postJSON(`/bids/from-template`, payload);
  
  console.log('🔍 API DEBUG - Response from /bids/from-template:', result);
  
  return result;
}

/** (Optional) Helper if you want to build phased milestones in the browser.
 * Exported for reuse by client components.
 */
export function splitIntoPhases(totalBOB: number, totalDays: number, baseName: string) {
  const pct = [0.2, 0.6, 0.2]; // 20% Plan/Compra, 60% Instalación, 20% Entrega
  const labels = ['Planificación y compra', 'Instalación', 'Acabados y entrega'];
  const accepts = [
    ['Lista de materiales aprobada', 'Cronograma acordado'],
    ['Instalación realizada y sellos aplicados', 'Fotos de avance subidas'],
    ['Prueba de cierre/sellado', 'Área limpia y lista'],
  ];
  const daysOffsets = [
    Math.max(3, Math.round(totalDays * 0.2)),
    Math.max(7, Math.round(totalDays * 0.8)),
    Math.max(10, Math.round(totalDays * 1.0)),
  ];
  const now = Date.now();
  return pct.map((p, i) => ({
    name: `${baseName} — ${labels[i]}`,
    amount: Math.round(totalBOB * p * 100) / 100,
    dueDate: new Date(now + daysOffsets[i] * 86400 * 1000).toISOString(),
    acceptance: accepts[i],
    archived: false,
  }));
}

export function buildMilestonesFromSelection(
  scopes: Array<{key:string; name:string}>,
  sel: Record<string, {selected:boolean; amount:number; days:number}>
) {
  const out: Array<{
    name: string; amount: number; dueDate: string; acceptance?: string[]; archived?: boolean;
  }> = [];
  for (const s of scopes) {
    const row = sel[s.key];
    if (!row?.selected) continue;
    out.push(...splitIntoPhases(row.amount, row.days, s.name));
  }
  return out;
}

export default {
  // auth
  getAuthRole,
  getAuthRoleOnce,
  loginWithSignature,
  clearBidsCache,
  updateBidMilestones,
  invalidateBidsCache,

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
  deleteBid,

  // vendor/admin
  getVendorProfile,
  getVendorBids,
  completeMilestone,
  getVendorPayments,
  adminCompleteMilestone,
  payMilestone,
  payMilestoneSafe,
  payMilestoneManual,

  // admin vendors
  getAdminVendors,
  getVendors, // alias
  approveVendor,
  rejectVendor,
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

  // public read
  getPublicProjects,
  getPublicProject,

  // agent digest
  getDigest,
  markDigestSeen,

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
  getMilestonesArchiveMap,
  getBulkArchiveStatus,
  updateBulkArchiveCache,
  clearBulkArchiveCache,

  // ipfs & misc
  uploadJsonToIPFS,
  uploadFileToIPFS,
  healthCheck,
  testConnection,
  postJSON,

  // templates
  getTemplates,
  getTemplate,
  createBidFromTemplate,
  splitIntoPhases,
  buildMilestonesFromSelection,
};

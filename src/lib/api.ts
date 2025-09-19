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
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  aiAnalysis?: any;
}

export interface AuthInfo {
  address?: string;
  role: "admin" | "vendor" | "guest";
}

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
const url = (path: string) => `${API_BASE}${path}`;

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

// ---- Fetch helper ----
async function apiFetch(path: string, options: RequestInit = {}) {
  const method = (options.method || "GET").toUpperCase();

  // Bust caches on GETs
  let fullPath = path;
  if (method === "GET") {
    const sep = path.includes("?") ? "&" : "?";
    fullPath = `${path}${sep}_ts=${Date.now()}`;
  }

  const fullUrl = url(fullPath);

  // Attach JWT if available (cookie is primary)
  const token = getJwt();

  // Avoid forcing JSON Content-Type when the caller passed FormData
  const callerCT = (options.headers as any)?.["Content-Type"] || (options.headers as any)?.["content-type"];
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

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

  const r = await fetch(fullUrl, {
    cache: "no-store",
    mode: "cors",
    redirect: "follow",
    credentials: "include", // send auth cookie
    headers,
    ...options,
  }).catch((e) => {
    throw new Error(e?.message || "Failed to fetch");
  });

  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  // 204 or non-JSON
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
  try {
    const info = await apiFetch("/auth/role");
    const role = (info?.role ?? "guest") as AuthInfo["role"];
    const address = typeof info?.address === "string" ? info.address : undefined;
    return { address, role };
  } catch {
    return { role: "guest" };
  }
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
  return { role: (res?.role as AuthInfo["role"]) || "vendor" };
}

/** Clears cookie on server and local JWT cache */
export async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {}
  setJwt(null);
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
}: PromiseLike<any> extends never ? never : any) : Promise<Proof> {
  const files = Array.isArray(input.files) ? input.files : [];

  // Build a legacy-proof string in case the server only supports the old route
  let legacyProof = (input.description || "").trim();
  if (files.length) {
    legacyProof +=
      "\n\nAttachments:\n" + files.map((f) => `- ${f.name || "file"}: ${f.url}`).join("\n");
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
    const isSchema400 = msg.includes("invalid /proofs request") || msg.includes("http 400");
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
      title: payload.title || `Proof for Milestone ${payload.milestoneIndex + 1}`,
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

export async function getProofs(bidId?: number): Promise<Proof[]> {
  const q = Number.isFinite(bidId as number) ? `?bidId=${bidId}` : "";
  const rows = await apiFetch(`/proofs${q}`);
  return (Array.isArray(rows) ? rows : []).map(toProof);
}

export function approveProof(bidId: number, milestoneIndex: number) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(
    `/proofs/${encodeURIComponent(String(bidId))}/${encodeURIComponent(String(milestoneIndex))}/approve`,
    { method: "POST" }
  );
}

export function rejectProof(bidId: number, milestoneIndex: number) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(
    `/proofs/${encodeURIComponent(String(bidId))}/${encodeURIComponent(String(milestoneIndex))}/reject`,
    { method: "POST" }
  );
}

// ---- IPFS ----
export function uploadJsonToIPFS(data: any) {
  return apiFetch(`/ipfs/upload-json`, { method: "POST", body: JSON.stringify(data) });
}

export async function uploadFileToIPFS(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const token = getJwt();
  const r = await fetch(`${API_BASE}/ipfs/upload-file`, {
    method: "POST",
    body: fd,
    mode: "cors",
    redirect: "follow",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: "include",
  }).catch((e) => {
    throw new Error(e?.message || "Failed to upload file");
  });
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

  // proposals
  listProposals,
  getProposals,
  getProposal,
  createProposal,
  approveProposal,
  rejectProposal,
  archiveProposal,
  deleteProposal,

  // bids
  getBids,
  getBid,
  createBid,
  approveBid,
  rejectBid,
  analyzeBid,
  archiveBid,

  // vendor/admin
  getVendorBids,
  completeMilestone,
  getVendorPayments,
  adminCompleteMilestone,
  payMilestone,

  // proofs
  getSubmittedProofs,
  approveProof,
  rejectProof,
  submitProof,
  analyzeProof,
  getProofs,

  // ipfs & misc
  uploadJsonToIPFS,
  uploadFileToIPFS,
  healthCheck,
  testConnection,
  postJSON,
};

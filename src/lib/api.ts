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
  status: "pending" | "approved" | "rejected" | "completed";
  createdAt: string;
}

export interface Milestone {
  name: string;
  amount: number;
  dueDate: string;
  completed: boolean;
  completionDate: string | null;
  proof: string;
  paymentTxHash: string | null;
  paymentDate: string | null;
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
  status: "pending" | "approved" | "completed" | "rejected";
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
  bidId: number;
  milestoneIndex: number;
  vendorName: string;
  walletAddress: string;
  title: string;
  description: string;
  files: { name: string; url: string }[];
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
}

// ---- Base URL resolution ----
const getApiBase = () => {
  if (typeof window === "undefined") {
    return (
      process.env.API_BASE_URL ||
      "https://milestone-api-production.up.railway.app"
    );
  }
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "https://milestone-api-production.up.railway.app"
  );
};

const API_BASE = getApiBase().replace(/\/+$/, "");
const url = (path: string) => `${API_BASE}${path}`;

// ---- Fetch helper ----
async function apiFetch(path: string, options: RequestInit = {}) {
  const fullUrl = url(path);

  const r = await fetch(fullUrl, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
    ...options,
  }).catch((e) => {
    throw new Error(e?.message || "Failed to fetch");
  });

  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = j?.error || j?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  try {
    return await r.json();
  } catch {
    return null;
  }
}

// ---- POST helper ----
export const postJSON = async <T = any>(
  path: string,
  data: any
): Promise<T> => {
  return apiFetch(path, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

// ---- Normalizers (robust to mixed shapes) ----
function toProposal(p: any): Proposal {
  const id =
    p?.proposalId ?? p?.proposal_id ?? p?.id ?? p?.proposalID ?? null;

  const amount = p?.amountUSD ?? p?.amount_usd ?? p?.amount ?? 0;

  return {
    proposalId: Number(id),
    orgName: p?.orgName ?? p?.org_name ?? p?.organization ?? "",
    title: p?.title ?? "",
    summary: p?.summary ?? p?.description ?? "",
    contact: p?.contact ?? p?.contact_email ?? "",
    address: p?.address ?? null,
    city: p?.city ?? null,
    country: p?.country ?? null,
    amountUSD: Number(amount) || 0,
    docs: Array.isArray(p?.docs) ? p.docs : [],
    cid: p?.cid ?? null,
    status: (p?.status as Proposal["status"]) ?? "pending",
    createdAt: p?.createdAt ?? p?.created_at ?? new Date().toISOString(),
  };
}

function toBid(b: any): Bid {
  const bidId = b?.bidId ?? b?.bid_id ?? b?.id;
  const proposalId =
    b?.proposalId ?? b?.proposal_id ?? b?.proposalID ?? b?.proposal;
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
    milestones: Array.isArray(b?.milestones) ? b.milestones : [],
    doc: b?.doc ?? null,
    status: (b?.status as Bid["status"]) ?? "pending",
    createdAt: b?.createdAt ?? b?.created_at ?? new Date().toISOString(),
    aiAnalysis: b?.aiAnalysis ?? b?.ai_analysis ?? null,
  };
}

function toProof(p: any): Proof {
  return {
    bidId: Number(p?.bidId ?? p?.bid_id),
    milestoneIndex: Number(p?.milestoneIndex ?? p?.milestone_index),
    vendorName: p?.vendorName ?? p?.vendor_name ?? "",
    walletAddress: p?.walletAddress ?? p?.wallet_address ?? "",
    title: p?.title ?? "",
    description: p?.description ?? "",
    files: Array.isArray(p?.files) ? p.files : [],
    status: p?.status ?? "pending",
    submittedAt: p?.submittedAt ?? p?.submitted_at ?? new Date().toISOString(),
  };
}

// ---- Proposals ----
export async function getProposals(): Promise<Proposal[]> {
  const rows = await apiFetch("/proposals");
  return (Array.isArray(rows) ? rows : []).map(toProposal);
}

export async function getProposal(id: number): Promise<Proposal> {
  const p = await apiFetch(`/proposals/${encodeURIComponent(String(id))}`);
  return toProposal(p);
}

export function createProposal(
  proposal: Omit<Proposal, "proposalId" | "status" | "createdAt" | "cid">
): Promise<{ ok: boolean; proposalId: number; cid: string | null }> {
  return apiFetch("/proposals", {
    method: "POST",
    body: JSON.stringify(proposal),
  });
}

export function approveProposal(id: number) {
  if (!Number.isFinite(id)) throw new Error("Invalid proposal ID");
  return apiFetch(`/proposals/${encodeURIComponent(String(id))}/approve`, {
    method: "POST",
  });
}

export function rejectProposal(id: number) {
  if (!Number.isFinite(id)) throw new Error("Invalid proposal ID");
  return apiFetch(`/proposals/${encodeURIComponent(String(id))}/reject`, {
    method: "POST",
  });
}

// ---- Bids ----
export async function getBids(proposalId?: number): Promise<Bid[]> {
  const q = Number.isFinite(proposalId as number)
    ? `?proposalId=${proposalId}`
    : "";
  const rows = await apiFetch(`/bids${q}`);
  return (Array.isArray(rows) ? rows : []).map(toBid);
}

export async function getBid(id: number): Promise<Bid> {
  const b = await apiFetch(`/bids/${encodeURIComponent(String(id))}`);
  return toBid(b);
}

export function createBid(
  bid: Omit<Bid, "bidId" | "status" | "createdAt">
): Promise<{ ok: boolean; bidId: number; proposalId: number }> {
  // normalize payload to what the API expects
  const payload: any = { ...bid };
  payload.priceUSD = Number(payload.priceUSD);
  payload.days = Number(payload.days);
  payload.milestones = (payload.milestones || []).map((m: any) => ({
    name: m.name,
    amount: Number(m.amount),
    dueDate: new Date(m.dueDate).toISOString(),
  }));
  return apiFetch("/bids", { method: "POST", body: JSON.stringify(payload) });
}

export function approveBid(id: number) {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  return apiFetch(`/bids/${encodeURIComponent(String(id))}/approve`, {
    method: "POST",
  });
}

export function rejectBid(id: number) {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  return apiFetch(`/bids/${encodeURIComponent(String(id))}/reject`, {
    method: "POST",
  });
}

// ✅ Agent2 trigger
export function analyzeBid(id: number) {
  if (!Number.isFinite(id)) throw new Error("Invalid bid ID");
  return apiFetch(`/bids/${encodeURIComponent(String(id))}/analyze`, {
    method: "POST",
  });
}

// ---- Vendor ----
export async function getVendorBids(): Promise<Bid[]> {
  // Prefer vendor route; fall back to all bids if not available
  try {
    const rows = await apiFetch("/vendor/bids");
    return (Array.isArray(rows) ? rows : []).map(toBid);
  } catch {
    const rows = await apiFetch("/bids");
    return (Array.isArray(rows) ? rows : []).map(toBid);
  }
}

export function completeMilestone(
  bidId: number,
  milestoneIndex: number,
  proof: string
) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(
    `/bids/${encodeURIComponent(String(bidId))}/complete-milestone`,
    {
      method: "POST",
      body: JSON.stringify({ milestoneIndex, proof }),
    }
  );
}

export function getVendorPayments(): Promise<TransactionResult[]> {
  return apiFetch("/vendor/payments");
}

// ---- Admin ----
export function adminCompleteMilestone(
  bidId: number,
  milestoneIndex: number,
  proof: string
) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(
    `/bids/${encodeURIComponent(String(bidId))}/complete-milestone`,
    {
      method: "POST",
      body: JSON.stringify({ milestoneIndex, proof }),
    }
  );
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
  const rows = await apiFetch("/proofs");
  return (Array.isArray(rows) ? rows : []).map(toProof);
}

export function approveProof(bidId: number, milestoneIndex: number) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(
    `/proofs/${encodeURIComponent(String(bidId))}/${encodeURIComponent(
      String(milestoneIndex)
    )}/approve`,
    {
      method: "POST",
    }
  );
}

export function rejectProof(bidId: number, milestoneIndex: number) {
  if (!Number.isFinite(bidId)) throw new Error("Invalid bid ID");
  return apiFetch(
    `/proofs/${encodeURIComponent(String(bidId))}/${encodeURIComponent(
      String(milestoneIndex)
    )}/reject`,
    {
      method: "POST",
    }
  );
}

// ---- IPFS ----
export function uploadJsonToIPFS(data: any) {
  return apiFetch(`/ipfs/upload-json`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function uploadFileToIPFS(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/ipfs/upload-file`, {
    method: "POST",
    body: fd,
  }).catch((e) => {
    throw new Error(e?.message || "Failed to upload file");
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j?.error || `HTTP ${r.status}`);
  }

  const result = await r.json();

  const gateway =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";
  if (result.cid) {
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
  getProposals,
  getProposal,
  createProposal,
  approveProposal,
  rejectProposal,
  getBids,
  getBid,
  createBid,
  approveBid,
  rejectBid,
  analyzeBid, // ✅ exported
  getVendorBids,
  completeMilestone,
  getVendorPayments,
  adminCompleteMilestone,
  payMilestone,
  getSubmittedProofs,
  approveProof,
  rejectProof,
  uploadJsonToIPFS,
  uploadFileToIPFS,
  healthCheck,
  testConnection,
  postJSON,
};

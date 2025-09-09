// src/lib/api.ts

// ---- Types ----
export interface Proposal {
  proposalId: number;
  orgName: string;
  title: string;
  summary: string;
  contact: string;
  address?: string;
  city?: string;
  country?: string;
  amountUSD: number;
  docs: any[];
  cid: string;
  status: "pending" | "approved" | "rejected";
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
}

export interface TransactionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  amount?: number;
  toAddress?: string;
  currency?: string;
}

// Proof submitted by vendors
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
      msg = j?.error || msg;
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

// ---- Proposals ----
export function getProposals(): Promise<Proposal[]> {
  return apiFetch("/proposals");
}
export function getProposal(id: number): Promise<Proposal> {
  return apiFetch(`/proposals/${id}`);
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
  return apiFetch(`/proposals/${id}/approve`, { method: "POST" });
}
export function rejectProposal(id: number) {
  return apiFetch(`/proposals/${id}/reject`, { method: "POST" });
}

// ---- Bids ----
export function getBids(proposalId?: number): Promise<Bid[]> {
  const q = proposalId ? `?proposalId=${proposalId}` : "";
  return apiFetch(`/bids${q}`);
}
export function getBid(id: number): Promise<Bid> {
  return apiFetch(`/bids/${id}`);
}
export function createBid(
  bid: Omit<Bid, "bidId" | "status" | "createdAt">
): Promise<{ ok: boolean; bidId: number; proposalId: number }> {
  return apiFetch("/bids", { method: "POST", body: JSON.stringify(bid) });
}
export function approveBid(id: number) {
  return apiFetch(`/bids/${id}/approve`, { method: "POST" });
}
export function rejectBid(id: number) {
  return apiFetch(`/bids/${id}/reject`, { method: "POST" });
}

// ---- Vendor ----
export function getVendorBids(): Promise<Bid[]> {
  return apiFetch("/vendor/bids");
}
export function completeMilestone(
  bidId: number,
  milestoneIndex: number,
  proof: string
) {
  return apiFetch(`/bids/${bidId}/complete-milestone`, {
    method: "POST",
    body: JSON.stringify({ milestoneIndex, proof }),
  });
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
  return apiFetch(`/bids/${bidId}/complete-milestone`, {
    method: "POST",
    body: JSON.stringify({ milestoneIndex, proof }),
  });
}
export function payMilestone(bidId: number, milestoneIndex: number) {
  return apiFetch(`/bids/${bidId}/pay-milestone`, {
    method: "POST",
    body: JSON.stringify({ milestoneIndex }),
  });
}

// ---- Proofs (Vendor submissions reviewed by Admin) ----
export function getSubmittedProofs(): Promise<Proof[]> {
  return apiFetch("/proofs");
}
export function approveProof(bidId: number, milestoneIndex: number) {
  return apiFetch(`/proofs/${bidId}/${milestoneIndex}/approve`, {
    method: "POST",
  });
}
export function rejectProof(bidId: number, milestoneIndex: number) {
  return apiFetch(`/proofs/${bidId}/${milestoneIndex}/reject`, {
    method: "POST",
  });
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

  // 👇 rewrite using NEXT_PUBLIC_PINATA_GATEWAY
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

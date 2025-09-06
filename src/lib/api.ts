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

// ---- Base URL resolution ----
// ALWAYS use direct Railway URL (no proxy since API routes were removed)
const API_BASE = (
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://milestone-api-production.up.railway.app"
).replace(/\/+$/, "");

const url = (path: string) => `${API_BASE}${path}`;

// ---- Fetch helper ----
async function apiFetch(path: string, options: RequestInit = {}) {
  const r = await fetch(url(path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  }).catch((e) => {
    // Network/CORS-level error
    throw new Error(e?.message || "Failed to fetch");
  });

  // HTTP-level error
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

  // OK
  try {
    return await r.json();
  } catch {
    return null;
  }
}

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
  return apiFetch("/proposals", { method: "POST", body: JSON.stringify(proposal) });
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
export function completeMilestone(bidId: number, milestoneIndex: number, proof: string) {
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

// ---- IPFS ----
export function uploadJsonToIPFS(data: any) {
  return apiFetch(`/ipfs/upload-json`, { method: "POST", body: JSON.stringify(data) });
}
export async function uploadFileToIPFS(file: File) {
  // Use direct Railway URL for file uploads too
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/ipfs/upload-file`, { method: "POST", body: fd }).catch((e) => {
    throw new Error(e?.message || "Failed to upload file");
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j?.error || `HTTP ${r.status}`);
  }
  return r.json();
}

// ---- Health / test ----
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
  completeMilestone,
  payMilestone,
  uploadJsonToIPFS,
  uploadFileToIPFS,
  healthCheck,
  testConnection,
};
// src/lib/api-server.ts
// Server-side specific API functions (no browser-specific code)

const API_BASE = process.env.API_BASE_URL || "https://milestone-api-production.up.railway.app";

export async function getProposalsServer(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/proposals`, { cache: 'no-store' });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - Failed to fetch proposals`);
  }
  
  return res.json();
}

export async function getBidsServer(proposalId?: number): Promise<any[]> {
  const url = proposalId ? `${API_BASE}/bids?proposalId=${proposalId}` : `${API_BASE}/bids`;
  const res = await fetch(url, { cache: 'no-store' });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - Failed to fetch bids`);
  }
  
  return res.json();
}

export async function getBidServer(id: number): Promise<any> {
  const res = await fetch(`${API_BASE}/bids/${id}`, { cache: 'no-store' });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - Failed to fetch bid`);
  }
  
  return res.json();
}
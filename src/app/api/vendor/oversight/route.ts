import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = (
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  ""
).replace(/\/$/, "");

async function fetchWithAuth(path: string, headers: HeadersInit) {
  if (!API) throw new Error("API_BASE is not set");
  const r = await fetch(`${API}${path}`, {
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json().catch(() => ({}));
}

// Helper to extract proofs from bid data
function extractProofsFromBids(bids: any[]): any[] {
  const proofs: any[] = [];
  
  for (const bid of bids) {
    if (bid.proofs && Array.isArray(bid.proofs)) {
      proofs.push(...bid.proofs.map((p: any) => ({
        ...p,
        bid_id: bid.id
      })));
    }
  }
  
  return proofs;
}

// Helper to extract payments from bid data
function extractPaymentsFromBids(bids: any[]): any[] {
  const payments: any[] = [];
  
  for (const bid of bids) {
    // Try different payment field names
    const bidPayments = 
      bid.payments || 
      bid.payouts || 
      bid.transactions || 
      [];
    
    if (Array.isArray(bidPayments)) {
      payments.push(...bidPayments.map((p: any) => ({
        ...p,
        bid_id: bid.id
      })));
    }
  }
  
  return payments;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const cookie = req.headers.get("cookie") || "";
  const headers = { authorization: auth, cookie };

  try {
    // Get vendor bids first
    let bids: any[] = [];
    
    // Try multiple bid endpoints
    const bidEndpoints = [
      "/bids?mine=1",
      "/vendor/bids", 
      "/bids"
    ];

    for (const endpoint of bidEndpoints) {
      try {
        const data = await fetchWithAuth(endpoint, headers);
        const bidData = Array.isArray(data) ? data : (data?.bids ?? data ?? []);
        if (bidData.length > 0) {
          bids = bidData;
          break;
        }
      } catch {
        continue;
      }
    }

    // Extract proofs and payments from bid data
    const proofs = extractProofsFromBids(bids);
    const payments = extractPaymentsFromBids(bids);

    // Get user role
    let role = null;
    try {
      role = await fetchWithAuth("/auth/role", headers);
    } catch {
      // Role endpoint might not be critical
    }

    const body = {
      bids,
      proofs,
      payments,
      role,
    };

    return NextResponse.json(body);
    
  } catch (e: any) {
    console.error("Vendor oversight error:", e);
    return NextResponse.json(
      { 
        error: e?.message || "Vendor oversight failed",
        bids: [],
        proofs: [],
        payments: [],
        role: null
      }, 
      { status: 500 }
    );
  }
}
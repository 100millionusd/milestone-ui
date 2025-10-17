import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = (
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  ""
).replace(/\/$/, "");

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const cookie = req.headers.get("cookie") || "";
  const headers = { authorization: auth, cookie };

  try {
    if (!API) throw new Error("API_BASE is not set");

    // Get bids first to know which ones to fetch proofs for
    const bidsResponse = await fetch(`${API}/vendor/bids`, {
      headers,
      credentials: "include",
      cache: "no-store",
    }).catch(() => fetch(`${API}/bids?mine=1`, { headers, credentials: "include", cache: "no-store" }));

    if (!bidsResponse?.ok) {
      return NextResponse.json({ proofs: [] });
    }

    const bidsData = await bidsResponse.json();
    const bids = Array.isArray(bidsData) ? bidsData : (bidsData?.bids ?? []);
    const bidIds = bids.map(b => b.id).filter(Boolean);

    if (bidIds.length === 0) {
      return NextResponse.json({ proofs: [] });
    }

    // Fetch proofs for each bid
    const allProofs = [];
    
    for (const bidId of bidIds) {
      try {
        const proofEndpoints = [
          `/bids/${bidId}/proofs`,
          `/vendor/bids/${bidId}/proofs`,
          `/proofs?bidId=${bidId}`
        ];

        for (const endpoint of proofEndpoints) {
          const r = await fetch(`${API}${endpoint}`, {
            headers,
            credentials: "include",
            cache: "no-store",
          });
          
          if (r.ok) {
            const data = await r.json();
            const proofs = Array.isArray(data) ? data : (data?.proofs ?? []);
            allProofs.push(...proofs);
            break;
          }
        }
      } catch {
        // Continue to next bid
        continue;
      }
    }

    return NextResponse.json({ proofs: allProofs });
    
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch vendor proofs" }, { status: 500 });
  }
}
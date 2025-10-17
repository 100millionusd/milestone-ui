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

    // Try vendor-specific endpoints first
    const endpoints = [
      "/vendor/bids",
      "/bids?mine=1", 
      "/my/bids",
      "/bids"
    ];

    for (const endpoint of endpoints) {
      try {
        const r = await fetch(`${API}${endpoint}`, {
          headers,
          credentials: "include",
          cache: "no-store",
        });
        
        if (r.ok) {
          const data = await r.json();
          const bids = Array.isArray(data) ? data : (data?.bids ?? data ?? []);
          if (bids.length > 0) {
            return NextResponse.json({ bids });
          }
        }
      } catch {
        // Continue to next endpoint
        continue;
      }
    }

    // If all endpoints fail, return empty
    return NextResponse.json({ bids: [] });
    
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch vendor bids" }, { status: 500 });
  }
}
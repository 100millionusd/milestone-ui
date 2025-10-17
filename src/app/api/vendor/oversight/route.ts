import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const API = (
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  ""
).replace(/\/$/, "");

async function go(path: string, headers: HeadersInit) {
  if (!API) throw new Error("API_BASE is not set");
  const r = await fetch(`${API}${path}`, {
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${data?.error || r.statusText}`);
  return data;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const cookie = req.headers.get("cookie") || "";
  const headers = { authorization: auth, cookie };

  try {
    // Get vendor-specific data
    const results = await Promise.allSettled([
      // Vendor bids
      go("/vendor/bids", headers).catch(() => go("/bids?mine=1", headers)),
      // Vendor proofs - try multiple endpoints
      go("/vendor/proofs", headers).catch(() => go("/proofs?mine=1", headers)).catch(() => ({ proofs: [] })),
      // Vendor payments
      go("/vendor/payments", headers).catch(() => go("/payments?mine=1", headers)).catch(() => ({ payments: [] })),
      // User role info
      go("/auth/role", headers),
    ]);

    const [bidsData, proofsData, paymentsData, roleData] = results.map(r =>
      r.status === "fulfilled" ? r.value : null
    );

    // Normalize the data structure for the frontend
    const body = {
      bids: Array.isArray(bidsData) ? bidsData : (bidsData?.bids ?? []),
      proofs: Array.isArray(proofsData) ? proofsData : (proofsData?.proofs ?? []),
      payments: Array.isArray(paymentsData) ? paymentsData : (paymentsData?.payments ?? paymentsData?.payouts ?? []),
      role: roleData,
      _errors: results
        .map((r, i) => (r.status === "rejected" ? { part: i, error: String(r.reason) } : null))
        .filter(Boolean),
    };

    return new NextResponse(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Vendor oversight aggregation failed" }, { status: 500 });
  }
}
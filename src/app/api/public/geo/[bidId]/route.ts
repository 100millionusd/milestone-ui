// app/api/public/geo/[bidId]/route.ts
import { NextResponse } from "next/server";

// Prefer NEXT_PUBLIC_API_BASE so the same value can be used client-side.
// Fallback to API_BASE, then hard-coded production base as a last resort.
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.API_BASE ||
  "https://milestone-api-production.up.railway.app";

// Disable caching for this proxy route
export const revalidate = 0;
export const dynamic = "force-dynamic";
// If you need to force Node runtime (optional):
// export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { bidId: string } }
) {
  const bidId = String(params?.bidId || "");

  if (!/^\d+$/.test(bidId)) {
    return NextResponse.json({ error: "Invalid bidId" }, { status: 400 });
  }

  const upstream = `${API_BASE}/public/geo/${encodeURIComponent(bidId)}`;

  try {
    const r = await fetch(upstream, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const text = await r.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Upstream returned non-JSON; pass a helpful error but keep JSON shape
      if (!r.ok) {
        return NextResponse.json(
          { error: `Upstream ${r.status}`, upstreamBody: text.slice(0, 500) },
          { status: r.status }
        );
      }
      // If 200 but body isn’t JSON, just return an empty array (component expects an array)
      return NextResponse.json([], { status: 200 });
    }

    // Forward upstream status but ensure JSON
    if (!r.ok) {
      return NextResponse.json(
        { error: `Upstream ${r.status}`, data },
        { status: r.status }
      );
    }

    // Ensure array shape for the frontend join logic
    if (!Array.isArray(data)) {
      return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Proxy failed", detail: String(err?.message || err) },
      { status: 502 }
    );
  }
}

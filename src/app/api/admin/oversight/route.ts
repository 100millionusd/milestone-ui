import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Helper to hit sibling API routes on the same origin and forward auth/cookies
async function pass(req: NextRequest, path: string) {
  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  const base = `${proto}://${host}`;
  const r = await fetch(`${base}${path}`, {
    headers: {
      cookie: req.headers.get("cookie") || "",
      authorization: req.headers.get("authorization") || "",
    },
    credentials: "include",
    cache: "no-store",
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(`${path} -> ${r.status} ${msg || r.statusText}`);
  }
  return r.json();
}

export async function GET(req: NextRequest) {
  try {
    const [summary, queue, alerts, audit, vendors, payouts] = await Promise.all([
      pass(req, "/api/admin/oversight/summary"),
      pass(req, "/api/admin/oversight/queue"),
      pass(req, "/api/admin/oversight/alerts"),
      pass(req, "/api/audit?take=50"),
      pass(req, "/api/admin/oversight/vendors"),
      pass(req, "/api/admin/oversight/payouts"),
    ]);

    return NextResponse.json({
      summary,
      queue,
      alerts,
      audit,
      vendors,
      payouts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Oversight aggregation failed" }, { status: 500 });
  }
}

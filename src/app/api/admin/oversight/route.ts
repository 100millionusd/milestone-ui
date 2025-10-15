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
  if (!API) throw new Error("API_BASE (or NEXT_PUBLIC_API_BASE[_URL]) is not set");
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
    const results = await Promise.allSettled([
      go("/admin/oversight/summary", headers),
      go("/admin/oversight/queue", headers),
      go("/admin/oversight/alerts", headers),
      go("/admin/audit/recent?take=50", headers),
      go("/admin/oversight/vendors", headers),
      go("/admin/oversight/payouts", headers),
    ]);

    const [summary, queue, alerts, audit, vendors, payouts] = results.map(r =>
      r.status === "fulfilled" ? r.value : null
    );

    // Map summary -> tiles; audit -> recent (shape expected by the page)
    const tiles = summary ? {
      openProofs: Number(summary.openProofs ?? 0),
      breachingSla: Number(summary.breachingSla ?? 0),
      pendingPayouts: {
        count: Number(summary.pendingPayouts?.count ?? 0),
        totalUSD: Number(summary.pendingPayouts?.totalUSD ?? 0),
      },
      escrowsLocked: Number(summary.escrowsLocked ?? 0) || 0,
      p50CycleHours: Number(summary.p50CycleHours ?? 0),
      revisionRatePct: Number(summary.revisionRatePct ?? 0),
    } : {
      openProofs: 0,
      breachingSla: 0,
      pendingPayouts: { count: 0, totalUSD: 0 },
      escrowsLocked: 0,
      p50CycleHours: 0,
      revisionRatePct: 0,
    };

    const body = {
      tiles,
      queue: queue ?? [],
      alerts: alerts ?? [],
      recent: audit ?? [],
      vendors: vendors ?? [],
      payouts: payouts ?? { pending: [], recent: [] },
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
    return NextResponse.json({ error: e?.message || "Oversight aggregation failed" }, { status: 500 });
  }
}

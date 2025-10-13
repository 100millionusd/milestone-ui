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

async function go(path: string, auth: string) {
  if (!API) throw new Error("API_BASE (or NEXT_PUBLIC_API_BASE[_URL]) is not set");
  const r = await fetch(`${API}${path}`, {
    headers: {
      authorization: auth || "",
    },
    credentials: "include",
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${data?.error || r.statusText}`);
  return data;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";

  try {
    const results = await Promise.allSettled([
      go("/admin/oversight/summary", auth),
      go("/admin/oversight/queue", auth),
      go("/admin/oversight/alerts", auth),
      go("/admin/audit/recent?take=50", auth),
      go("/admin/oversight/vendors", auth),
      go("/admin/oversight/payouts", auth),
    ]);

    const [summary, queue, alerts, audit, vendors, payouts] = results.map((r) =>
      r.status === "fulfilled" ? r.value : null
    );

    // Return partial data instead of 500 if one subcall fails
    const errors = results
      .map((r, i) => (r.status === "rejected" ? { part: i, error: String(r.reason) } : null))
      .filter(Boolean);

    return NextResponse.json(
      {
        summary,
        queue: queue ?? [],
        alerts: alerts ?? [],
        audit: audit ?? [],
        vendors: vendors ?? [],
        payouts: payouts ?? { pending: [], recent: [] },
        _errors: errors,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Oversight aggregation failed" }, { status: 500 });
  }
}

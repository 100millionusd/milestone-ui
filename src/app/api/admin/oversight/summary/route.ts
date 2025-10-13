import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const API = process.env.NEXT_PUBLIC_API_BASE;
  if (!API) return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE missing" }, { status: 500 });

  const headers = {
    cookie: req.headers.get("cookie") || "",
    authorization: req.headers.get("authorization") || "",
  };

  // proofs -> KPIs
  const pr = await fetch(`${API}/proofs`, { headers, credentials: "include", cache: "no-store" });
  const proofs = pr.ok ? await pr.json() : [];

  const SLA_HOURS = Number(process.env.NEXT_PUBLIC_SLA_REVIEW_HOURS || "48");
  const openStatuses = new Set(["pending", "changes_requested"]);
  const openProofs = proofs.filter((p: any) => openStatuses.has((p.status || "").toLowerCase())).length;

  const breachingSLA = proofs.filter((p: any) => {
    const created = new Date(p.createdAt || p.submittedAt || p.created_at || Date.now());
    const ageH = (Date.now() - created.getTime()) / 3600000;
    return openStatuses.has((p.status || "").toLowerCase()) && ageH > SLA_HOURS;
  }).length;

  // payments -> pending count
  const payRes = await fetch(`${API}/vendor/payments`, { headers, credentials: "include", cache: "no-store" });
  const payments = payRes.ok ? await payRes.json() : { pending: [], recent: [] };
  const pendingPayouts = Array.isArray(payments.pending) ? payments.pending.length : 0;

  // simple placeholder for cycle time if you don’t store durations yet
  const cycleTimeHoursP50 = 0;

  return NextResponse.json({
    openProofs,
    breachingSLA,
    pendingPayouts,
    escrowsLocked: 0,
    cycleTimeHoursP50,
    revisionRate: 0,
  });
}

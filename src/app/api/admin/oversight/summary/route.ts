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

const fwd = (req: NextRequest) => ({
  cookie: req.headers.get("cookie") || "",
  authorization: req.headers.get("authorization") || "",
});

export async function GET(req: NextRequest) {
  if (!API) return NextResponse.json({ error: "API_BASE missing" }, { status: 500 });

  const headers = fwd(req);

  // proofs
  const pr = await fetch(`${API}/proofs`, { headers, credentials: "include", cache: "no-store" });
  const proofs: any[] = pr.ok ? await pr.json() : [];

  const SLA_HOURS = Number(process.env.NEXT_PUBLIC_SLA_REVIEW_HOURS || "48");
  const openStatuses = new Set(["pending", "changes_requested"]);

  const openProofs = proofs.filter((p) => openStatuses.has((p.status || "").toLowerCase())).length;

  const breachingSLA = proofs.filter((p) => {
    const created = new Date(p.createdAt || p.submittedAt || p.created_at || Date.now());
    const ageH = (Date.now() - created.getTime()) / 3600000;
    return openStatuses.has((p.status || "").toLowerCase()) && ageH > SLA_HOURS;
  }).length;

  // payments
  const payRes = await fetch(`${API}/vendor/payments`, { headers, credentials: "include", cache: "no-store" });
  const payments = payRes.ok ? await payRes.json() : { pending: [], recent: [] };

  return NextResponse.json({
    openProofs,
    breachingSLA,
    pendingPayouts: Array.isArray(payments?.pending) ? payments.pending.length : 0,
    escrowsLocked: 0,          // update if/when you add escrow endpoint
    cycleTimeHoursP50: 0,      // placeholder until you compute it
    revisionRate: 0,           // placeholder until you compute it
  });
}

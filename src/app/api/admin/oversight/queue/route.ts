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

  const r = await fetch(`${API}/proofs`, {
    headers: fwd(req),
    credentials: "include",
    cache: "no-store",
  });

  if (!r.ok) {
    const txt = await r.text();
    return NextResponse.json(safe(txt), { status: r.status });
  }

  const proofs = await r.json();

  const status = req.nextUrl.searchParams.get("status") || "";
  const olderThanHours = Number(req.nextUrl.searchParams.get("olderThanHours") || "0");
  const SLA_HOURS = Number(process.env.NEXT_PUBLIC_SLA_REVIEW_HOURS || "48");
  const cutoff = olderThanHours ? Date.now() - olderThanHours * 3600_000 : 0;

  const rows = (Array.isArray(proofs) ? proofs : [])
    .filter((p: any) => {
      if (status && p.status !== status) return false;
      if (cutoff) {
        const ts = new Date(p.createdAt || p.submittedAt || p.created_at || 0).getTime();
        if (ts > cutoff) return false;
      }
      return true;
    })
    .map((p: any) => {
      const created = new Date(p.createdAt || p.submittedAt || p.created_at || Date.now());
      const ageH = Math.floor((Date.now() - created.getTime()) / 3600000);
      return {
        id: String(p.id ?? p.proof_id ?? `${p.bidId}-${p.milestoneIndex}`),
        bidId: Number(p.bidId ?? p.bid_id),
        milestoneIndex: Number(p.milestoneIndex ?? p.milestone_index ?? 0),
        vendor: p.vendorName || p.walletAddress || "—",
        project: p.title || p.note || `Bid ${p.bidId}`,
        status: p.status || "pending",
        submittedAt: created.toISOString(),
        ageHours: ageH,
        slaDueInHours: SLA_HOURS - ageH,
      };
    });

  return NextResponse.json(rows);
}

function safe(s: string) {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}

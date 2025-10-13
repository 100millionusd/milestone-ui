// src/app/api/admin/oversight/alerts/route.ts
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

export async function GET(req: NextRequest) {
  if (!API) {
    return NextResponse.json({ error: "API_BASE missing" }, { status: 500 });
  }

  const r = await fetch(`${API}/admin/oversight/alerts`, {
    headers: {
      cookie: req.headers.get("cookie") || "",
      authorization: req.headers.get("authorization") || "",
    },
    credentials: "include",
    cache: "no-store",
  });

  const raw = await r.json().catch(() => ([]));
  const list: any[] = Array.isArray(raw) ? raw : (raw.items || []);

  const titleFor = (type: string) => {
    switch (type) {
      case "ipfs_missing": return "IPFS file missing";
      case "sla_breach": return "SLA breach";
      case "risk": return "High-risk submission";
      case "payment_blocked": return "Payment blocked";
      case "missing_invoice": return "Invoice missing";
      default: return type?.replace(/_/g, " ") || "Alert";
    }
  };

  const normalized = list.map((a: any) => {
    const type = a.type ?? a.key ?? a.code ?? "alert";
    const createdAt = a.createdAt ?? a.created_at ?? a.time ?? null;

    // Try to craft a useful detail if backend didn't provide one
    const detail =
      a.detail ??
      a.message ??
      (a.cid ? `CID ${a.cid}` : null) ??
      (a.entity_id ? `#${a.entity_id}` : null);

    return {
      id: String(a.id ?? a.alert_id ?? a.uuid ?? `${type}-${createdAt || ""}`),
      type,
      title: titleFor(type),
      detail: detail || "",
      entityType: a.entityType ?? a.entity_type ?? a.scope ?? "",
      entityId: String(a.entityId ?? a.entity_id ?? a.target_id ?? ""),
      createdAt,
    };
  });

  return NextResponse.json(normalized, { status: r.status });
}

// src/app/api/audit/route.ts
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

  const take = req.nextUrl.searchParams.get("take") || "50";

  const r = await fetch(`${API}/admin/audit/recent?take=${encodeURIComponent(take)}`, {
    headers: {
      cookie: req.headers.get("cookie") || "",
      authorization: req.headers.get("authorization") || "",
    },
    credentials: "include",
    cache: "no-store",
  });

  const raw = await r.json().catch(() => ([]));
  // Some backends return {items: [...]}, some return [...]
  const list: any[] = Array.isArray(raw) ? raw : (raw.items || []);

  const normalized = list.map((e: any) => {
    const createdAt =
      e.createdAt || e.created_at || e.timestamp || e.time || null;

    return {
      id: String(e.id ?? e.event_id ?? e.uuid ?? cryptoRandom()),
      actorLabel: e.actorLabel ?? e.actor_label ?? e.actor ?? "System",
      action: e.action ?? e.event ?? e.type ?? "—",
      entityType: e.entityType ?? e.entity_type ?? e.entity ?? "",
      entityId: String(
        e.entityId ?? e.entity_id ?? e.target_id ?? e.subject_id ?? ""
      ),
      meta: e.meta ?? e.payload ?? e.details ?? null,
      createdAt,
    };
  });

  return NextResponse.json(normalized, { status: r.status });

  function cryptoRandom() {
    // very small helper so map() never throws if id missing
    return Math.random().toString(36).slice(2);
  }
}

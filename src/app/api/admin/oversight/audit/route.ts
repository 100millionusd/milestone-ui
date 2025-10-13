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
  if (!API) return NextResponse.json({ error: "API_BASE missing" }, { status: 500 });

  const take = req.nextUrl.searchParams.get("take") || "50";
  try {
    const r = await fetch(`${API}/admin/audit/recent?take=${encodeURIComponent(take)}`, {
      headers: {
        cookie: req.headers.get("cookie") || "",
        authorization: req.headers.get("authorization") || "",
      },
      credentials: "include",
      cache: "no-store",
    });
    const text = await r.text();
    return NextResponse.json(safe(text), { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: "fetch_failed", message: String(e) }, { status: 500 });
  }
}
function safe(s: string) { try { return JSON.parse(s); } catch { return { raw: s }; } }

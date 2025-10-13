import { NextRequest, NextResponse } from "next/server";

// accept API_BASE, NEXT_PUBLIC_API_BASE, or NEXT_PUBLIC_API_BASE_URL
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

    // bubble up upstream info so 500s are actionable
    const text = await r.text();
    const body = safeJson(text);
    return NextResponse.json(body, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: "fetch_failed", message: String(e) }, { status: 500 });
  }
}

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}

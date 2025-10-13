import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const API = process.env.NEXT_PUBLIC_API_BASE;
  if (!API) return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE missing" }, { status: 500 });

  const take = req.nextUrl.searchParams.get("take") || "50";
  const r = await fetch(`${API}/admin/audit/recent?take=${encodeURIComponent(take)}`, {
    headers: {
      cookie: req.headers.get("cookie") || "",
      authorization: req.headers.get("authorization") || "",
    },
    credentials: "include",
    cache: "no-store",
  });
  if (!r.ok) return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  return NextResponse.json(await r.json());
}

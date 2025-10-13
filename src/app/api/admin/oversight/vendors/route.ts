import { NextRequest, NextResponse } from "next/server";
const API = ((process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE) || "").replace(/\/$/, "");

export async function GET(req: NextRequest) {
  if (!API) return NextResponse.json({ error: "API_BASE missing" }, { status: 500 });
  const r = await fetch(`${API}/admin/vendors`, {
    headers: {
      cookie: req.headers.get("cookie") || "",
      authorization: req.headers.get("authorization") || "",
    },
    credentials: "include",
    cache: "no-store",
  });
  const body = await r.json().catch(() => ({}));
  return NextResponse.json(body, { status: r.status });
}

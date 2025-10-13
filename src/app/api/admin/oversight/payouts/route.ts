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

  const r = await fetch(`${API}/vendor/payments`, {
    headers: fwd(req),
    credentials: "include",
    cache: "no-store",
  });
  const txt = await r.text();
  return NextResponse.json(safe(txt), { status: r.status });
}

function safe(s: string) {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}

import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
  const API = process.env.NEXT_PUBLIC_API_BASE!;
  const r = await fetch(`${API}/vendor/payments`, {
    headers: { cookie: req.headers.get("cookie") || "" },
    credentials: "include",
    cache: "no-store",
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

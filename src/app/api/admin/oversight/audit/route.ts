import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
  const API = process.env.NEXT_PUBLIC_API_BASE!;
  const take = req.nextUrl.searchParams.get("take") || "50";
  const r = await fetch(`${API}/admin/audit/recent?take=${take}`, {
    headers: { cookie: req.headers.get("cookie") || "" },
    credentials: "include",
    cache: "no-store",
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const API = process.env.NEXT_PUBLIC_API_BASE!;
  const url = new URL(`${API}/admin/vendors`);
  for (const [k, v] of req.nextUrl.searchParams) url.searchParams.set(k, v);
  const r = await fetch(url, {
    headers: {
      cookie: req.headers.get("cookie") || "",
      authorization: req.headers.get("authorization") || "",
    },
    credentials: "include",
    cache: "no-store",
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

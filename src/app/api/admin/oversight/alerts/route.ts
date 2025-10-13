import { NextRequest, NextResponse } from "next/server";
export async function GET() {
  const API = process.env.NEXT_PUBLIC_API_BASE!;
  const r = await fetch(`${API}/admin/alerts`, { cache: "no-store" });
  return NextResponse.json(await r.json(), { status: r.status });
}

import { headers } from "next/headers";

const UPSTREAM =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE ||
  "https://milestone-api-production.up.railway.app";

function pass(res: Response, body: string) {
  return new Response(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function GET(request: Request) {
  const h = headers();
  const cookie = h.get("cookie") || "";
  const url = new URL(request.url);

  const mine = url.searchParams.get("mine") || "";
  const bidId = url.searchParams.get("bidId") || url.searchParams.get("bid_id") || "";

  // Try multiple upstream shapes: /payouts, /payments, and per-bid
  const attempts: string[] = [];

  if (mine) {
    attempts.push(`${UPSTREAM}/payouts?mine=${encodeURIComponent(mine)}`);
    attempts.push(`${UPSTREAM}/payments?mine=${encodeURIComponent(mine)}`);
  } else {
    attempts.push(`${UPSTREAM}/payouts`);
    attempts.push(`${UPSTREAM}/payments`);
  }

  if (bidId) {
    attempts.push(`${UPSTREAM}/payouts?bidId=${bidId}`);
    attempts.push(`${UPSTREAM}/payouts?bid_id=${bidId}`);
    attempts.push(`${UPSTREAM}/payments?bidId=${bidId}`);
    attempts.push(`${UPSTREAM}/payments?bid_id=${bidId}`);
    attempts.push(`${UPSTREAM}/bids/${bidId}/payouts`);
    attempts.push(`${UPSTREAM}/bids/${bidId}/payments`);
  }

  let last: Response | null = null;
  for (const u of attempts) {
    const res = await fetch(u, {
      method: "GET",
      headers: { ...(cookie ? { cookie } : {}), Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    if (res.ok) return pass(res, text);
    last = new Response(text, { status: res.status, headers: res.headers });
  }

  if (last) {
    const text = await last.text();
    return pass(last, text);
  }
  return new Response(JSON.stringify({ error: "No upstream tried" }), { status: 502 });
}

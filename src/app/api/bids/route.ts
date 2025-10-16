// src/app/api/bids/route.ts
import { headers } from 'next/headers';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE ||
  'https://milestone-api-production.up.railway.app';

export async function GET() {
  const h = headers();
  // Forward both cookie and authorization if present
  const cookie = h.get('cookie') || '';
  const auth = h.get('authorization') || '';

  const res = await fetch(`${API_BASE}/bids`, {
    method: 'GET',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(auth ? { authorization: auth } : {}),
      'content-type': 'application/json',
    },
    cache: 'no-store',
  });

  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') || 'application/json',
    },
  });
}

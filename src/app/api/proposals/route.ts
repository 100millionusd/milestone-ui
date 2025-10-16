// src/app/api/proposals/route.ts
import { headers } from 'next/headers';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE || 'https://milestone-api-production.up.railway.app';

export async function GET() {
  const h = headers();
  // forward browser cookies to the backend
  const cookie = h.get('cookie') || '';
  const res = await fetch(`${API_BASE}/proposals`, {
    method: 'GET',
    headers: { cookie, 'content-type': 'application/json' },
    // server-side request; no credentials mode needed
    cache: 'no-store',
  });

  // passthrough status and body
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
  });
}

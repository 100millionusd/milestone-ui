// src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

function killCookie(name: string) {
  // expires in the past, path=/, sameSite=Lax (or None if your app needs it)
  return `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;
}

export async function POST() {
  // Add any cookie names your backend might use
  const cookiesToClear = [
    'lx_jwt',
    'token',
    'auth',
    'session',
    'sid',
    'jwt',
  ];

  const res = new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  // Multiple Set-Cookie headers
  for (const c of cookiesToClear) {
    res.headers.append('Set-Cookie', killCookie(c));
  }

  return res;
}

// Also support GET just in case you call it from a link
export const GET = POST;

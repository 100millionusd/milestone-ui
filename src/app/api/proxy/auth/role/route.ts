// src/app/api/proxy/auth/role/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const jwt = req.cookies.get('lx_jwt')?.value;
  const res = await fetch('https://milestone-api-production.up.railway.app/auth/role', {
    headers: {
      cookie: `lx_jwt=${jwt}`,
      ...(req.headers.get('x-tenant-id') ? { 'X-Tenant-ID': req.headers.get('x-tenant-id')! } : {})
    },
    cache: 'no-store',
  });

  const data = await res.json();
  return NextResponse.json(data);
}

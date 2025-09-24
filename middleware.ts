// middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  'https://milestone-api-production.up.railway.app';

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Protect the Submit Proposal page
  if (pathname === '/new') {
    const cookie = req.headers.get('cookie') ?? '';

    try {
      const res = await fetch(`${API_BASE}/auth/role`, {
        headers: { cookie, accept: 'application/json' },
        cache: 'no-store',
      });

      const data = await res.json().catch(() => ({} as any));
      const role = (data?.role ?? 'guest') as 'admin' | 'vendor' | 'guest';

      if (role === 'guest') {
        const loginUrl = new URL('/vendor/login', req.url);
        const next = pathname + (search || '');
        loginUrl.searchParams.set('next', next);
        return NextResponse.redirect(loginUrl);
      }
    } catch {
      const loginUrl = new URL('/vendor/login', req.url);
      const next = pathname + (search || '');
      loginUrl.searchParams.set('next', next);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/new'],
};

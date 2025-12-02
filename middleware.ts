import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.API_BASE_URL ||
    'https://milestone-api-production.up.railway.app';

export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;
    const hostname = req.headers.get('host') || '';

    // 1. Tenant Resolution
    let tenantId = null;
    let tenantSlug = null;

    // Simple subdomain extraction: take the first part if it's not www or localhost (top-level)
    // Adjust logic if you use a multi-level domain like .co.uk or railway.app subdomains
    const isLocal = hostname.includes('localhost') || hostname.includes('127.0.0.1');
    const parts = hostname.split('.');

    let candidateSlug = null;

    // Priority:
    // 1. Query param ?tenant=slug (overrides everything)
    // 2. Cookie lx_tenant_slug
    // 3. Subdomain

    const tenantParam = searchParams.get('tenant');
    const tenantCookie = req.cookies.get('lx_tenant_slug')?.value;

    if (tenantParam) {
        candidateSlug = tenantParam;
    } else if (tenantCookie) {
        candidateSlug = tenantCookie;
    } else {
        if (isLocal) {
            // e.g. tenant1.localhost:3000 -> parts=['tenant1', 'localhost:3000']
            if (parts.length > 1 && parts[0] !== 'www') {
                candidateSlug = parts[0];
            }
        } else {
            // e.g. tenant1.lithiumx.app -> parts=['tenant1', 'lithiumx', 'app']
            // e.g. milestone-api-production.up.railway.app -> might be tricky, usually custom domains are used
            // For now, assume standard [slug].[domain].[tld]
            if (parts.length > 2 && parts[0] !== 'www') {
                candidateSlug = parts[0];
            }
        }
    }

    if (candidateSlug) {
        try {
            const res = await fetch(`${API_BASE}/api/tenants/lookup?slug=${candidateSlug}`, {
                headers: { accept: 'application/json' },
                next: { revalidate: 60 }, // Cache for 60s
            });
            if (res.ok) {
                const data = await res.json();
                tenantId = data.id;
                tenantSlug = data.slug;
            }
        } catch (e) {
            console.error('Tenant lookup failed', e);
        }
    }

    // 2. Clone request headers to inject tenant context
    const requestHeaders = new Headers(req.headers);
    if (tenantId) {
        requestHeaders.set('X-Tenant-ID', tenantId);
        requestHeaders.set('X-Tenant-Slug', tenantSlug);
    }

    // 3. Protect the Submit Proposal page (Existing Logic)
    if (pathname === '/new') {
        const cookie = req.headers.get('cookie') ?? '';

        try {
            // Pass the tenant header to the auth check too!
            const headers: Record<string, string> = { cookie, accept: 'application/json' };
            if (tenantId) headers['X-Tenant-ID'] = tenantId;

            const res = await fetch(`${API_BASE}/auth/role`, {
                headers,
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

    // 4. Return response with injected headers
    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    if (tenantId) {
        response.cookies.set('lx_tenant_id', tenantId);
        response.cookies.set('lx_tenant_slug', tenantSlug);
    }

    return response;
}

export const config = {
    // Match all paths except static files, images, etc.
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

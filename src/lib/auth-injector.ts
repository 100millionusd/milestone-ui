// src/lib/auth-injector.ts
/* eslint-disable no-console */

declare global {
  interface Window {
    __auth_injector_installed?: boolean;
  }
}

(() => {
  // Only run in the browser, once.
  if (typeof window === 'undefined') return;
  if (window.__auth_injector_installed) return;
  window.__auth_injector_installed = true;

  // Read base URL at runtime (Next.js will inline the value)
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
  const IS_RELATIVE_BASE = API_BASE.startsWith('/'); // e.g. "/api"
  const REL_PREFIX = IS_RELATIVE_BASE ? API_BASE.replace(/\/+$/, '') : ''; // "/api" (no trailing slash)

  let ABS_ORIGIN: string | null = null;
  if (!IS_RELATIVE_BASE && API_BASE) {
    try {
      ABS_ORIGIN = new URL(API_BASE).origin; // e.g. "https://milestone-api-production.up.railway.app"
    } catch {
      ABS_ORIGIN = null;
    }
  }

  // Helper: detect if a given URL is targeting our API
  function isApiRequest(url: URL): boolean {
    if (IS_RELATIVE_BASE) {
      // Same-origin, via Netlify proxy, e.g. "/api/*"
      return url.origin === window.location.origin && url.pathname.startsWith(REL_PREFIX + '/');
    }
    // Absolute API base: calls that already go to the API origin are API calls
    if (ABS_ORIGIN && url.origin === ABS_ORIGIN) return true;

    // Additionally, allow local "/api/*" to be rewritten to absolute API (dev convenience)
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) return true;

    return false;
  }

  // Helper: when we need to talk to the absolute backend origin
  // - If using relative base (/api), DO NOT rewrite — keep same-origin so Netlify proxy handles it.
  // - If using absolute base, ensure request hits the ABS_ORIGIN and strip any leading "/api".
  function toBackendUrl(current: URL): URL {
    if (IS_RELATIVE_BASE) {
      // Same-origin proxy mode: just keep the URL as-is
      return new URL(current.href);
    }

    // Absolute backend origin mode
    const target = new URL(current.href);
    if (!ABS_ORIGIN) return target;

    const backend = new URL(ABS_ORIGIN);
    // If caller used same-origin "/api/*", rewrite to absolute backend and drop the /api prefix.
    if (target.origin === window.location.origin && target.pathname.startsWith('/api/')) {
      target.protocol = backend.protocol;
      target.host = backend.host;
      target.pathname = target.pathname.replace(/^\/api(\/|$)/i, '/');
      return target;
    }

    // If caller already used the absolute origin (e.g. `${API_BASE}/bids`), keep it.
    return target;
  }

  // Add cache-busting for GET/HEAD only, avoid duplicate _ts
  function addTimestampParam(url: URL, method: string) {
    if (method === 'GET' || method === 'HEAD') {
      if (!url.searchParams.has('_ts')) {
        url.searchParams.set('_ts', Date.now().toString());
      }
    }
  }

  // Pull token from common keys
  function getBearerToken(): string | null {
    try {
      return (
        localStorage.getItem('lx_jwt') ||
        localStorage.getItem('lx_token') ||
        localStorage.getItem('token')
      );
    } catch {
      return null;
    }
  }

  const origFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Normalize to a URL we can inspect
    const url = (() => {
      try {
        if (typeof input === 'string') return new URL(input, window.location.href);
        if (input instanceof URL) return input;
        return new URL((input as Request).url, window.location.href);
      } catch (e) {
        console.error('[auth-injector] Failed to resolve URL from fetch input:', e);
        throw e;
      }
    })();

    const nextInit: RequestInit = { ...init };

    // Always include cookies (works for both same-origin and CORS with credentials)
    nextInit.credentials = 'include';

    // Respect caller's mode if set; otherwise allow CORS
    if (!nextInit.mode) nextInit.mode = 'cors';

    // Merge/normalize headers
    const headers = new Headers(
      (nextInit.headers as HeadersInit) ||
        ((input as Request)?.headers as HeadersInit) ||
        undefined
    );

    // Determine method
    const method =
      (nextInit.method || (input as Request)?.method || 'GET').toString().toUpperCase();

    // Identify API calls
    const apiCall = isApiRequest(url);

    // If it's an API call, ensure we hit the right origin (when absolute base)
    const targetUrl = apiCall ? toBackendUrl(url) : url;

    // Add cache-busting for GET/HEAD to avoid stale caches/CDNs
    addTimestampParam(targetUrl, method);

    // Attach Authorization header (fallback to JWT) only for API calls
    if (apiCall && !headers.has('Authorization')) {
      const token = getBearerToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    // Set Content-Type when body looks like JSON but caller didn't set it
    if (!headers.has('Content-Type') && nextInit.body && typeof nextInit.body === 'string') {
      try {
        JSON.parse(nextInit.body);
        headers.set('Content-Type', 'application/json');
      } catch {
        // not JSON, ignore
      }
    }

    nextInit.headers = headers;

    // Actually perform the request using a Request object so the rewritten URL is respected.
    const req = new Request(targetUrl.toString(), {
      // Important: preserve body for non-GET/HEAD
      body: nextInit.body as BodyInit | null | undefined,
      cache: nextInit.cache,
      credentials: nextInit.credentials,
      headers: nextInit.headers as HeadersInit,
      integrity: nextInit.integrity,
      keepalive: nextInit.keepalive,
      method,
      mode: nextInit.mode,
      redirect: nextInit.redirect,
      referrer: (nextInit as any).referrer,
      referrerPolicy: nextInit.referrerPolicy,
      signal: nextInit.signal,
      // @ts-expect-error: TS lib omits some init props — this is safe in browsers
      window: (nextInit as any).window,
    });

    const res = await origFetch(req);

    // Helpful log if API says 401
    if (apiCall && res.status === 401) {
      const authHint = IS_RELATIVE_BASE
        ? '- Using Netlify proxy (/api). If relying on cookies, ensure the backend sets a cookie for your Netlify domain (omit Domain=...) with Path=/ and SameSite=Lax/None.\n'
        : '- Cross-site to absolute API. Ensure CORS allows credentials and Authorization header, and cookie has SameSite=None; Secure.\n';

      console.warn(
        `[auth-injector] 401 from ${targetUrl.pathname}\n` +
          authHint +
          '- If relying on Bearer, confirm localStorage has a valid token (lx_jwt / lx_token / token).'
      );
    }

    return res;
  };
})();

export {};

'use client';

// If you can, derive this from env or your api.ts export.
// For now, keep it literal:
const API_ORIGIN = 'https://milestone-api-production.up.railway.app';

function b64urlDecode(s: string) {
  // make base64url → base64
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  // pad
  while (s.length % 4) s += '=';
  return atob(s);
}

function getToken(): string | null {
  try {
    // ✅ include lx_jwt (what your app sets)
    const keys = ['lx_jwt', 'lx_token', 'token'];
    for (const k of keys) {
      const t = localStorage.getItem(k);
      if (!t) continue;

      // optional: auto-logout if expired
      try {
        const payload = JSON.parse(b64urlDecode(t.split('.')[1] || ''));
        if (payload?.exp && Date.now() > payload.exp * 1000) {
          localStorage.removeItem(k);
          continue;
        }
      } catch {
        // ignore decode errors; still attempt to use token
      }
      return t;
    }

    // last-resort: scan for any JWT-ish string
    const anyJwt = Object.values(localStorage).find(
      (v) => typeof v === 'string' && v.split('.').length === 3 && v.length > 40
    );
    return (anyJwt as string) || null;
  } catch {
    return null;
  }
}

(function installFetchInjector() {
  if (typeof window === 'undefined') return;
  if ((window as any).__authInjectorInstalled) return;
  (window as any).__authInjectorInstalled = true;

  const origFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    // Normalize to absolute URL
    let href = typeof input === 'string' ? input : (input as Request).url;
    let u: URL;
    try { u = new URL(href, location.href); } catch { return origFetch(input as any, init); }

    const isRailwayAPI = u.origin === API_ORIGIN;
    const isNextProxy  = u.origin === location.origin && u.pathname.startsWith('/api/');

    if (isRailwayAPI || isNextProxy) {
      // Start with headers from Request object (if any)...
      const headers = new Headers(typeof input !== 'string' ? (input as Request).headers : undefined);
      // ...then merge any incoming init.headers on top
      if (init.headers) new Headers(init.headers as any).forEach((v, k) => headers.set(k, v));

      if (!headers.has('authorization')) {
        const tok = getToken();
        if (tok) headers.set('authorization', `Bearer ${tok}`);
      }

      init = { ...init, headers };
    }

    return origFetch(input as any, init);
  };

  if (process.env.NODE_ENV !== 'production') {
    console.log('🔒 Bearer fetch injector active for', { API_ORIGIN, nextProxyOrigin: location.origin });
  }
})();

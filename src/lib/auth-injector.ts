'use client';

// Set this to your API origin
const API_ORIGIN = 'https://milestone-api-production.up.railway.app';

function getToken(): string | null {
  try {
    const t =
      localStorage.getItem('lx_token') ||
      localStorage.getItem('token') ||
      Object.values(localStorage).find(v => (v || '').split('.').length === 3 && (v as string).length > 40);
    if (!t) return null;

    // optional: auto-logout if expired
    const p = JSON.parse(atob((t as string).split('.')[1]));
    if (p?.exp && Date.now() > p.exp * 1000) {
      console.warn('JWT expired; clearing');
      localStorage.removeItem('lx_token');
      localStorage.removeItem('token');
      return null;
    }
    return t as string;
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
    let href = typeof input === 'string' ? input : (input as Request).url;
    try { href = new URL(href, location.href).href; } catch {}

    let origin = '';
    try { origin = new URL(href).origin; } catch {}

    if (origin === API_ORIGIN) {
      const headers = new Headers(
        (init && init.headers) ||
        (typeof input !== 'string' ? (input as Request).headers : undefined)
      );
      if (!headers.get('authorization')) {
        const tok = getToken();
        if (tok) headers.set('authorization', 'Bearer ' + tok);
      }
      init = { mode: 'cors', credentials: 'omit', ...init, headers };
    }
    return origFetch(input, init);
  };

  if (process.env.NODE_ENV !== 'production') {
    console.log('🔒 Bearer fetch injector installed for', API_ORIGIN);
  }
})();


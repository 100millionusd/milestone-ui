/**
 * auth-injector.ts
 *
 * Intercepts fetch() to:
 *  - Always call the API origin (rewrite /bids, /api/bids, etc. to the backend)
 *  - Include cross-site credentials (cookies) for auth (SameSite=None; Secure)
 *  - Optionally attach Authorization: Bearer <token> if present in localStorage
 *  - Add a cache-busting _ts param to GET requests
 *
 * Safe to import on the client. No-op on the server.
 */

const API_ORIGIN =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE ||
      process.env.NEXT_PUBLIC_API))?.replace(/\/+$/, "") ||
  "https://milestone-api-production.up.railway.app";

// Keys we might have stored a JWT under (keep broad for compatibility)
const TOKEN_KEYS = ["lx_jwt", "lx_token", "token"];

function getToken(): string | null {
  try {
    if (typeof window === "undefined") return null;
    for (const k of TOKEN_KEYS) {
      const v = window.localStorage.getItem(k);
      if (v && v.trim()) return v.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function addTsParam(u: URL): void {
  if (!u.searchParams.has("_ts")) {
    u.searchParams.set("_ts", `${Date.now()}`);
  }
}

function isApiPath(u: URL): boolean {
  // True if already the API origin
  if (u.origin === API_ORIGIN) return true;

  // Rewrite common backend routes even if called relatively or against the site origin
  // Matches: /bids, /api/bids, /proposals, /proofs, /auth, /ipfs
  const p = u.pathname;
  return /^\/(?:api\/)?(bids|proposals|proofs|auth|ipfs)(\/|$)/.test(p);
}

function rewriteToApiOrigin(u: URL): URL {
  if (u.origin !== API_ORIGIN) {
    // Keep path/query/hash; switch host to API
    const api = new URL(u.href, u);
    const target = new URL(API_ORIGIN);
    api.protocol = target.protocol;
    api.host = target.host;
    api.pathname = u.pathname; // ensure no double slashes
    return api;
  }
  return u;
}

function hasAuthHeader(headers: Headers): boolean {
  // Headers is case-insensitive, but some polyfills are picky—check both
  return headers.has("authorization") || headers.has("Authorization");
}

export function installAuthInjector(): void {
  if (typeof window === "undefined") return;

  const g = window as any;
  if (g.__authInjectorInstalled) return;
  g.__authInjectorInstalled = true;

  const originalFetch: typeof fetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      // Normalize to a URL we can operate on
      const href =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : (input as Request).url;

      const current = new URL(href, window.location.href);

      // Only touch API requests (already API host, or known API paths on site origin)
      if (isApiPath(current)) {
        // Ensure it goes to the API host
        const targetUrl = rewriteToApiOrigin(current);

        // Prepare headers, preserving any incoming ones
        const headers = new Headers(
          (init && init.headers) ||
            (typeof input !== "string" && !(input instanceof URL)
              ? (input as Request).headers
              : undefined)
        );

        // Optional: attach Bearer token if present and not already set
        if (!hasAuthHeader(headers)) {
          const tok = getToken();
          if (tok) headers.set("Authorization", `Bearer ${tok}`);
        }

        // For GET/HEAD, add a cache-busting param
        const method = (init?.method ||
          (typeof input !== "string" && !(input instanceof URL)
            ? (input as Request).method
            : "GET")
        ).toUpperCase();

        if (method === "GET" || method === "HEAD") {
          addTsParam(targetUrl);
        }

        // Build final init with cross-site cookies allowed
        const finalInit: RequestInit = {
          ...init,
          mode: "cors",
          credentials: "include", // CRITICAL for cookie-based auth cross-site
          headers,
        };

        // Always pass a string URL to avoid Request cloning issues
        return originalFetch(targetUrl.href, finalInit);
      }

      // Not an API path—fall through untouched
      return originalFetch(input as any, init);
    } catch {
      // If anything goes wrong in the injector, don't block the request
      return originalFetch(input as any, init);
    }
  };
}

// Auto-install on the client when imported
if (typeof window !== "undefined") {
  try {
    installAuthInjector();
  } catch {
    // ignore
  }
}

export default installAuthInjector;

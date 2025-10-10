/**
 * auth-injector.ts
 *
 * Intercepts fetch() to:
 *  - Route API calls to the backend origin
 *  - Strip a leading /api prefix (so /api/bids -> /bids on the backend)
 *  - Include cross-site cookies (credentials: 'include')
 *  - Optionally add Authorization: Bearer <token> from localStorage
 *  - Add a cache-busting _ts param to GET/HEAD
 */

const API_ORIGIN =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE ||
      process.env.NEXT_PUBLIC_API))?.replace(/\/+$/, "") ||
  "https://milestone-api-production.up.railway.app";

// Possible localStorage keys that may contain a JWT
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

function normalizeApiPath(pathname: string): string {
  // Convert /api, /api/, /api/xyz -> /, /, /xyz
  return pathname.replace(/^\/api(\/|$)/, "/");
}

function isLikelyApiPath(u: URL): boolean {
  // Already on backend origin? Treat as API.
  if (u.origin === API_ORIGIN) return true;

  // Heuristic: our app’s backend collections
  const p = u.pathname;
  return /^\/(?:api\/)?(bids|proposals|proofs|auth|ipfs)(\/|$)/.test(p);
}

function toBackendUrl(current: URL): URL {
  // Always target backend origin
  const target = new URL(current.href);
  const backend = new URL(API_ORIGIN);

  target.protocol = backend.protocol;
  target.host = backend.host;

  // Normalize any leading /api prefix before hitting the backend
  target.pathname = normalizeApiPath(target.pathname);

  // Clean double slashes (rare)
  target.pathname = target.pathname.replace(/\/{2,}/g, "/");

  return target;
}

function hasAuthHeader(headers: Headers): boolean {
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
      const href =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : (input as Request).url;

      const current = new URL(href, window.location.href);

      // Only rewrite/augment for API requests
      if (isLikelyApiPath(current)) {
        const targetUrl = toBackendUrl(current);

        // Prepare headers, preserving any caller-provided ones
        const headers = new Headers(
          (init && init.headers) ||
            (typeof input !== "string" && !(input instanceof URL)
              ? (input as Request).headers
              : undefined)
        );

        // Optional Bearer
        if (!hasAuthHeader(headers)) {
          const tok = getToken();
          if (tok) headers.set("Authorization", `Bearer ${tok}`);
        }

        // Add cache buster for GET/HEAD
        const method = (init?.method ||
          (typeof input !== "string" && !(input instanceof URL)
            ? (input as Request).method
            : "GET")
        ).toUpperCase();

        if (method === "GET" || method === "HEAD") {
          addTsParam(targetUrl);
        }

        // Ensure cookies are sent cross-site
        const finalInit: RequestInit = {
          ...init,
          mode: "cors",
          credentials: "include",
          headers,
        };

        return originalFetch(targetUrl.href, finalInit);
      }

      // Non-API request: pass through unchanged
      return originalFetch(input as any, init);
    } catch {
      // If something goes wrong here, don't block the request
      return originalFetch(input as any, init);
    }
  };
}

// Auto-install on client import
if (typeof window !== "undefined") {
  try {
    installAuthInjector();
  } catch {
    // ignore
  }
}

export default installAuthInjector;

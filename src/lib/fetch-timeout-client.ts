// Hard timeout for CLIENT-SIDE fetches (default 5s). Per-call override via init._timeout.
(() => {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const OG = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const timeoutMs = (init as any)?._timeout ?? 5000; // change default here if you want
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    // If caller provided a signal, link aborts
    if (init.signal) {
      const s = init.signal as AbortSignal;
      if (s.aborted) ctrl.abort();
      else s.addEventListener('abort', () => ctrl.abort(), { once: true });
    }

    const merged: RequestInit = { ...init, signal: ctrl.signal };
    return OG(input, merged).finally(() => clearTimeout(timer));
  };
})();

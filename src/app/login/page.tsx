'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginRedirect() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    // Prefer sending users to a public page that has your "Connect Wallet" button.
    // Change this if your connect screen lives elsewhere.
    const DEFAULT_TARGET = '/'; // e.g., '/vendor' if that's your connect page

    // If a next= param is present, only use it if it's a safe, internal path.
    const next = sp.get('next');
    const safeNext =
      next && next.startsWith('/') && !next.startsWith('//') ? next : null;

    // Optional: stash next so your login flow can redirect after success.
    if (safeNext) {
      try { sessionStorage.setItem('post_login_next', safeNext); } catch {}
    }

    // Redirect to your public entry page (no guard), where you connect MetaMask.
    router.replace(DEFAULT_TARGET);
  }, [router, sp]);

  return null;
}

'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { getAuthRole } from '@/lib/api';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

type Role = 'admin' | 'vendor' | 'guest';

export default function HeroCtas({ className = '' }: { className?: string }) {
  const { address } = useWeb3Auth();
  const [role, setRole] = useState<Role>('guest');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info = await getAuthRoleOnce();
        if (alive) setRole(info.role);
      } catch {
        if (alive) setRole('guest');
      }
    })();
    return () => { alive = false; };
  }, []);

  // Logged in if either cookie says admin/vendor or wallet is connected
  const authed = role !== 'guest' || !!address;

  const projectsHref = authed ? '/projects' : '/vendor/login?next=/projects';
  const submitHref   = authed ? '/new'      : '/vendor/login?next=/new';

  return (
    <div className={`flex flex-wrap items-center justify-center gap-4 ${className}`}>
      <Link
        href={projectsHref}
        className="inline-flex items-center justify-center rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-white hover:bg-cyan-600"
      >
        Browse Projects
      </Link>
      <Link
        href={submitHref}
        className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10"
      >
        Submit Proposal
      </Link>
    </div>
  );
}

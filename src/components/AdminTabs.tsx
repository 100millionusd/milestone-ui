// src/components/AdminTabs.tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Props = {
  /** If false, the Vendors tab is hidden */
  isAdmin: boolean;
};

function cx(...cls: (string | false | null | undefined)[]) {
  return cls.filter(Boolean).join(' ');
}

export default function AdminTabs({ isAdmin }: Props) {
  const sp = useSearchParams();
  const active = (sp.get('tab') || 'proposals').toLowerCase();

  const items = [
    { key: 'proposals', label: 'Proposals', href: '/admin/dashboard?tab=proposals' },
    { key: 'bids',      label: 'Bids',      href: '/admin/dashboard?tab=bids' },
    // Vendors tab only for admins
    ...(isAdmin ? [{ key: 'vendors', label: 'Vendors', href: '/admin/dashboard?tab=vendors' }] : []),
  ];

  return (
    <div className="mb-4 border-b">
      <nav className="-mb-px flex gap-4">
        {items.map((item) => {
          const isActive = active === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false} // ⟵ disable RSC/page prefetch to cut background requests
              aria-current={isActive ? 'page' : undefined}
              className={cx(
                'px-3 py-2 text-sm font-medium border-b-2',
                isActive
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

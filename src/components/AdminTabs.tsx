'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Tab = { key: string; label: string; href: string };

export default function AdminTabs({ isAdmin }: { isAdmin: boolean }) {
  const sp = useSearchParams();
  const active = (sp.get('tab') || (isAdmin ? 'vendors' : 'proposals')).toLowerCase();

  const base: Tab[] = [
    { key: 'proposals', label: 'Proposals', href: '/admin/dashboard?tab=proposals' },
    { key: 'bids',      label: 'Bids',      href: '/admin/dashboard?tab=bids' },
  ];
  const tabs = isAdmin
    ? [...base, { key: 'vendors', label: 'Vendors', href: '/admin/dashboard?tab=vendors' }]
    : base;

  return (
    <div className="border-b mb-4">
      <nav className="flex gap-4">
        {tabs.map(t => {
          const isActive = active === t.key;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`px-3 py-2 -mb-px border-b-2 text-sm ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

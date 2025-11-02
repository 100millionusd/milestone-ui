export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import Link from 'next/link';
import { getTemplates } from '@/lib/api';

export default async function TemplatesPage() {
  const items = await getTemplates().catch(() => []);
  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Templates</h1>
      <p className="text-sm text-gray-500 mb-6">Start bids from a curated baseline.</p>

      <div className="grid md:grid-cols-2 gap-4">
        {items.map(t => (
          <Link
            key={t.id}
            href={`/templates/${encodeURIComponent(t.slug || String(t.id))}`}
            className="block rounded-xl border border-gray-200 p-4 hover:shadow-md transition"
          >
            <div className="text-lg font-medium">{t.title}</div>
            <div className="text-xs text-gray-500 mt-1">{t.category || 'General'} • {t.milestones} milestones</div>
            {t.summary ? <p className="text-sm text-gray-600 mt-2 line-clamp-3">{t.summary}</p> : null}
          </Link>
        ))}
      </div>
    </main>
  );
}

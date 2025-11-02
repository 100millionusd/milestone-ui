// app/bids/new/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import Link from 'next/link';
import { getTemplates } from '@/lib/api';

type SearchParams = Record<string, string | string[] | undefined>;
function toNumber(v: string | string[] | undefined): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number.parseInt(String(s ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default async function Page({ searchParams }: { searchParams?: SearchParams }) {
  const proposalId = toNumber(searchParams?.proposalId);
  const pidQS = proposalId ? `?proposalId=${encodeURIComponent(String(proposalId))}` : '';
  const templates = await getTemplates().catch(() => []);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-2xl font-semibold">Create a Bid</h1>
        <Link
          href={`/vendor/bids/new${pidQS}`}
          prefetch={false}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Start standard bid
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Or start from a template</h2>
        {templates.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm text-gray-600">
            No templates available. Ask an admin to add one via <code>POST /templates</code>.
          </div>
        ) : (
          <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t: any) => {
              const idOrSlug = encodeURIComponent(t.slug || String(t.id));
              return (
                <li key={t.slug || t.id} className="border rounded-xl p-4">
                  <div className="text-base font-medium">{t.title}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {(t.category || 'General')} • {(t.locale || '—')} • {(typeof t.milestones === 'number' ? t.milestones : 0)} milestones
                  </div>
                  {t.summary ? <p className="mt-2 text-sm text-gray-700 line-clamp-3">{t.summary}</p> : null}
                  <Link
                    href={`/templates/${idOrSlug}${pidQS}`}
                    prefetch={false}
                    className="mt-3 inline-block rounded-lg bg-cyan-600 text-white px-3 py-1.5 text-sm hover:bg-cyan-700"
                  >
                    Use this template →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

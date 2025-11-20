'use client';

import { useEffect, useState } from 'react';
import { getPublicProjects } from '@/lib/api';
import PublicProjectsGrid from '@/components/PublicProjectsGrid';

export default function PublicProjectsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const rows = await getPublicProjects();
      const list = Array.isArray(rows) ? rows.slice() : [];
      list.sort((a: any, b: any) =>
        String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''))
      );
      setItems(list);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-lg font-bold mb-6">Projects</h1>

      {loading && <p className="text-sm text-gray-500">Loading public projects…</p>}

      {!loading && err && (
        <div className="space-y-3">
          <p className="text-sm text-red-600">{err}</p>
          <button
            onClick={load}
            className="inline-flex items-center px-3 py-1.5 rounded bg-slate-900 text-white text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !err && items.length === 0 && (
        <p className="text-sm text-gray-500">No public projects yet.</p>
      )}

      {!loading && !err && items.length > 0 && (
        <PublicProjectsGrid items={items} initialPageSize={8} />
      )}
    </div>
  );
}

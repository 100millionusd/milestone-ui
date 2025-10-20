'use client';

import { useMemo, useState } from "react";
import PublicProjectCard from "./PublicProjectCard";

// dedupe helper
function uniqueBy<T>(arr: T[], key: (t: T) => string) {
  const m = new Map<string, T>();
  for (const it of arr) m.set(key(it), it);
  return Array.from(m.values());
}

function primaryImageOf(p: any): string {
  return (
    (p?.imageUrl as string) ||
    (p?.coverImage as string) ||
    (Array.isArray(p?.images) ? String(p.images[0] || "") : "") ||
    ""
  );
}

type Props = {
  items: any[];
  initialPageSize?: number; // default 8
  step?: number;            // how many to add per click (default = initialPageSize)
};

export default function PublicProjectsGrid({ items, initialPageSize = 8, step }: Props) {
  const [visible, setVisible] = useState(initialPageSize);

  // dedupe once by primary image url (fallback to id so items without images still render)
  const deduped = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return uniqueBy(items, (p) => primaryImageOf(p) || String(p?.proposalId ?? p?.bidId ?? ""));
  }, [items]);

  const count = deduped.length;
  const sliceTo = Math.min(visible, count);
  const stepSize = step ?? initialPageSize;

  const list = useMemo(() => deduped.slice(0, sliceTo), [deduped, sliceTo]);

  return (
    <div>
      {/* grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.map((p: any) => (
          <PublicProjectCard
            key={p.proposalId ?? p.bidId ?? primaryImageOf(p)}
            project={p}
          />
        ))}
      </div>

      {/* load more */}
      {sliceTo < count && (
        <div className="flex justify-center mt-8">
          <button
            type="button"
            onClick={() => setVisible((v) => Math.min(v + stepSize, count))}
            className="px-4 py-2 text-sm rounded-xl border"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

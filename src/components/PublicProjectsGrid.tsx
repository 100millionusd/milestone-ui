'use client';

import { useMemo, useState } from "react";
import PublicProjectCard from "./PublicProjectCard";

type Props = {
  items: any[];
  initialPageSize?: number; // default 8
  step?: number;            // how many to add per click (default = initialPageSize)
};

export default function PublicProjectsGrid({ items, initialPageSize = 8, step }: Props) {
  const [visible, setVisible] = useState(initialPageSize);
  const count = Array.isArray(items) ? items.length : 0;
  const sliceTo = Math.min(visible, count);
  const stepSize = step ?? initialPageSize;

  const list = useMemo(
    () => (Array.isArray(items) ? items.slice(0, sliceTo) : []),
    [items, sliceTo]
  );

  return (
    <div>
      {/* grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.map((p: any) => (
          <PublicProjectCard key={p.proposalId ?? p.bidId} project={p} />
        ))}
      </div>

      {/* footer / load more */}
      {sliceTo < count && (
        <div className="mt-8 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setVisible(v => Math.min(count, v + stepSize))}
            className="rounded-full bg-black text-white px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Load more
          </button>
          <div className="text-xs text-gray-500">
            Showing {sliceTo} of {count}
          </div>
        </div>
      )}

      {sliceTo >= count && count > 0 && (
        <div className="mt-8 text-center text-xs text-gray-500">
          You&apos;re all caught up — {count} project{count === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}

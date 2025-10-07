'use client';

import useSWR from "swr";

const EXPLORER_BASE = process.env.NEXT_PUBLIC_EXPLORER_BASE || ""; // e.g. https://basescan.org

type Props = { proposalId: number };

export default function AuditBadge({ proposalId }: Props) {
  const { data } = useSWR(`/api/public/audit/${proposalId}`, (u) => fetch(u).then(r => r.json()), { revalidateOnFocus: false });
  const s = data?.summary;

  if (!s) return null;

  if (!s.anchored) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
        Not anchored yet
      </span>
    );
  }

  const href = (EXPLORER_BASE && s.txHash) ? `${EXPLORER_BASE}/tx/${s.txHash}` : undefined;

  return (
    <a
      href={href || "#"}
      target={href ? "_blank" : undefined}
      className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
      title={href ? "View anchor transaction" : "Anchored"}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 mr-1">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd"/>
      </svg>
      Anchored
    </a>
  );
}

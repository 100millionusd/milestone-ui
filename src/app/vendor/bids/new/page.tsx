// app/vendor/bids/new/page.tsx
// Server Component wrapper to force runtime rendering (no caching)
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import VendorBidNewClient from './VendorBidNewClient';

type SearchParams = Record<string, string | string[] | undefined>;

function toNumber(v: string | string[] | undefined): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number.parseInt(String(s ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function Page({ searchParams }: { searchParams?: SearchParams }) {
  const proposalId = toNumber(searchParams?.proposalId);
  return <VendorBidNewClient proposalId={proposalId} />;
}

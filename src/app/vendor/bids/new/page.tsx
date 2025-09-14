// Server Component wrapper to force runtime rendering
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import VendorBidNewClient from './VendorBidNewClient';

type SearchParams = { [key: string]: string | string[] | undefined };

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  const raw = searchParams?.proposalId;
  const proposalId = Number(Array.isArray(raw) ? raw[0] : raw || '0');
  return <VendorBidNewClient proposalId={proposalId} />;
}

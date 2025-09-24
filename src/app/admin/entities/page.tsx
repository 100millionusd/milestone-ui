// src/app/admin/entities/page.tsx
import dynamic from 'next/dynamic';
import { listProposals } from '@/lib/api';

// Load client component dynamically (no SSR required)
const AdminProposalsClient = dynamic(
  () => import('@/components/AdminProposalsClient'),
  { ssr: false }
);

export default async function AdminEntitiesPage() {
  // We can pass empty initial proposals; the client will start in 'entities' mode and
  // won’t fetch proposals unless user switches to the Proposals tab.
  const initialProposals = [] as any[];

  return (
    <AdminProposalsClient
      initialProposals={initialProposals}
      defaultMode="entities"
    />
  );
}

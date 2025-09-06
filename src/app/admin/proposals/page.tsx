// src/app/admin/proposals/page.tsx
import { getProposalsServer } from "@/lib/api-server"; // Use server version
import AdminProposalsClient from "@/components/AdminProposalsClient";

export const metadata = {
  title: 'Admin - Proposals',
  description: 'Manage project proposals',
};

export default async function AdminProposalsPage() {
  try {
    const proposals = await getProposalsServer();
    return <AdminProposalsClient initialProposals={proposals} />;
  } catch (error) {
    console.error('Failed to fetch proposals:', error);
    return <AdminProposalsClient initialProposals={[]} error={error.message} />;
  }
}
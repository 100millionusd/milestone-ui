// src/app/admin/proposals/page.tsx
import AdminProposalsClient from "@/components/AdminProposalsClient";
import { getProposals } from "@/lib/api";

export const metadata = {
  title: "Admin - Proposals",
  description: "Manage project proposals",
};

export default async function AdminProposalsPage() {
  try {
    // uses your existing API helper
    const proposals = await getProposals();
    return <AdminProposalsClient initialProposals={proposals} />;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to fetch proposals:", err);
    return <AdminProposalsClient initialProposals={[]} error={message} />;
  }
}

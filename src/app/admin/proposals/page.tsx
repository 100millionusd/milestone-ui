import AdminProposalsClient from "@/components/AdminProposalsClient";

export const metadata = {
  title: "Admin - Proposals",
  description: "Manage project proposals",
};

// 👇 force Netlify/Next to treat this as dynamic (no static export)
export const dynamic = "force-dynamic";

export default function AdminProposalsPage() {
  return <AdminProposalsClient initialProposals={[]} />;
}

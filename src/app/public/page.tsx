import PublicProjectCard from "@/components/PublicProjectCard";
import { getPublicProjects } from "@/lib/api";

export const revalidate = 0;

export default async function PublicProjectsPage() {
  const items = await getPublicProjects();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Projects</h1>

      {(!items || items.length === 0) && (
        <p className="text-sm text-gray-500">No public projects yet.</p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
        {items?.map((p: any) => (
          <PublicProjectCard key={p.proposalId} project={p} />
        ))}
      </div>
    </div>
  );
}

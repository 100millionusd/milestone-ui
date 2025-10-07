// src/app/public/page.tsx
import PublicProjectCard from "@/components/PublicProjectCard";
import { getPublicProjects } from "@/lib/api";

export const revalidate = 0; // no caching

export default async function PublicProjectsPage() {
  const items = await getPublicProjects();
  const list = Array.isArray(items) ? items.slice() : [];

  // newest first (by updatedAt)
  list.sort((a: any, b: any) =>
    String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || ""))
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Projects</h1>

      {list.length === 0 ? (
        <p className="text-sm text-gray-500">No public projects yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((p: any) => (
            <PublicProjectCard key={p.proposalId ?? p.bidId} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

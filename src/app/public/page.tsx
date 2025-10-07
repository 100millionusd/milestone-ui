// src/app/public/page.tsx
import { getPublicProjects } from "@/lib/api";
import PublicProjectsGrid from "@/components/PublicProjectsGrid";

export const revalidate = 0; // no caching

export default async function PublicProjectsPage() {
  const items = await getPublicProjects();
  const list = Array.isArray(items) ? items.slice() : [];

  // newest first
  list.sort((a: any, b: any) =>
    String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || ""))
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Projects</h1>

      {list.length === 0 ? (
        <p className="text-sm text-gray-500">No public projects yet.</p>
      ) : (
        <PublicProjectsGrid items={list} initialPageSize={8} />
      )}
    </div>
  );
}

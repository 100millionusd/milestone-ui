// pages/projects.tsx
import type { GetServerSideProps } from "next";

type Project = {
  proposalId: number;
  orgName: string;
  title: string;
  summary: string;
  amountUSD: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export const getServerSideProps: GetServerSideProps = async () => {
  // SSR can call Railway directly (no CORS issues on the server)
  const BASE = (process.env.API_BASE_URL ||
                process.env.NEXT_PUBLIC_API_BASE_URL ||
                "https://milestone-api-production.up.railway.app"
               ).replace(/\/+$/, "");

  try {
    const r = await fetch(`${BASE}/projects`, { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { props: { projects: [], error: `API ${r.status}: ${text.slice(0,120)}` } };
    }
    const projects: Project[] = await r.json();
    return { props: { projects } };
  } catch (e: any) {
    return { props: { projects: [], error: e?.message || "Failed to fetch" } };
  }
};

export default function ProjectsPage({ projects, error }: { projects: Project[]; error?: string }) {
  if (error) return <div>Failed to load proposals<br />{error}</div>;
  if (!projects?.length) return <div>No projects yet.</div>;
  return (
    <main style={{ padding: 24 }}>
      <h1>Projects</h1>
      <ul>
        {projects.map(p => (
          <li key={p.proposalId}>
            <strong>{p.title}</strong> — {p.orgName} — <em>{p.status}</em>
          </li>
        ))}
      </ul>
    </main>
  );
}

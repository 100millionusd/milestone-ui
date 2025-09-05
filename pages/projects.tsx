// pages/projects.tsx
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";

type Project = {
  proposalId: number;
  orgName: string;
  title: string;
  summary: string;
  amountUSD: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

type PageProps = { projects: Project[]; error?: string };

const BASE = (
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://milestone-api-production.up.railway.app"
).replace(/\/+$/, "");

function safeParse(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

function normalize(p: any): Project {
  return {
    proposalId: Number(p.proposalId),
    orgName: String(p.orgName ?? ""),
    title: String(p.title ?? ""),
    summary: String(p.summary ?? ""),
    amountUSD: Number(p.amountUSD ?? 0),
    status: (p.status as any) ?? "pending",
    createdAt: String(p.createdAt ?? new Date().toISOString()),
  };
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const fetchJSON = async (path: string) => {
    const r = await fetch(`${BASE}${path}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const text = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, data: text ? safeParse(text) : null, text };
  };

  try {
    // 1) Try /projects
    let res = await fetchJSON("/projects");

    // 2) If not found, try /proposals (older servers)
    if (!res.ok && res.status === 404) {
      res = await fetchJSON("/proposals");
    }

    if (!res.ok || !Array.isArray(res.data)) {
      return {
        props: {
          projects: [],
          error: `API ${res.status}: ${res.text?.slice(0, 200) || "bad response"}`,
        },
      };
    }

    const projects = (res.data as any[])
      .map(normalize)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    return { props: { projects } };
  } catch (e: any) {
    return { props: { projects: [], error: e?.message || "Failed to fetch" } };
  }
};

export default function ProjectsPage(
  { projects, error }: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Projects</h1>
        <p style={{ color: "crimson" }}>Failed to load projects</p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
      </main>
    );
  }

  if (!projects?.length) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Projects</h1>
        <p>No projects yet.</p>
      </main>
    );
  }

  const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

  return (
    <main style={{ padding: 24 }}>
      <h1>Projects</h1>
      <ul style={{ lineHeight: 1.6 }}>
        {projects.map((p) => (
          <li key={p.proposalId}>
            <strong>{p.title}</strong> — {p.orgName} — <em>{p.status}</em> —{" "}
            {fmt.format(p.amountUSD)} —{" "}
            <small>{new Date(p.createdAt).toLocaleString()}</small>
          </li>
        ))}
      </ul>
    </main>
  );
}

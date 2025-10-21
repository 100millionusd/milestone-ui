// src/app/admin/proofs/page.tsx

export const revalidate = 60;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Client from "./client";

const API =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://milestone-api-production.up.railway.app";

async function fetchBidsSSR(cookie: string) {
  const res = await fetch(`${API}/bids`, {
    headers: cookie ? { cookie } : undefined,
    next: { revalidate: 60 },
  });

  if (!res.ok) return [];
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getAuthRole(cookie: string) {
  const res = await fetch(`${API}/auth/role`, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  });

  if (!res.ok) return { role: "guest" };
  return await res.json();
}

export default async function Page() {
  const cookieStore = cookies();
  const jwt = cookieStore.get("lx_jwt")?.value;
  const cookie = jwt ? `lx_jwt=${jwt}` : "";

  const auth = await getAuthRole(cookie);

  // Optional debug logging (remove in production)
  console.log("SSR jwt cookie:", jwt);
  console.log("auth.role:", auth.role);

  if (auth.role !== "admin") {
    redirect("/"); // Or "/403"
  }

  const bids = await fetchBidsSSR(cookie);
  return <Client initialBids={bids} />;
}

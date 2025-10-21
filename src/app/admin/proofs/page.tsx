export const revalidate = 60;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Client from "./client";

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN || "http://localhost:3000";

async function fetchBidsSSR() {
  const res = await fetch(`${SITE_ORIGIN}/api/proxy/bids`, {
    cache: 'no-store',
  });

  if (!res.ok) return [];
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function getAuthRole() {
  const res = await fetch(`${SITE_ORIGIN}/api/proxy/auth/role`, {
    cache: 'no-store',
  });

  if (!res.ok) return { role: 'guest' };
  return await res.json();
}

export default async function Page() {
  const auth = await getAuthRole();

  if (auth.role !== "admin") {
    redirect("/"); // or "/403"
  }

  const bids = await fetchBidsSSR();
  return <Client initialBids={bids} />;
}

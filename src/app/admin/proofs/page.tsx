// src/app/admin/proofs/page.tsx  (SERVER)
export const revalidate = 60;

import { cookies } from "next/headers";
import Client from "./client";

async function fetchBidsSSR() {
  const API = process.env.NEXT_PUBLIC_API_BASE || "https://milestone-api-production.up.railway.app";
  const cookie = cookies().toString();

  const res = await fetch(`${API}/bids`, {
    headers: cookie ? { cookie } : undefined,
    // cache on the Next server for 60s
    next: { revalidate: 60 },
  });

  if (!res.ok) return [];
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

export default async function Page() {
  const bids = await fetchBidsSSR();
  return <Client initialBids={bids} />;
}

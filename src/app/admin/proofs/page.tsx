import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Client from "./client";

const API = "https://milestone-api-production.up.railway.app";

async function getAuthRole(jwt: string) {
  const res = await fetch(`${API}/auth/role`, {
    headers: {
      Cookie: `lx_jwt=${jwt}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) return { role: 'guest' };
  return await res.json();
}

async function fetchBidsSSR(jwt: string) {
  const res = await fetch(`${API}/bids`, {
    headers: {
      Cookie: `lx_jwt=${jwt}`,
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) return [];
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

export default async function Page() {
  const jwt = cookies().get("lx_jwt")?.value;

  if (!jwt) {
    redirect("/"); // no token at all
  }

  const auth = await getAuthRole(jwt);

  if (auth.role !== "admin") {
    redirect("/");
  }

  const bids = await fetchBidsSSR(jwt);
  return <Client initialBids={bids} />;
}

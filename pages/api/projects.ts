import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const BASE = (process.env.API_BASE_URL || "https://milestone-api-production.up.railway.app").replace(/\/+$/, "");
  try {
    const r = await fetch(`${BASE}/projects`, { cache: "no-store" });
    const json = await r.json().catch(() => ({}));
    res.status(r.status).json(json);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "proxy failed" });
  }
}

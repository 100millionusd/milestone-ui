import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const BASE = (process.env.API_BASE_URL || "https://milestone-api-production.up.railway.app").replace(/\/+$/, "");
  try {
    if (req.method === "POST") {
      const r = await fetch(`${BASE}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body ?? {}),
        cache: "no-store",
      });
      const json = await r.json().catch(() => ({}));
      return res.status(r.status).json(json);
    }
    const r = await fetch(`${BASE}/proposals`, { cache: "no-store" });
    const json = await r.json().catch(() => ({}));
    res.status(r.status).json(json);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "proxy failed" });
  }
}

import Link from "next/link";
import { notFound } from "next/navigation";

type Params = { id: string };

// Change THIS LINE:
type AdminBidDetailPageProps = { params: Params };

// TO:
type AdminBidDetailPageProps = { params: Promise<Params> };

export default async function AdminBidDetailPage(props: AdminBidDetailPageProps) {
  // Add this line to await the params promise:
  const params = await props.params;
  const bidId = params.id;

  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";
  const res = await fetch(`${base}/bids/${bidId}`, { cache: "no-store" });
  if (!res.ok) return notFound();

  const bid = await res.json();

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bid #{bidId}</h1>
        <Link href="/admin/proposals" className="underline">
          ← Back to Admin
        </Link>
      </div>

      <section className="rounded border p-4 bg-white">
        <pre className="text-sm overflow-auto">{JSON.stringify(bid, null, 2)}</pre>
      </section>
    </main>
  );
}
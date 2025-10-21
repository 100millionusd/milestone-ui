// src/app/admin/proofs/page.tsx
import Client from "./client";

// Intentionally no server-side auth or data fetching here.
// The Client component fetches in the browser with credentials.
export default function Page() {
  return <Client initialBids={[]} />;
}

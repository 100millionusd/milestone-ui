// src/app/admin/proofs/page.tsx
import Client from "./Client";

// NOTE:
// We intentionally do NOT do any server-side auth or data fetching here,
// because your Railway cookie (auth_token) isn't visible to Netlify SSR.
// The Client component fetches everything in the browser with credentials.
export default function Page() {
  return <Client initialBids={[]} />;
}

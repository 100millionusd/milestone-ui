// src/app/proposer/profile/page.tsx
import ProposerProfileForm from "./ProposerProfileForm";
import { apiFetch } from "@/lib/api";

// Ensure this page is always dynamic (no static caching)
export const dynamic = "force-dynamic";

export default async function ProposerProfilePage() {
  // Fetch on the server so first paint has data
  const profile =
    (await apiFetch("/proposer/profile", { cache: "no-store" }).catch(() => ({}))) ||
    {};

  return <ProposerProfileForm initial={profile} />;
}

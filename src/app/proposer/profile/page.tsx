// src/app/proposer/profile/page.tsx
import ProposerProfileForm from "./ProposerProfileForm";
import { apiFetch } from "@/lib/api";

// Server Component (no "use client")
export default async function ProposerProfilePage() {
  // Fetch on the server so the first paint already has your data
  const profile =
    (await apiFetch("/proposer/profile", { cache: "no-store" }).catch(() => ({}))) || {};

  return <ProposerProfileForm initial={profile} />;
}

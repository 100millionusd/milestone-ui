// src/app/admin/page.tsx
import { redirect } from "next/navigation";

export default function AdminIndexRedirect({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const tenant = searchParams.tenant;
  const dest = tenant ? `/admin/proposals?tenant=${tenant}` : "/admin/proposals";
  redirect(dest);
}
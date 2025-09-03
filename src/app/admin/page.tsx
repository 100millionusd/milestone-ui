// src/app/admin/page.tsx
import { redirect } from "next/navigation";

export default function AdminIndexRedirect() {
  redirect("/admin/proposals");
}

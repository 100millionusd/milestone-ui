// src/app/admin/entities/page.tsx
import AdminProposersClient from '@/components/AdminProposersClient'; // or AdminEntitiesClient if that's your filename

export default function AdminEntitiesPage() {
  // This page is a Server Component that simply renders the Client Component.
  return <AdminProposersClient />;
}
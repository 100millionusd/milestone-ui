'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAuthRole, type AuthInfo } from '@/lib/api';

type Props = {
  proposalId: number;
  ownerWallet?: string | null;
  className?: string;
};

export default function EditProposalButton({ proposalId, ownerWallet, className = '' }: Props) {
  const [auth, setAuth] = useState<AuthInfo>({ role: 'guest' });

  useEffect(() => {
    getAuthRoleOnce().then(setAuth).catch(() => setAuth({ role: 'guest' }));
  }, []);

  const isAdmin = auth.role === 'admin';
  const isOwner =
    auth.address && ownerWallet
      ? auth.address.toLowerCase() === ownerWallet.toLowerCase()
      : false;

  if (!isAdmin && !isOwner) return null;

  return (
    <Link
      href={`/proposals/${proposalId}/edit`}
      className={`inline-flex items-center rounded px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 ${className}`}
    >
      Edit
    </Link>
  );
}

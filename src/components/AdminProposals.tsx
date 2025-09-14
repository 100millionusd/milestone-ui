// src/components/AdminProposalsClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Proposal, getProposals } from '@/lib/api';
import AdminProposals from './AdminProposals';

interface Props {
  initialProposals: Proposal[];
}

export default function AdminProposalsClient({ initialProposals }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);

  // 🔹 Fetch proposals from API
  const fetchProposals = async () => {
    try {
      const data = await getProposals();
      setProposals(data);
    } catch (error) {
      console.error('❌ Failed to fetch proposals:', error);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  return (
    <AdminProposals
      proposals={proposals}
      onUpdate={fetchProposals}
    />
  );
}

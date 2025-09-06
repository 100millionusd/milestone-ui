// src/components/BlockchainConfigCheck.tsx
'use client';

import { useEffect, useState } from 'react';
import { blockchainService } from '@/lib/blockchain';

export default function BlockchainConfigCheck() {
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    setIsConfigured(blockchainService.isServiceConfigured());
  }, []);

  if (isConfigured) {
    return null;
  }

  return (
    <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mb-4">
      <strong className="font-bold">Blockchain Not Configured! </strong>
      <span className="block sm:inline">
        Please set up your RPC_URL and PRIVATE_KEY environment variables to enable real payments.
        Currently in simulation mode.
      </span>
    </div>
  );
}
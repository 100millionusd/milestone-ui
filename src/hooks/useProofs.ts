import { useApiCache } from './useApiCache';

export interface Proof {
  id: string;
  bidId: string;
  title: string;
  description: string;
  createdAt: string;
  // Add other fields that match your existing Proof type
}

export const useProofs = (bidId: string | number) => {
  const result = useApiCache<any[]>(
    `https://milestone-api-production.up.railway.app/proofs?bidId=${bidId}`,
    { 
      ttl: 300000, // 5 minute cache
      credentials: 'include' // Match your existing API calls
    }
  );

  return {
    proofs: result.data || [],
    loading: result.loading,
    error: result.error
  };
};
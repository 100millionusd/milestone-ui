'use client';

import { useRouter } from 'next/navigation';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

export default function VendorLogin() {
  const { login, address } = useWeb3Auth();
  const router = useRouter();

  const handleLogin = async () => {
    await login();
    router.push('/vendor/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold mb-6">Vendor Portal</h1>
        <p className="text-gray-600 mb-6">Sign in to submit proof of work and manage your bids</p>
        
        <button
          onClick={handleLogin}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
        >
          Sign in with Google
        </button>

        <p className="text-sm text-gray-500 mt-6">
          You'll need to use the same wallet address you provided in your bids
        </p>
      </div>
    </div>
  );
}
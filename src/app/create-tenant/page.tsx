'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { createTenant } from '@/lib/api';

export default function CreateTenantPage() {
    const { address, login, session } = useWeb3Auth();
    const router = useRouter();

    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const tenant = await createTenant(name, slug);
            // Redirect to admin dashboard or configuration page
            // For now, let's go to admin dashboard which should now work for this new tenant
            // Redirect to the new tenant's admin dashboard
            const protocol = window.location.protocol;
            const host = window.location.host;
            const rootDomain = host.split('.').slice(-2).join('.');
            const isLocal = host.includes('localhost');

            const targetHost = isLocal ? `${tenant.slug}.localhost:3000` : `${tenant.slug}.${rootDomain}`;

            // Force full reload to pick up new tenant context
            window.location.href = `${protocol}//${targetHost}/admin`;
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to create organization');
        } finally {
            setLoading(false);
        }
    };

    // Auto-generate slug from name
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setName(val);
        // Simple slugify
        const s = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        setSlug(s);
    };

    if (session !== 'authenticated') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="max-w-md w-full space-y-8 text-center">
                    <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                        Create Your Organization
                    </h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Connect your wallet to get started.
                    </p>
                    <button
                        onClick={() => login('vendor')} // Login as vendor/admin intent
                        className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        Connect Wallet
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Create Organization
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Set up your dedicated workspace on LithiumX.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleCreate}>

                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                                Organization Name
                            </label>
                            <div className="mt-1">
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    required
                                    value={name}
                                    onChange={handleNameChange}
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    placeholder="Acme Corp"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="slug" className="block text-sm font-medium text-gray-700">
                                URL Slug
                            </label>
                            <div className="mt-1 flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    lithiumx.app/
                                </span>
                                <input
                                    id="slug"
                                    name="slug"
                                    type="text"
                                    required
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border-gray-300"
                                />
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                This will be your unique identifier.
                            </p>
                        </div>

                        {error && (
                            <div className="rounded-md bg-red-50 p-4">
                                <div className="flex">
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-red-800">
                                            Error
                                        </h3>
                                        <div className="mt-2 text-sm text-red-700">
                                            <p>{error}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {loading ? 'Creating...' : 'Create Organization'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

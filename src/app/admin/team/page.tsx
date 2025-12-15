'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { ethers } from 'ethers';
import { Wallet, Copy, AlertTriangle, X } from 'lucide-react';

interface Member {
    wallet_address: string;
    role: string;
    created_at: string;
}

export default function TeamPage() {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);

    // Form State
    const [newWallet, setNewWallet] = useState('');
    const [newRole, setNewRole] = useState('controller');

    // Generated Wallet State
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);

    useEffect(() => {
        loadMembers();
    }, []);

    async function loadMembers() {
        try {
            setLoading(true);
            const data = await apiFetch('/api/admin/members');
            if (data.error) throw new Error(data.error);
            setMembers(data);
        } catch (e: any) {
            setError(e.message || 'Failed to load members');
        } finally {
            setLoading(false);
        }
    }

    function generateWallet() {
        const wallet = ethers.Wallet.createRandom();
        setNewWallet(wallet.address);
        setGeneratedKey(wallet.privateKey);
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setAdding(true);
        setError(null);

        try {
            const res = await apiFetch('/api/admin/members', {
                method: 'POST',
                body: JSON.stringify({ walletAddress: newWallet, role: newRole })
            });

            if (res.error) throw new Error(res.error);

            setNewWallet('');
            loadMembers(); // Refresh list
        } catch (e: any) {
            setError(e.message || 'Failed to add member');
        } finally {
            setAdding(false);
        }
    }

    async function handleRemove(address: string) {
        if (!confirm(`Remove ${address} from the team?`)) return;

        try {
            const res = await apiFetch(`/api/admin/members/${address}`, {
                method: 'DELETE'
            });

            if (res.error) throw new Error(res.error);

            loadMembers(); // Refresh list
        } catch (e: any) {
            alert(e.message || 'Failed to remove member');
        }
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-white mb-8">Team Management</h1>

            {/* Generated Key Modal */}
            {generatedKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative">
                        <button
                            onClick={() => setGeneratedKey(null)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 mb-4 text-amber-500">
                            <AlertTriangle className="w-8 h-8" />
                            <h3 className="text-xl font-bold">Save Private Key</h3>
                        </div>

                        <p className="text-gray-300 mb-6">
                            A new wallet has been generated. You <strong>MUST</strong> save this private key now.
                            It will not be shown again. Give this key to the team member securely.
                        </p>

                        <div className="bg-black/50 rounded-lg p-4 border border-gray-800 mb-6">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Private Key</p>
                            <div className="flex items-center justify-between gap-2">
                                <code className="text-green-400 font-mono text-sm break-all">{generatedKey}</code>
                                <button
                                    onClick={() => navigator.clipboard.writeText(generatedKey)}
                                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                                    title="Copy to clipboard"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => setGeneratedKey(null)}
                            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
                        >
                            I have saved the key
                        </button>
                    </div>
                </div>
            )}

            {/* Add Member Form */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 mb-8">
                <h2 className="text-lg font-semibold text-white mb-4">Add Team Member</h2>
                <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Wallet Address</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newWallet}
                                onChange={(e) => setNewWallet(e.target.value)}
                                placeholder="0x..."
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-mono"
                                required
                            />
                            <button
                                type="button"
                                onClick={generateWallet}
                                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg border border-gray-600 transition-colors flex items-center gap-2 whitespace-nowrap"
                                title="Generate new wallet"
                            >
                                <Wallet className="w-4 h-4" />
                                <span className="text-sm">Generate</span>
                            </button>
                        </div>
                    </div>
                    <div className="w-full md:w-48">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
                        <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        >
                            <option value="controller">Controller</option>
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={adding}
                        className="w-full md:w-auto px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {adding ? 'Adding...' : 'Add Member'}
                    </button>
                </form>
                {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            </div>

            {/* Members List */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-semibold">
                        <tr>
                            <th className="px-6 py-3">Wallet Address</th>
                            <th className="px-6 py-3">Role</th>
                            <th className="px-6 py-3">Added At</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading members...</td>
                            </tr>
                        ) : members.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No team members found.</td>
                            </tr>
                        ) : (
                            members.map((m) => (
                                <tr key={m.wallet_address} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-gray-700">{m.wallet_address}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                            ${m.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                                m.role === 'controller' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-gray-100 text-gray-800'}`}>
                                            {m.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">
                                        {new Date(m.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleRemove(m.wallet_address)}
                                            className="text-red-600 hover:text-red-800 font-medium text-xs"
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

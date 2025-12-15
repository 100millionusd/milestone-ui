'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

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

            {/* Add Member Form */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 mb-8">
                <h2 className="text-lg font-semibold text-white mb-4">Add Team Member</h2>
                <form onSubmit={handleAdd} className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Wallet Address</label>
                        <input
                            type="text"
                            value={newWallet}
                            onChange={(e) => setNewWallet(e.target.value)}
                            placeholder="0x..."
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-mono"
                            required
                        />
                    </div>
                    <div className="w-48">
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
                        className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

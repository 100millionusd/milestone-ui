'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE, getJwt, apiFetch } from '@/lib/api';
// Using inline types to avoid new file creation for now
type VotingProject = {
    id: number;
    title: string;
    description: string;
    image_url: string;
    status: string;
    department: string;
};

export default function AdminVotingPage() {
    const [projects, setProjects] = useState<VotingProject[]>([]);
    const [loading, setLoading] = useState(false);

    // Form State
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const res = await apiFetch<VotingProject[]>('/api/voting/projects');
            if (res) {
                setProjects(res);
            }
        } catch (e) {
            console.error('Failed to fetch projects', e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title) return alert('Title is required');

        try {
            setUploading(true);
            let imageCid = '';
            let imageUrl = '';

            // 1. Upload Image if present
            if (image) {
                const formData = new FormData();
                formData.append('file', image);

                // We use raw fetch here to ensure FormData is handled correctly with our boundary
                // although apiFetch supports it, let's be safe with manual token
                const token = getJwt();
                const uploadRes = await fetch(`${API_BASE}/ipfs/upload-file`, {
                    method: 'POST',
                    headers: {
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: formData
                });

                if (!uploadRes.ok) throw new Error('Upload failed');
                const uploadData = await uploadRes.json();
                imageCid = uploadData.cid;
                imageUrl = uploadData.url;
            }

            // 2. Create Project
            await apiFetch('/api/voting/projects', {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    description: desc,
                    imageCid,
                    imageUrl,
                    department: 'Potosi'
                })
            });

            // Reset
            setTitle('');
            setDesc('');
            setImage(null);
            fetchProjects();
            alert('Project Created Successfully');

        } catch (err) {
            console.error(err);
            alert('Failed to create project');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold mb-8 text-gray-800">Voting Projects (Potosi)</h1>

            {/* CREATE FORM */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                <h2 className="text-xl font-bold mb-4 text-gray-700">Create New Project</h2>
                <form onSubmit={handleCreate} className="space-y-4 max-w-lg">
                    <div>
                        <label className="block text-sm font-semibold text-gray-600 mb-1">Project Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. New School in Uyuni"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-600 mb-1">Description</label>
                        <textarea
                            value={desc}
                            onChange={e => setDesc(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none h-24"
                            placeholder="Describe the project..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-600 mb-1">Project Image</label>
                        <input
                            type="file"
                            onChange={e => setImage(e.target.files?.[0] || null)}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={uploading}
                        className={`px-6 py-2 rounded-lg font-bold text-white transition-colors ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {uploading ? 'Creating...' : 'Create Project'}
                    </button>
                </form>
            </div>

            {/* LIST */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(proj => (
                    <div key={proj.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                        <div className="h-48 bg-gray-100 relative">
                            {proj.image_url ? (
                                <img src={proj.image_url} alt={proj.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-400">No Image</div>
                            )}
                            <span className="absolute top-2 right-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-bold uppercase">
                                {proj.status}
                            </span>
                        </div>
                        <div className="p-4 flex-1">
                            <h3 className="font-bold text-lg text-gray-800 mb-2">{proj.title}</h3>
                            <p className="text-sm text-gray-600 line-clamp-3">{proj.description}</p>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                            ID: {proj.id} • Dept: {proj.department}
                        </div>
                    </div>
                ))}
            </div>

            {projects.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500">No voting projects found.</div>
            )}
        </div>
    );
}

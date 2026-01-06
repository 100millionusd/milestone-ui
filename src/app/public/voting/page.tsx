'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

type VotingProject = {
    id: number;
    title: string;
    description: string;
    image_url: string;
    image_cid?: string;
    status: string;
    department: string;
    vote_count: number;
};

export default function PublicVotingPage() {
    const [projects, setProjects] = useState<VotingProject[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProjects();
        // Poll every 10 seconds for live updates
        const interval = setInterval(fetchProjects, 10000);
        return () => clearInterval(interval);
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await apiFetch<VotingProject[]>('/api/voting/projects');
            if (res) {
                setProjects(res);
            }
        } catch (e) {
            console.error('Failed to fetch voting results', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-black text-slate-800 sm:text-4xl tracking-tight mb-2">
                        Community Voting Results
                    </h1>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <p className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                            Department of Potosi, Bolivia
                        </p>
                    </div>
                </div>

                {loading && projects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-70">
                        <div className="animate-spin text-4xl mb-3">🌀</div>
                        <p className="font-medium text-slate-500">Loading live results...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:gap-8 cursor-default">
                        {projects.map((project, index) => (
                            <div key={project.id} className="group flex flex-col bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                                {/* Image Area */}
                                <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                                    {project.image_cid ? (
                                        <img className="h-full w-full object-cover transform group-hover:scale-105 transition-transform duration-700" src={`https://gateway.pinata.cloud/ipfs/${project.image_cid}`} alt={project.title} />
                                    ) : project.image_url ? (
                                        <img className="h-full w-full object-cover transform group-hover:scale-105 transition-transform duration-700" src={project.image_url} alt={project.title} />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-slate-300">
                                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                        </div>
                                    )}

                                    {/* Overlay Gradient */}
                                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent opacity-80"></div>

                                    {/* Badges */}
                                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-slate-700 px-2.5 py-1 rounded-md text-xs font-bold shadow-sm ring-1 ring-black/5">
                                        #{index + 1}
                                    </div>
                                    <div className="absolute bottom-3 right-3 bg-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg flex items-center gap-1.5">
                                        <span>🗳️</span>
                                        <span>{project.vote_count}</span>
                                    </div>
                                </div>

                                {/* Content Area */}
                                <div className="flex-1 p-5 flex flex-col">
                                    <div className="mb-3">
                                        <h3 className="text-lg font-bold text-slate-800 leading-tight mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                                            {project.title}
                                        </h3>
                                        <p className="text-sm text-slate-500 leading-relaxed line-clamp-3">
                                            {project.description}
                                        </p>
                                    </div>

                                    <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-xs font-medium text-slate-400">
                                        <span className="bg-slate-50 px-2 py-1 rounded border border-slate-100 uppercase tracking-wider">{project.department || 'Potosi'}</span>
                                        <span>ID: {project.id}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

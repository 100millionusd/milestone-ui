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
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
                        Community Voting Results
                    </h1>
                    <p className="mt-5 max-w-xl mx-auto text-xl text-gray-500">
                        Department of Potosi, Bolivia
                    </p>
                </div>

                {loading && projects.length === 0 ? (
                    <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                        {projects.map((project) => (
                            <div key={project.id} className="flex flex-col rounded-lg shadow-lg overflow-hidden bg-white hover:shadow-xl transition-shadow duration-300">
                                <div className="flex-shrink-0 h-56 w-full relative">
                                    {project.image_cid ? (
                                        <img className="h-full w-full object-cover" src={`https://gateway.pinata.cloud/ipfs/${project.image_cid}`} alt={project.title} />
                                    ) : project.image_url ? (
                                        <img className="h-full w-full object-cover" src={project.image_url} alt={project.title} />
                                    ) : (
                                        <div className="h-full w-full bg-gray-200 flex items-center justify-center text-gray-400">
                                            No Image
                                        </div>
                                    )}
                                    <div className="absolute top-0 right-0 bg-indigo-600 text-white px-3 py-1 rounded-bl-lg font-bold shadow-md">
                                        {project.vote_count} Votes
                                    </div>
                                </div>
                                <div className="flex-1 bg-white p-6 flex flex-col justify-between">
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-indigo-600">
                                            Project #{project.id}
                                        </p>
                                        <div className="block mt-2">
                                            <p className="text-xl font-semibold text-gray-900">{project.title}</p>
                                            <p className="mt-3 text-base text-gray-500">{project.description}</p>
                                        </div>
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

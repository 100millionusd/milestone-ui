import React from 'react';

export default function CookiesPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
                <h1 className="text-3xl font-bold mb-6">Cookie Policy</h1>
                <p className="mb-6 text-sm text-gray-500">Last Updated: January 7, 2026</p>

                <p className="mb-4 text-gray-700">
                    This Cookie Policy explains how MilestoneX (a product of <strong>Heitaria Swiss AG</strong>) uses cookies and similar technologies on our platform.
                </p>

                <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm mb-8">
                    <p className="font-semibold">Heitaria Swiss AG</p>
                    <p>Rigistrasse 1</p>
                    <p>6374 Buochs</p>
                    <p>Switzerland</p>
                    <p className="mt-2"><strong>Email:</strong> <a href="mailto:info@heitaria.ch" className="text-blue-600 hover:underline">info@heitaria.ch</a></p>
                </div>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. What Are Cookies?</h2>
                    <p className="text-gray-700">
                        Cookies are small text files stored by your browser that allow us to remember your session and preference settings.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. How We Use Cookies</h2>
                    <p className="text-gray-700 mb-2">We use cookies primarily for:</p>
                    <ul className="list-disc pl-5 text-gray-700 space-y-1">
                        <li><strong>Authentication & Security:</strong> To keep you logged in and protect your account (e.g., Web3Auth, session tokens).</li>
                        <li><strong>Functionality:</strong> To remember your preferences and settings.</li>
                        <li><strong>Analytics:</strong> To understand how the platform is used and improve performance.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. Managing Cookies</h2>
                    <p className="text-gray-700">
                        You can control or delete cookies through your browser settings. Please note that disabling essential cookies (like those used for login) may prevent you from accessing certain features of the Platform.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4">Contact</h2>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm">
                        <p className="font-semibold">Heitaria Swiss AG</p>
                        <p className="mt-2"><strong>Email:</strong> <a href="mailto:info@heitaria.ch" className="text-blue-600 hover:underline">info@heitaria.ch</a></p>
                    </div>
                </section>
            </div>
        </div>
    );
}

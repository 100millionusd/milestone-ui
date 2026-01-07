import React from 'react';

export default function CookiesPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
                <h1 className="text-3xl font-bold mb-6">Cookie Policy</h1>
                <p className="mb-6 text-sm text-gray-500">Last Updated: January 7, 2026</p>

                <p className="mb-4 text-gray-700">
                    <strong>Heitaria Swiss AG</strong> ("we," "us," or "our") uses cookies and similar technologies on the MilestoneX platform. This policy explains what these technologies are, why we use them, and how you can control them.
                </p>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. What Are Cookies?</h2>
                    <p className="text-gray-700">
                        Cookies are small text files stored on your device by your browser. They allow our platform to function correctly, remember your preferences, and help us improve user experience.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. Types of Cookies We Use</h2>
                    <p className="mb-4 text-gray-700">We classify cookies into the following categories:</p>

                    <div className="mb-4">
                        <h3 className="text-lg font-medium mb-2">A. Strictly Necessary (Essential)</h3>
                        <p className="text-gray-700 mb-2">These cookies are vital for the platform to function. They handle security and basic usability. You cannot switch these off.</p>
                        <ul className="list-disc pl-5 text-gray-700 space-y-1">
                            <li><strong>Examples:</strong> Session tokens, Web3Auth authentication keys, load balancing.</li>
                            <li><strong>Data transfer:</strong> Necessary for the provision of the service.</li>
                        </ul>
                    </div>

                    <div className="mb-4">
                        <h3 className="text-lg font-medium mb-2">B. Functionality & Preferences</h3>
                        <p className="text-gray-700 mb-2">These allow us to remember choices you make (such as language or region) to provide a more personalized experience.</p>
                        <p className="text-gray-700"><strong>Impact:</strong> If you disable these, some features may not work properly.</p>
                    </div>

                    <div className="mb-4">
                        <h3 className="text-lg font-medium mb-2">C. Analytics & Performance</h3>
                        <p className="text-gray-700 mb-2">These help us understand how users interact with MilestoneX by collecting and reporting information anonymously.</p>
                        <ul className="list-disc pl-5 text-gray-700 space-y-1">
                            <li><strong>Provider:</strong> [E.g., Google Analytics / Matomo / Hotjar]</li>
                            <li><strong>Purpose:</strong> To track page visits, load times, and error messages to improve platform performance.</li>
                            <li><strong>Consent:</strong> These cookies are only active if you grant consent via our Cookie Banner.</li>
                        </ul>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. Specific Cookies & Third Parties</h2>
                    <p className="mb-4 text-gray-700">Below is a list of third-party service providers that may set cookies on your device:</p>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm text-gray-700">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-2 font-medium">Provider</th>
                                    <th className="px-4 py-2 font-medium">Purpose</th>
                                    <th className="px-4 py-2 font-medium">Duration</th>
                                    <th className="px-4 py-2 font-medium">Policy Link</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                <tr>
                                    <td className="px-4 py-2">Heitaria (Internal)</td>
                                    <td className="px-4 py-2">Authentication & Session</td>
                                    <td className="px-4 py-2">Session / 30 Days</td>
                                    <td className="px-4 py-2">--</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2">Web3Auth</td>
                                    <td className="px-4 py-2">Secure Login Management</td>
                                    <td className="px-4 py-2">Persistent</td>
                                    <td className="px-4 py-2"><a href="#" className="text-blue-600 hover:underline">Web3Auth Privacy</a></td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2">[E.g. Google Analytics]</td>
                                    <td className="px-4 py-2">Usage Statistics</td>
                                    <td className="px-4 py-2">2 Years</td>
                                    <td className="px-4 py-2"><a href="#" className="text-blue-600 hover:underline">Google Opt-out</a></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">4. International Data Transfers</h2>
                    <p className="text-gray-700">
                        Heitaria Swiss AG is based in Switzerland. Some of our third-party service providers (e.g., for analytics or hosting) may process data in countries outside of Switzerland or the EEA (such as the USA). We ensure these providers adhere to strict data protection standards (such as Standard Contractual Clauses).
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">5. Managing Your Preferences</h2>
                    <ul className="list-disc pl-5 text-gray-700 space-y-2">
                        <li>
                            <strong>Consent Tool:</strong> You can change your cookie preferences at any time by clicking the "Cookie Settings" link in the footer of our website.
                        </li>
                        <li>
                            <strong>Browser Settings:</strong> Alternatively, you can block or delete cookies through your browser settings. However, blocking strictly necessary cookies will prevent you from logging into MilestoneX.
                        </li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">6. Contact Us</h2>
                    <p className="mb-2 text-gray-700">If you have questions about our use of cookies, please contact:</p>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm">
                        <p className="font-semibold">Heitaria Swiss AG</p>
                        <p>Rigistrasse 1</p>
                        <p>6374 Buochs</p>
                        <p>Switzerland</p>
                        <p className="mt-2"><strong>Email:</strong> <a href="mailto:info@heitaria.ch" className="text-blue-600 hover:underline">info@heitaria.ch</a></p>
                    </div>
                </section>
            </div>
        </div>
    );
}

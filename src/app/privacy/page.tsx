import React from 'react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
                <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
                <p className="mb-4 text-sm text-gray-500">Last Updated: January 7, 2026</p>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
                    <p className="mb-4 text-gray-700">
                        MilestoneX is a product of <strong>Heitaria Swiss AG</strong> (the “Company”, “we”, “us”). We value privacy and aim to be transparent about how personal information is collected, used, shared, and retained when using MilestoneX to manage projects and payments. By using MilestoneX, you acknowledge the practices described in this policy.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. Who We Are (Controller)</h2>
                    <p className="mb-4 text-gray-700">
                        MilestoneX is a product of <strong>Heitaria Swiss AG</strong> ("Heitaria"). Heitaria is the <strong>data controller</strong> for personal information processed under this policy.
                    </p>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm">
                        <p className="font-semibold">Heitaria Swiss AG</p>
                        <p>Rigistrasse 1</p>
                        <p>6374 Buochs</p>
                        <p>Switzerland</p>
                        <p className="mt-2"><strong>Email:</strong> <a href="mailto:info@heitaria.ch" className="text-blue-600 hover:underline">info@heitaria.ch</a></p>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. Information We Collect</h2>

                    <h3 className="text-lg font-medium mb-2">A. Account and Project Data</h3>
                    <p className="mb-2 text-gray-700">To provide our project management services, we may collect:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li><strong>Identity and contact details:</strong> Name, email address, wallet address.</li>
                        <li><strong>Project details:</strong> Information regarding bids, proposals, milestones, and proofs of work.</li>
                        <li><strong>Organization details:</strong> Company name and business information.</li>
                    </ul>

                    <h3 className="text-lg font-medium mb-2">B. Technical and Usage Data</h3>
                    <p className="mb-2 text-gray-700">We may automatically collect:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li><strong>Device and app data:</strong> device type, operating system, browser type.</li>
                        <li><strong>Log and analytics data:</strong> IP address, timestamps, pages/screens viewed, and interactions.</li>
                        <li><strong>Cookies and similar technologies:</strong> for authentication and session management.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">4. How We Use Information</h2>
                    <p className="mb-4 text-gray-700">We use personal information for the following purposes:</p>

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">A. Service Provision</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>Create and manage accounts and project workspaces.</li>
                                <li>Process milestone payments and verify proofs of work.</li>
                                <li>Provide customer support.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">B. Safety and Operations</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>Prevent fraud, spam, and unauthorized access.</li>
                                <li>Debug and improve platform performance.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">C. Legal and Compliance</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>Tax, accounting, audits, legal claims, and regulatory obligations.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">5. Legal Bases (EEA/UK)</h2>
                    <p className="mb-2 text-gray-700">Where GDPR/UK GDPR applies, processing is based on:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li><strong>Contract:</strong> to provide the requested services.</li>
                        <li><strong>Legitimate interests:</strong> to secure the platform and improve features.</li>
                        <li><strong>Legal obligation:</strong> where retention or disclosure is required by law.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">6. How We Share Information</h2>
                    <p className="mb-4 text-gray-700">We share personal information only as needed:</p>

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">A. Service Providers</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>Hosting, analytics, and infrastructure providers (e.g., blockchain nodes, IPFS gateways).</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">B. Legal and Business Transfers</h3>
                            <p className="text-gray-700">We may disclose information:</p>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>to comply with law or lawful requests,</li>
                                <li>in connection with a merger, acquisition, or asset sale.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">7. Data Retention</h2>
                    <p className="mb-2 text-gray-700">We keep information only as long as needed:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li><strong>Project records:</strong> retained as necessary for tax and legal compliance.</li>
                        <li><strong>Technical logs:</strong> retained for a limited period for security and analytics.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">8. Security</h2>
                    <p className="text-gray-700">
                        MilestoneX uses reasonable administrative, technical, and organizational measures designed to protect information.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">9. Cookies</h2>
                    <p className="text-gray-700">
                        We use essential cookies for authentication and security. See our Cookie Policy for details.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">10. Privacy Rights</h2>
                    <p className="mb-2 text-gray-700">Depending on your location, you may have rights to access, correct, or delete your personal data.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4">11. Contact</h2>
                    <p className="mb-2 text-gray-700">To ask questions or exercise privacy rights, contact:</p>
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

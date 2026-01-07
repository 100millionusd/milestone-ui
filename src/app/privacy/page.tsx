import React from 'react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
                <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
                <p className="mb-6 text-sm text-gray-500">Last Updated: January 7, 2026</p>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
                    <p className="text-gray-700">
                        MilestoneX is a product of <strong>Heitaria Swiss AG</strong> ("we," "us," or "our"). We provide a B2B platform for project management and payments. We value your privacy and are committed to being transparent about the data we process.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. Who We Are (Controller)</h2>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm">
                        <p className="font-semibold">Heitaria Swiss AG</p>
                        <p>Rigistrasse 1</p>
                        <p>6374 Buochs</p>
                        <p>Switzerland</p>
                        <p className="mt-2"><strong>Email:</strong> <a href="mailto:info@heitaria.ch" className="text-blue-600 hover:underline">info@heitaria.ch</a></p>
                    </div>
                    <p className="mt-4 text-gray-700">
                        For the purpose of Swiss Federal Act on Data Protection (nFADP) and GDPR, Heitaria is the Data Controller for the data collected through our website interface. However, you remain the sole controller of your private keys and on-chain assets.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. Non-Custodial Service & User Responsibility</h2>
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                        <p className="font-bold text-yellow-800">Important: MilestoneX is a non-custodial service.</p>
                    </div>
                    <ul className="list-disc pl-5 text-gray-700 space-y-2">
                        <li><strong>No Access to Keys:</strong> We do not have access to your private keys, seed phrases, or passwords. We cannot recover your account if you lose these credentials.</li>
                        <li><strong>User Control:</strong> You retain full control over your wallet and assets at all times.</li>
                        <li><strong>Local Data:</strong> Some settings may be stored locally on your device. If you clear your browser cache, these settings may be lost.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">4. Information We Collect</h2>
                    <p className="mb-4 text-gray-700">We collect only the minimum amount of data required to provide our services:</p>

                    <div className="mb-4">
                        <h3 className="text-lg font-medium mb-2">A. Data You Provide</h3>
                        <ul className="list-disc pl-5 text-gray-700 space-y-1">
                            <li><strong>Public Wallet Address:</strong> To link your account and display your project history.</li>
                            <li><strong>Profile Information:</strong> If you choose to add a name, email, or company details to your profile.</li>
                            <li><strong>Project Metadata:</strong> Descriptions, titles, and milestones you input for your projects.</li>
                        </ul>
                    </div>

                    <div className="mb-4">
                        <h3 className="text-lg font-medium mb-2">B. Automatically Collected Data</h3>
                        <ul className="list-disc pl-5 text-gray-700 space-y-1">
                            <li><strong>Technical Logs:</strong> IP address, browser type, and operating system (for security and debugging).</li>
                            <li><strong>Cookies:</strong> Essential session cookies (see our Cookie Policy).</li>
                        </ul>
                    </div>

                    <div className="mb-4">
                        <h3 className="text-lg font-medium mb-2">C. What We DO NOT Collect</h3>
                        <p className="text-gray-700">We never collect or store your private keys, seed phrases, or raw transaction signatures.</p>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">5. How We Use Information</h2>
                    <ul className="list-disc pl-5 text-gray-700 space-y-2">
                        <li><strong>To Provide the Service:</strong> Displaying your projects, verifying ownership of your wallet address, and facilitating interactions.</li>
                        <li><strong>Security:</strong> Detecting potentially fraudulent access patterns (e.g., bot attacks).</li>
                        <li><strong>Legal Compliance:</strong> Keeping records required by Swiss law for B2B contracts.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">6. Blockchain Immutability</h2>
                    <p className="mb-4 text-gray-700">Please be aware that any transaction you sign and broadcast to a blockchain is public, permanent, and immutable.</p>
                    <ul className="list-disc pl-5 text-gray-700 space-y-2">
                        <li><strong>Right to Erasure Limitation:</strong> We cannot delete or modify data that has been written to the blockchain. This data is outside our control.</li>
                        <li><strong>Publicity:</strong> Your public wallet address and transaction history are visible to anyone on the internet.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">7. International Transfers</h2>
                    <p className="text-gray-700">
                        Heitaria Swiss AG is based in Switzerland. We may use service providers (e.g., hosting or analytics) located in the USA or other countries. In such cases, we ensure your data is protected using recognized legal standards (such as Standard Contractual Clauses).
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">8. Data Retention</h2>
                    <ul className="list-disc pl-5 text-gray-700 space-y-2">
                        <li><strong>Account Data:</strong> Retained as long as you use the service or as required by Swiss tax/commercial law (typically 10 years for business records).</li>
                        <li><strong>Technical Logs:</strong> Retained for a limited period for security auditing, then deleted.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">9. Your Rights</h2>
                    <p className="mb-4 text-gray-700">Under Swiss nFADP and GDPR, you have the right to:</p>
                    <ul className="list-disc pl-5 text-gray-700 space-y-2">
                        <li><strong>Access:</strong> Request a copy of the personal data we hold (e.g., your email/profile).</li>
                        <li><strong>Rectify:</strong> Update incorrect profile data.</li>
                        <li><strong>Delete:</strong> Request deletion of your off-chain profile data (subject to legal retention requirements).</li>
                        <li><strong>Export:</strong> Receive your data in a portable format.</li>
                    </ul>
                    <p className="mt-4 text-gray-600 italic">
                        Note: We cannot fulfill requests to delete or alter data stored on the public blockchain.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">10. Contact Us</h2>
                    <p className="mb-2 text-gray-700">For privacy inquiries:</p>
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

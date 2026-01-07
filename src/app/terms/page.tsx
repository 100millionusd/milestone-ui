import React from 'react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
                <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
                <p className="mb-6 text-sm text-gray-500">Last Updated: January 7, 2026</p>

                <p className="mb-4 text-gray-700">
                    Welcome to MilestoneX (the “Platform”). These Terms of Service (“Terms”) govern access to and use of the Platform.
                </p>

                <p className="mb-6 text-gray-700">
                    MilestoneX is a product of <strong>Heitaria Swiss AG</strong> (“Heitaria”, “we”, “us”). By accessing or using the Platform, you agree to these Terms.
                </p>

                <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm mb-8">
                    <p className="font-semibold">Heitaria Swiss AG</p>
                    <p>Rigistrasse 1</p>
                    <p>6374 Buochs</p>
                    <p>Switzerland</p>
                    <p className="mt-2"><strong>Email:</strong> <a href="mailto:info@heitaria.ch" className="text-blue-600 hover:underline">info@heitaria.ch</a></p>
                </div>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. The Service</h2>
                    <p className="text-gray-700">
                        MilestoneX is a project management and milestone payment platform. We facilitate the organization of projects, submission of bids, and tracking of milestone completion. We do not directly provide the services tracked on the platform; those are provided by independent vendors.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. Eligibility</h2>
                    <p className="text-gray-700">
                        You must be at least 18 years old and have the legal capacity to enter into these Terms. You agree to provide accurate information when creating an account or submitting proposals/bids.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. User Conduct</h2>
                    <p className="text-gray-700">
                        You agree not to use the Platform for any illegal purpose. You are responsible for all activity that occurs under your account. You must not attempt to compromise the security or integrity of the Platform.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">4. Payments and Milestones</h2>
                    <p className="text-gray-700 mb-2">
                        The Platform may facilitate the recording or triggering of payments based on milestones.
                    </p>
                    <ul className="list-disc pl-5 text-gray-700">
                        <li>We are not a bank or financial institution.</li>
                        <li>Cryptocurrency or stablecoin transactions are irreversible.</li>
                        <li>You are responsible for verifying all transaction details before execution.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">5. Intellectual Property</h2>
                    <p className="text-gray-700">
                        The Platform and its original content, features, and functionality are owned by Heitaria Swiss AG and are protected by international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">6. Disclaimer of Warranties</h2>
                    <p className="text-gray-700">
                        The Platform is provided "as is" and "as available" without any warranties of any kind, whether express or implied. We do not warrant that the Platform will be uninterrupted, secure, or error-free.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">7. Limitation of Liability</h2>
                    <p className="text-gray-700">
                        In no event shall Heitaria Swiss AG be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Platform.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">8. Governing Law</h2>
                    <p className="text-gray-700">
                        These Terms shall be governed by and construed in accordance with the laws of Switzerland. Exclusive venue for disputes is the competent courts of Nidwalden, Switzerland.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">9. Changes</h2>
                    <p className="text-gray-700">
                        We reserve the right to modify or replace these Terms at any time. Your continued use of the Platform after any such changes constitutes your acceptance of the new Terms.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4">10. Contact Us</h2>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm">
                        <p className="font-semibold">Heitaria Swiss AG</p>
                        <p className="mt-2"><strong>Email:</strong> <a href="mailto:info@heitaria.ch" className="text-blue-600 hover:underline">info@heitaria.ch</a></p>
                    </div>
                </section>
            </div>
        </div>
    );
}

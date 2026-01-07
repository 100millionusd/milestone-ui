import React from 'react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
                <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
                <p className="mb-4 text-sm text-gray-500">Last Updated: December 25, 2025</p>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
                    <p className="mb-4 text-gray-700">
                        VibeLobby is a product of <strong>Heitaria Swiss AG</strong> (the “Company”, “we”, “us”). We value privacy and aim to be transparent about how personal information is collected, used, shared, and retained when using VibeLobby to book travel and connect with others. By using VibeLobby, you acknowledge the practices described in this policy.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. Who We Are (Controller)</h2>
                    <p className="mb-4 text-gray-700">
                        VibeLobby is a product of <strong>Heitaria Swiss AG</strong> ("Heitaria"). Heitaria is the <strong>data controller</strong> for personal information processed under this policy, except where a third party acts as an independent controller (for example, airlines/hotels processing guest data for their own compliance obligations).
                    </p>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm">
                        <p className="font-semibold">Heitaria Swiss AG</p>
                        <p>Rigistrasse 1</p>
                        <p>6374 Buochs</p>
                        <p>Switzerland</p>
                        <p className="mt-2"><strong>Email:</strong> <a href="mailto:support@vibelobby.com" className="text-blue-600 hover:underline">support@vibelobby.com</a></p>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. Information We Collect</h2>

                    <h3 className="text-lg font-medium mb-2">A. Transactional Data (the “Booking”)</h3>
                    <p className="mb-2 text-gray-700">To fulfill reservations via Duffel and applicable travel providers, we may collect:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li><strong>Identity and contact details:</strong> full legal name, email, phone number.</li>
                        <li><strong>Payment details:</strong> processed by a payment provider. <strong>We do not store full card numbers</strong>. We may store payment tokens and limited payment metadata (for example, last four digits, card brand, billing country) where provided by the payment provider.</li>
                        <li><strong>Travel document details (when required):</strong> passport/ID details and other traveler information required by airlines, hotels, or legal regulations.</li>
                    </ul>

                    <h3 className="text-lg font-medium mb-2">B. Social & Vibe Data (the “Experience”)</h3>
                    <p className="mb-2 text-gray-700">To provide social features such as Social Forecasts and Lobby Chat, we may collect:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li><strong>Vibe Tags and preferences:</strong> interests selected (for example, “Techno”, “Startups”, “Yoga”).</li>
                        <li><strong>Approximate geolocation during active check-in dates:</strong> used for Activity Density features.</li>
                        <li><strong>Chat content:</strong> messages and content sent through Lobby Chat.</li>
                        <li><strong>Profile information (optional):</strong> profile photo and any optional bio/handle that is added.</li>
                    </ul>

                    <h3 className="text-lg font-medium mb-2">C. Technical and Usage Data</h3>
                    <p className="mb-2 text-gray-700">We may automatically collect:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li><strong>Device and app data:</strong> device type, operating system, app version, browser type.</li>
                        <li><strong>Log and analytics data:</strong> IP address, approximate location inferred from IP, timestamps, pages/screens viewed, referral/utm data, and interactions.</li>
                        <li><strong>Cookies and similar technologies:</strong> for authentication, session management, and analytics (see Section 10).</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">4. How We Use Information</h2>
                    <p className="mb-4 text-gray-700">We use personal information for the following purposes:</p>

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">A. Booking Fulfillment</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>Create, manage, and support reservations.</li>
                                <li>Share required Booking data with <strong>Duffel</strong> and the relevant <strong>airline/hotel/accommodation provider</strong>.</li>
                                <li>Provide customer support and handle booking changes, cancellations, refunds, and disputes.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">B. Social Features and Matching</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>Calculate compatibility signals based on Vibe Tags.</li>
                                <li>Generate <strong>Activity Density</strong> heatmaps.</li>
                                <li>Enable Lobby Chat and related social discovery features.</li>
                            </ul>
                            <p className="mt-2 text-sm text-gray-600">
                                <strong>Aggregation & visibility:</strong> Heatmaps are <strong>aggregated and anonymized</strong> by default. If <strong>Public Mode</strong> is enabled during a stay, profile photo and selected Vibe Tags may be shown to verified guests in the same Digital Lobby.
                            </p>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">C. Safety, Trust, and Moderation</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>Enforce community rules and the Zero-Tolerance Policy against harassment.</li>
                                <li>Use automated systems and human review to detect and respond to abuse, fraud, and security incidents.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">D. Operations and Improvement</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>Debugging, performance monitoring, product improvement, and analytics.</li>
                                <li>Prevent spam, fraud, and unauthorized access.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">E. Legal and Compliance</h3>
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
                        <li><strong>Contract:</strong> to provide bookings and account services.</li>
                        <li><strong>Legitimate interests:</strong> to secure the platform, prevent fraud, improve features, and moderate chat (balanced against privacy rights).</li>
                        <li><strong>Consent:</strong> for certain social features (for example, enabling Public Mode, or sharing optional profile elements) and for non-essential cookies where required.</li>
                        <li><strong>Legal obligation:</strong> where retention or disclosure is required by law.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">6. How We Share Information</h2>
                    <p className="mb-4 text-gray-700">We share personal information only as needed:</p>

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">A. Service Providers (Processors)</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li><strong>Duffel Technology:</strong> inventory, booking management, and travel fulfillment.</li>
                                <li><strong>Payment providers:</strong> to process payments and manage fraud.</li>
                                <li><strong>Hosting, analytics, and customer support vendors:</strong> to operate and improve services.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">B. Travel Providers (Independent Controllers)</h3>
                            <p className="text-gray-700">Airlines, hotels, and accommodations receive required traveler information for booking and compliance purposes.</p>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">C. Other Users</h3>
                            <p className="text-gray-700">If <strong>Public Mode</strong> is enabled during a stay, other verified guests in the same Digital Lobby can view:</p>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>profile photo (if provided), and</li>
                                <li>selected Vibe Tags.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">D. Legal, Safety, and Business Transfers</h3>
                            <p className="text-gray-700">We may disclose information:</p>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>to comply with law, court order, or lawful request,</li>
                                <li>to protect safety and prevent harm,</li>
                                <li>in connection with a merger, acquisition, or asset sale (with appropriate safeguards).</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">7. International Data Transfers</h2>
                    <p className="text-gray-700">
                        VibeLobby and vendors may process information outside the country/region where it is collected. Where required, transfers rely on appropriate safeguards such as Standard Contractual Clauses or equivalent mechanisms.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">8. Data Retention</h2>
                    <p className="mb-2 text-gray-700">We keep information only as long as needed for the purposes described:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li><strong>Booking records:</strong> retained for <strong>7 years</strong> for tax and legal compliance.</li>
                        <li><strong>Chat logs (Public & City):</strong> messages sent in the Digital Lobby or City Chat are <strong>deleted immediately</strong> following your scheduled Check-out date.</li>
                        <li><strong>Private Messages (DMs):</strong> direct communications between users remain persistent unless individually deleted by the sender or upon account closure.</li>
                        <li><strong>Vibe profile:</strong> retained while the account remains active; it can be deleted in Settings.</li>
                        <li><strong>Technical logs:</strong> retained for a limited period consistent with security and analytics needs.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">9. Security</h2>
                    <p className="text-gray-700">
                        VibeLobby uses reasonable administrative, technical, and organizational measures designed to protect information. No method of transmission or storage is 100% secure.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">10. Cookies and Similar Technologies</h2>
                    <p className="mb-2 text-gray-700">VibeLobby uses cookies or similar technologies for:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li>essential authentication and session management,</li>
                        <li>security (fraud prevention), and</li>
                        <li>analytics and performance.</li>
                    </ul>
                    <p className="text-gray-700">
                        Where required by law, non-essential cookies are used only with consent, and preferences can be managed via browser settings and in-app controls (where available).
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">11. Privacy Rights (GDPR / CCPA and Similar Laws)</h2>
                    <p className="mb-2 text-gray-700">Depending on location, rights may include:</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-1">
                        <li><strong>Access:</strong> request a copy of personal information.</li>
                        <li><strong>Correction:</strong> request correction of inaccurate information.</li>
                        <li><strong>Deletion:</strong> request deletion of account and certain data (subject to legal exceptions).</li>
                        <li><strong>Portability:</strong> receive data in a portable format (where applicable).</li>
                        <li><strong>Restriction/Objection:</strong> limit or object to certain processing.</li>
                        <li><strong>Opt-out of targeted advertising/sale/sharing (where applicable):</strong> if VibeLobby engages in such activities, opt-out controls will be provided.</li>
                    </ul>
                    <p className="mb-4 text-gray-700"><strong>Social opt-out:</strong> VibeLobby can be used for booking without social features.</p>

                    <h3 className="text-lg font-medium mb-1">California Notices (CCPA/CPRA)</h3>
                    <p className="text-gray-700">
                        If applicable, California residents may have the right to know, delete, correct, and opt out of “sale” or “sharing” of personal information, and the right to non-discrimination for exercising rights.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">12. Children</h2>
                    <p className="text-gray-700">
                        VibeLobby is not intended for children under 13 (or the age required by local law). Accounts are not knowingly created for children.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">13. Changes to This Policy</h2>
                    <p className="text-gray-700">
                        This policy may be updated from time to time. The “Last Updated” date reflects the most recent revision. Material changes will be communicated through the app or by email where required.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4">14. Contact</h2>
                    <p className="mb-2 text-gray-700">To ask questions or exercise privacy rights, contact:</p>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm">
                        <p className="font-semibold">Heitaria Swiss AG (VibeLobby)</p>
                        <p>Rigistrasse 1</p>
                        <p>6374 Buochs</p>
                        <p>Switzerland</p>
                        <p className="mt-2"><strong>Email:</strong> <a href="mailto:support@vibelobby.com" className="text-blue-600 hover:underline">support@vibelobby.com</a></p>
                    </div>
                </section>
            </div>
        </div>
    );
}

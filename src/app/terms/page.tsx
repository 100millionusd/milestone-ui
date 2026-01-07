import React from 'react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
                <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
                <p className="mb-6 text-sm text-gray-500">Last Updated: December 25, 2025</p>

                <p className="mb-4 text-gray-700">
                    Welcome to VibeLobby (the “Platform”). These Terms of Service (“Terms”) govern access to and use of the Platform.
                </p>

                <p className="mb-6 text-gray-700">
                    VibeLobby is a product of <strong>Heitaria Swiss AG</strong> (“Heitaria”, “we”, “us”). By accessing or using the Platform, you agree to these Terms.
                </p>

                <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm mb-8">
                    <p className="font-semibold">Heitaria Swiss AG (VibeLobby)</p>
                    <p>Rigistrasse 1</p>
                    <p>6374 Buochs</p>
                    <p>Switzerland</p>
                    <p className="mt-2"><strong>Email:</strong> <a href="mailto:support@vibelobby.com" className="text-blue-600 hover:underline">support@vibelobby.com</a></p>
                </div>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. Definitions</h2>
                    <ul className="list-disc pl-5 text-gray-700 space-y-2">
                        <li><strong>“Booking”</strong> means a reservation for travel services (including flights, hotels, or accommodations) made through the Platform.</li>
                        <li><strong>“Travel Provider”</strong> means the airline, hotel, accommodation, or other service provider that delivers the travel service.</li>
                        <li><strong>“OTA”</strong> means online travel agency.</li>
                        <li><strong>“Digital Lobby”</strong> means the in-app social space associated with a specific stay or trip.</li>
                        <li><strong>“Digital Key”</strong> means an in-app credential or access token used to participate in a Digital Lobby or related features.</li>
                        <li><strong>“Social Forecasts”</strong> means predictive or informational features intended to summarize or estimate social/activity signals.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. Our Service</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">2.1 What we do</h3>
                            <p className="text-gray-700">VibeLobby operates as an OTA and social platform. We facilitate Bookings through third-party booking and inventory providers (including Duffel) and connect travelers through social features.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">2.2 What we do not do</h3>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>We are not an airline, hotel operator, accommodation operator, or tour operator.</li>
                                <li>Travel services are delivered by Travel Providers, and the on-site experience is controlled by the Travel Provider.</li>
                                <li>Travel Providers may impose additional terms, rules, and policies. Those terms apply to the travel services.</li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">2.3 Platform availability</h3>
                            <p className="text-gray-700">We may modify, suspend, or discontinue any portion of the Platform at any time. We do not guarantee uninterrupted availability.</p>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. Eligibility and Account</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">3.1 Age and capacity</h3>
                            <p className="text-gray-700">You must be at least 18 years old (or the age of legal majority where you live) and have legal capacity to enter into these Terms.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">3.2 Account security</h3>
                            <p className="text-gray-700">You are responsible for maintaining the security of your account credentials and for all activity under your account.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">3.3 Accurate information</h3>
                            <p className="text-gray-700">You agree to provide accurate and complete information, including traveler and identity details required to complete a Booking.</p>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">4. Bookings, Payments, and Taxes</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">4.1 Booking process</h3>
                            <p className="text-gray-700">When you submit a Booking, you authorize us (and our booking partners) to transmit required traveler details to Duffel and the relevant Travel Provider to complete the reservation.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">4.2 Payment processing</h3>
                            <p className="text-gray-700">Payments are processed by a third-party payment provider. We do not store full card numbers. Payment providers may apply their own terms and may conduct fraud checks.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">4.3 Pricing, currency, and fees</h3>
                            <p className="text-gray-700">Displayed prices may include taxes and fees or may show taxes/fees separately depending on the Travel Provider and jurisdiction. Currency conversion, foreign transaction fees, or additional fees may be applied by your bank or payment provider.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">4.4 Traveler requirements</h3>
                            <p className="text-gray-700">You are responsible for ensuring traveler documentation (passport/ID/visa), health requirements, and compliance with Travel Provider rules. Failure to comply may result in denial of boarding/check-in without refund.</p>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">5. Cancellations, Changes, and Refunds</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">5.1 Provider policies control</h3>
                            <p className="text-gray-700">Cancellation and change policies (including Refundable vs. Non-Refundable) are set by the Travel Provider and/or rate selected at checkout. VibeLobby will honor the applicable policy.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">5.2 How to request changes</h3>
                            <p className="text-gray-700">Where the Travel Provider permits, you may request cancellation or changes through the Platform or by contacting support. Approval and timing depend on the provider’s policy and processing timelines.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">5.3 Chargebacks and disputes</h3>
                            <p className="text-gray-700">If you initiate a chargeback or payment dispute, we may suspend your account while the dispute is resolved and may request additional information to investigate.</p>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">6. Social Features, Digital Lobby, and Conduct</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">6.1 Social features are optional</h3>
                            <p className="text-gray-700">Social features (including Lobby Chat, Social Forecasts, and Activity Density) are optional and may be disabled in settings.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">6.2 Community rules</h3>
                            <p className="text-gray-700 mb-2">The Digital Lobby and Lobby Chat are privileges. You agree not to use the Platform to:</p>
                            <ul className="list-disc pl-5 text-gray-700">
                                <li>harass, threaten, defame, or bully others,</li>
                                <li>post hate speech or discriminatory content,</li>
                                <li>solicit illegal services or engage in illegal activity,</li>
                                <li>share explicit content, spam, or malware,</li>
                                <li>impersonate others or misrepresent affiliation.</li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">6.3 Zero-tolerance enforcement</h3>
                            <p className="text-gray-700">We operate a zero-tolerance policy for harassment, hate speech, or illegal solicitation. Violations may result in immediate suspension or permanent ban and revocation of your Digital Key, without notice.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">6.4 Moderation</h3>
                            <p className="text-gray-700">We may use automated systems and human review to moderate content and enforce these Terms. We may remove content and restrict access at our discretion.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">6.5 Public Mode visibility</h3>
                            <p className="text-gray-700">If you enable “Public Mode” during a stay, limited profile elements (for example, profile photo and selected Vibe Tags) may be visible to other verified guests in the same Digital Lobby.</p>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">7. User Content and License</h2>
                    <p className="mb-4 text-gray-700">
                        You retain ownership of content you submit (such as chat messages or profile content). You grant us a non-exclusive, worldwide, royalty-free license to host, store, reproduce, and display that content solely to operate, improve, and provide the Platform, including moderation and safety.
                    </p>
                    <p className="text-gray-700">
                        You represent that you have the rights needed to submit the content and that it does not violate law or third-party rights.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">8. AI Features and Disclaimers</h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">8.1 Social Forecasts are informational</h3>
                            <p className="text-gray-700">AI-generated Social Forecasts are predictive and informational. They may be inaccurate and are not guarantees.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium mb-1">8.2 No reliance for safety-critical decisions</h3>
                            <p className="text-gray-700">Do not rely on AI outputs for safety-critical, medical, legal, or financial decisions.</p>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">9. Intellectual Property</h2>
                    <p className="text-gray-700">
                        The Platform, including software, design, trademarks, and content provided by us, is owned by Heitaria or its licensors and is protected by applicable laws. You may not copy, reverse engineer, or exploit the Platform except as permitted by law.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">10. Third-Party Services and Links</h2>
                    <p className="text-gray-700">
                        The Platform integrates with third parties (including Duffel, payment providers, and Travel Providers). Third-party services are subject to their own terms and privacy practices. We are not responsible for third-party services or content.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">11. Disclaimer of Warranties</h2>
                    <p className="text-gray-700">
                        The Platform is provided “as is” and “as available”. To the maximum extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">12. Limitation of Liability</h2>
                    <p className="mb-4 text-gray-700">To the maximum extent permitted by law:</p>
                    <ul className="list-disc pl-5 text-gray-700 mb-4">
                        <li>Heitaria is not liable for indirect, incidental, special, consequential, or punitive damages, or loss of profits, revenue, data, goodwill, or business opportunities.</li>
                        <li>Heitaria’s total liability for claims relating to the Platform will not exceed the amount you paid to Heitaria for the Booking or service giving rise to the claim in the 12 months before the event.</li>
                    </ul>
                    <p className="text-gray-700">Some jurisdictions do not allow certain limitations, so parts of this section may not apply.</p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">13. Indemnification</h2>
                    <p className="text-gray-700">
                        You agree to indemnify and hold harmless Heitaria from claims, damages, liabilities, and expenses (including reasonable legal fees) arising from your use of the Platform, your content, or your violation of these Terms or applicable law.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">14. Termination</h2>
                    <p className="text-gray-700">
                        You may stop using the Platform at any time. We may suspend or terminate access to the Platform (including Digital Lobby access) if we reasonably believe you violated these Terms, pose a risk to others, or for security/fraud reasons.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">15. Privacy</h2>
                    <p className="text-gray-700">
                        Our Privacy Policy explains how we collect and use personal information. By using the Platform, you acknowledge the Privacy Policy.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">16. Changes to These Terms</h2>
                    <p className="text-gray-700">
                        We may update these Terms from time to time. The “Last Updated” date indicates when changes took effect. Continued use of the Platform after changes means acceptance of the updated Terms.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">17. Governing Law and Venue</h2>
                    <p className="text-gray-700">
                        These Terms are governed by the laws of Switzerland, excluding conflict-of-law rules. Exclusive venue for disputes is the competent courts of Nidwalden, Switzerland, unless mandatory law provides otherwise.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4">18. Contact</h2>
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

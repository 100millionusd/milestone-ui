import React from 'react';

export default function CookiesPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow">
                <h1 className="text-3xl font-bold mb-6">Cookie Policy</h1>
                <p className="mb-6 text-sm text-gray-500">Last Updated: December 25, 2025</p>

                <p className="mb-4 text-gray-700">
                    This Cookie Policy explains how VibeLobby (a product of <strong>Heitaria Swiss AG</strong>) uses cookies and similar technologies (including local storage) on vibelobby.com and in our web application (the “Services”).
                </p>

                <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm mb-8">
                    <p className="font-semibold">Heitaria Swiss AG (VibeLobby)</p>
                    <p>Rigistrasse 1</p>
                    <p>6374 Buochs</p>
                    <p>Switzerland</p>
                    <p className="mt-2"><strong>Email:</strong> <a href="mailto:support@vibelobby.com" className="text-blue-600 hover:underline">support@vibelobby.com</a></p>
                </div>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">1. What Are Cookies?</h2>
                    <ul className="list-disc pl-5 text-gray-700 space-y-2">
                        <li><strong>Cookies:</strong> Small text files stored by your browser that allow us to remember your session and settings.</li>
                        <li><strong>Local Storage:</strong> Browser technology used to store data locally on your device (such as your "Digital Key" for secure access).</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">2. Why We Use Them</h2>
                    <p className="text-gray-700">
                        We use these technologies to keep our Services functioning, remember your preferences, secure your account, prevent fraud, and maintain your verified booking status.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">3. Types of Cookies We Use</h2>

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium mb-1">A. Essential (Strictly Necessary)</h3>
                            <p className="text-gray-700 mb-2">These are required for the operation and security of the Services. You cannot opt out of these, as the application cannot function securely without them.</p>
                            <ul className="list-disc pl-5 text-gray-700 space-y-1">
                                <li><strong>Authentication:</strong> Keeps you logged in during your session.</li>
                                <li><strong>Wallet Security (Web3Auth):</strong> We use third-party infrastructure (Web3Auth/OpenLogin) to securely reconstruct your private key and manage the "Digital Key" handshake. These cookies are strictly limited to security, session management, and cryptography; they are not used for advertising or tracking.</li>
                                <li><strong>Fraud Prevention:</strong> Detects abnormal login attempts to protect your assets.</li>
                                <li><strong>CSRF Protection:</strong> Prevents cross-site forgery attacks.</li>
                            </ul>
                            <p className="mt-2 text-sm text-gray-600"><strong>Note:</strong> Clearing these cookies or local storage will log you out and remove access to active lobbies until you re-verify.</p>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">B. Preference (Functional)</h3>
                            <p className="text-gray-700">These remember your choices to improve your experience, such as your last searched city or selected Vibe Tags.</p>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">C. Analytics (Optional)</h3>
                            <p className="text-gray-700">Used to understand how visitors interact with our website (e.g., page visit counts). These are only active if you grant consent.</p>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">D. Marketing (Optional)</h3>
                            <p className="text-gray-700">Used to measure advertising campaigns. These are only active if you grant consent.</p>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-1">E. Support (Optional)</h3>
                            <p className="text-gray-700">Used to maintain chat sessions (e.g., customer support messengers).</p>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium mb-2">Cookie List (Detailed)</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm text-left text-gray-700 border border-gray-200">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                        <tr>
                                            <th className="px-4 py-2 border-b">Category</th>
                                            <th className="px-4 py-2 border-b">Cookie Name / Domain</th>
                                            <th className="px-4 py-2 border-b">Provider</th>
                                            <th className="px-4 py-2 border-b">Purpose</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="bg-white border-b">
                                            <td className="px-4 py-2 font-medium">Essential</td>
                                            <td className="px-4 py-2 font-mono text-xs">openlogin-session, torus-works</td>
                                            <td className="px-4 py-2">Web3Auth / OpenLogin</td>
                                            <td className="px-4 py-2"><strong>Security:</strong> Reconstructs the private key and manages the secure login handshake.</td>
                                        </tr>
                                        <tr className="bg-white border-b">
                                            <td className="px-4 py-2 font-medium">Essential</td>
                                            <td className="px-4 py-2 font-mono text-xs">connect.sid</td>
                                            <td className="px-4 py-2">VibeLobby (Server)</td>
                                            <td className="px-4 py-2"><strong>Session:</strong> Maintains your verified login state on our servers.</td>
                                        </tr>
                                        <tr className="bg-white border-b">
                                            <td className="px-4 py-2 font-medium">Analytics</td>
                                            <td className="px-4 py-2 font-mono text-xs">_ga, _ga_*</td>
                                            <td className="px-4 py-2">Google Analytics</td>
                                            <td className="px-4 py-2"><strong>Stats:</strong> Distinct from Web3Auth, these track generic site usage if accepted.</td>
                                        </tr>
                                        <tr className="bg-white border-b">
                                            <td className="px-4 py-2 font-medium">Marketing</td>
                                            <td className="px-4 py-2 font-mono text-xs">_gcl_au</td>
                                            <td className="px-4 py-2">Google Ads</td>
                                            <td className="px-4 py-2"><strong>Ads:</strong> Ad attribution and conversion tracking if accepted.</td>
                                        </tr>
                                        <tr className="bg-white border-b">
                                            <td className="px-4 py-2 font-medium">Support</td>
                                            <td className="px-4 py-2 font-mono text-xs">crisp-client...</td>
                                            <td className="px-4 py-2">Crisp</td>
                                            <td className="px-4 py-2"><strong>Chat:</strong> Maintains your live chat history and session.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 p-4 text-sm bg-blue-50 border-l-4 border-blue-400">
                                <strong>Privacy Note:</strong> We have configured our authentication provider (Web3Auth) to disable internal logging and experimentation cookies. Security cookies from <code>*.web3auth.io</code> or <code>*.openlogin.com</code> are used strictly for identity verification.
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">4. Managing Cookies</h2>
                    <p className="mb-4 text-gray-700">
                        You can block or delete cookies in your browser settings. However, please note that clearing Local Storage or blocking Essential cookies will log you out and remove your "Digital Keys," requiring you to re-login to access your lobbies.
                    </p>
                    <p className="text-gray-700">
                        Where required by law (EEA/UK/Switzerland), we provide in-app controls ("Cookie Settings") allowing you to reject non-essential categories.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">5. Updates</h2>
                    <p className="text-gray-700">
                        We may update this policy to reflect changes in technology or legislation. The effective date is stated at the top of this page.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4">Contact</h2>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm">
                        <p className="font-semibold">Heitaria Swiss AG</p>
                        <p className="mt-2"><strong>Email:</strong> <a href="mailto:support@vibelobby.com" className="text-blue-600 hover:underline">support@vibelobby.com</a></p>
                    </div>
                </section>
            </div>
        </div>
    );
}

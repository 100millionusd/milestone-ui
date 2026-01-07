'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ConsentState {
    necessary: boolean;
    analytics: boolean;
    timestamp: number;
}

export default function CookieConsentBanner() {
    const [showBanner, setShowBanner] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

    useEffect(() => {
        // Check localStorage on mount
        const storedConsent = localStorage.getItem('mx_cookie_consent_v2');

        if (storedConsent) {
            try {
                const parsed = JSON.parse(storedConsent);
                // If we have valid v2 consent, don't show banner
                if (parsed.timestamp) {
                    setAnalyticsEnabled(parsed.analytics);
                    return;
                }
            } catch (e) {
                // Invalid JSON, show banner
                setShowBanner(true);
            }
        } else {
            // Check for v1 consent to migrate or just show banner
            const v1Consent = localStorage.getItem('mx_cookie_consent');
            if (v1Consent === 'true') {
                // Migrate legacy 'true' to all enabled
                saveConsent({ necessary: true, analytics: true, timestamp: Date.now() });
            } else {
                setShowBanner(true);
            }
        }
    }, []);

    const saveConsent = (consent: ConsentState) => {
        localStorage.setItem('mx_cookie_consent_v2', JSON.stringify(consent));
        // Legacy support (optional, but keeps old logic happy if it checked this)
        localStorage.setItem('mx_cookie_consent', 'true');

        setShowBanner(false);
        setShowModal(false);
        setAnalyticsEnabled(consent.analytics);
    };

    const handleAcceptAll = () => {
        saveConsent({ necessary: true, analytics: true, timestamp: Date.now() });
    };

    const handleRejectNonEssential = () => {
        saveConsent({ necessary: true, analytics: false, timestamp: Date.now() });
    };

    const handleSavePreferences = () => {
        saveConsent({ necessary: true, analytics: analyticsEnabled, timestamp: Date.now() });
    };

    if (!showBanner && !showModal) return null;

    return (
        <>
            {/* --- LAYER 1: BANNER --- */}
            {showBanner && !showModal && (
                <div className="fixed bottom-0 left-0 right-0 z-[2147483647] bg-gray-900 border-t border-gray-800 p-6 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] animate-fade-in-up">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
                            <div className="flex-1 space-y-2">
                                <h3 className="text-white font-semibold text-lg">Your Privacy on MilestoneX</h3>
                                <p className="text-gray-300 text-sm leading-relaxed max-w-3xl">
                                    We (Heitaria Swiss AG) use cookies and similar technologies to ensure MilestoneX functions securely and effectively.
                                    With your permission, we also use performance cookies to analyze platform usage and improve our services.
                                </p>
                                <p className="text-gray-400 text-sm">
                                    You can accept all cookies, decline non-essential ones, or manage your specific preferences below.
                                    For more details, please see our <Link href="/cookies" className="text-blue-400 hover:underline">Cookie Policy</Link> and <Link href="/privacy" className="text-blue-400 hover:underline">Privacy Policy</Link>.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                                <button
                                    onClick={handleAcceptAll}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
                                >
                                    Accept All
                                </button>
                                <button
                                    onClick={handleRejectNonEssential}
                                    className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                                >
                                    Reject Non-Essential
                                </button>
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="px-6 py-2.5 bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white border border-transparent hover:border-gray-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                                >
                                    Manage Preferences
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- LAYER 2: PREFERENCE MODAL --- */}
            {showModal && (
                <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowModal(false)}
                    />

                    {/* Modal Content */}
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h2 className="text-xl font-bold text-gray-900">Cookie Preferences</h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-8 flex-1 overflow-y-auto">
                            <p className="text-gray-600 text-sm">
                                Manage how we use cookies on your device. Essential cookies are always active to ensure the platform works.
                            </p>

                            {/* Section 1: Necessary */}
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-semibold text-gray-900">1. Strictly Necessary</h3>
                                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">Always Active</span>
                                    </div>
                                    <p className="text-sm text-gray-500">
                                        These are required for the platform to function (e.g., logging in via Web3Auth, session security).
                                    </p>
                                </div>
                                <div className="pt-1">
                                    {/* Locked Toggle UI */}
                                    <div className="w-11 h-6 bg-gray-200 rounded-full relative cursor-not-allowed opacity-60">
                                        <div className="absolute right-1 top-1 w-4 h-4 bg-gray-400 rounded-full shadow-sm" />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Section 2: Analytics */}
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-900 mb-1">2. Analytics & Performance</h3>
                                    <p className="text-sm text-gray-500">
                                        Help us understand how you use MilestoneX so we can improve features and performance.
                                    </p>
                                </div>
                                <div className="pt-1">
                                    {/* Interactive Toggle */}
                                    <button
                                        onClick={() => setAnalyticsEnabled(!analyticsEnabled)}
                                        className={`w-11 h-6 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${analyticsEnabled ? 'bg-blue-600' : 'bg-gray-200 hover:bg-gray-300'
                                            }`}
                                    >
                                        <div
                                            className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${analyticsEnabled ? 'left-[calc(100%-1.25rem)]' : 'left-1'
                                                }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3 sticky bottom-0">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePreferences}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
                            >
                                Save Preferences
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

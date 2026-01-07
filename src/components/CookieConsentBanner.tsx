'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CookieConsentBanner() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        // Check localStorage on mount
        const consent = localStorage.getItem('mx_cookie_consent');
        if (!consent) {
            setShow(true);
        }
    }, []);

    const accept = () => {
        localStorage.setItem('mx_cookie_consent', 'true');
        setShow(false);
    };

    if (!show) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[2147483647] bg-gray-900 border-t border-gray-800 p-4 shadow-lg animate-fade-in-up">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-300 text-center sm:text-left">
                    <p>
                        We use cookies to improve your experience and ensure the security of our platform.
                        By continuing, you agree to our usage.
                    </p>
                    <div className="mt-1">
                        <Link href="/cookies" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                            Learn more in our Cookie Policy
                        </Link>
                    </div>
                </div>
                <button
                    onClick={accept}
                    className="whitespace-nowrap bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                >
                    Accept & Continue
                </button>
            </div>
        </div>
    );
}

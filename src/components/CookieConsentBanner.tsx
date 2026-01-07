'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CookieConsentBanner() {
    // DEBUG: Force visible immediately to rule out logic issues
    const [show, setShow] = useState(true);

    useEffect(() => {
        // Check localStorage on mount
        const consent = localStorage.getItem('mx_cookie_consent');
        console.log('CookieBanner mount:', { consent });
        // Only hide if EXPLICITLY consented
        if (consent === 'true') {
            setShow(false);
        }
    }, []);

    const accept = () => {
        localStorage.setItem('mx_cookie_consent', 'true');
        setShow(false);
    };

    if (!show) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            width: '100vw',
            zIndex: 999999,
            padding: '20px',
            backgroundColor: 'red',
            color: 'white',
            borderTop: '5px solid yellow',
            display: 'block'
        }}>
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="font-bold text-lg">
                    DEBUG MODE: INLINE STYLES
                    <p className="font-normal text-sm">
                        We use cookies to improve your experience.
                    </p>
                </div>
                <button
                    onClick={accept}
                    style={{
                        backgroundColor: 'blue',
                        color: 'white',
                        padding: '10px 20px',
                        borderRadius: '20px',
                        border: 'none',
                        cursor: 'pointer'
                    }}
                >
                    Accept & Continue
                </button>
            </div>
        </div>
    );
}

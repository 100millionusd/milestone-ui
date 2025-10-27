// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import { Web3AuthProvider } from '@/providers/Web3AuthProvider';
import ClientBootstrap from './ClientBootstrap';
import FetchTimeoutClient from '@/components/FetchTimeoutClient'; // keep if you added it

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LithiumX - Professional Project Management',
  description: 'Manage projects, bids, and milestone payments with USDT/USDC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClientBootstrap>
          <FetchTimeoutClient /> {/* ok if present; remove if you didn’t create it */}
          {/* NEW: isolate creates a new stacking context so content can't sit above header */}
          <div className="isolate min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
            {/* NEW: force nav above any content layers */}
            <header className="relative z-50 pointer-events-auto">
              <Navigation />
            </header>

            {/* NEW: make content explicitly below nav */}
            <main className="relative z-0 flex-1">{children}</main>

            <footer className="bg-gray-800 text-white border-t border-gray-700">
              <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col md:flex-row justify-between items-center">
                  <div className="text-center md:text-left mb-4 md:mb-0">
                    <p className="text-sm text-gray-400">
                      © {new Date().getFullYear()} LithiumX. All rights reserved.
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Secure project management with milestone payments
                    </p>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </ClientBootstrap>
      </body>
    </html>
  );
}

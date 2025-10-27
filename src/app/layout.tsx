// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import { Web3AuthProvider } from '@/providers/Web3AuthProvider';
import ClientBootstrap from './ClientBootstrap';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LithiumX - Professional Project Management',
  description: 'Manage projects, bids, and milestone payments with USDT/USDC',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClientBootstrap>
          <Web3AuthProvider>
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
              {/* nav kept exactly in place, just lifted onto its own stacking layer */}
              <div className="relative z-[9999] isolate pointer-events-auto">
                <Navigation />
              </div>

              <main className="flex-1">{children}</main>

              {/* Footer */}
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
          </Web3AuthProvider>
        </ClientBootstrap>
      </body>
    </html>
  );
}

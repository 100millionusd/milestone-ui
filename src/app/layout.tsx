// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Milestone - Professional Project Management',
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
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
          <Navigation />
          <main className="flex-1">
            {children}
          </main>
          
          {/* Footer */}
          <footer className="bg-gray-800 text-white border-t border-gray-700">
            <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row justify-between items-center">
                <div className="text-center md:text-left mb-4 md:mb-0">
                  <p className="text-sm text-gray-400">
                    © 2024 Milestone. All rights reserved.
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Secure project management with milestone payments
                  </p>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
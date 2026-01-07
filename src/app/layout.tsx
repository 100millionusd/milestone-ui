// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import { Web3AuthProvider } from '@/providers/Web3AuthProvider';
import ClientBootstrap from './ClientBootstrap';
import ImageEnhancer from '@/components/ImageEnhancer';
import AuthSync from '@/components/AuthSync';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MilestoneX - Professional Project Management',
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
        <AuthSync />
        <ClientBootstrap>
          <Web3AuthProvider>
            <ImageEnhancer />
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
              {/* nav kept exactly in place, just lifted onto its own stacking layer */}
              <div className="relative z-[9999] isolate pointer-events-auto">
                <Navigation />
              </div>

              <main className="flex-1">{children}</main>

              <footer className="bg-gray-800 text-white border-t border-gray-700 mt-auto">
                <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Brand & Address */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Heitaria Swiss AG</h3>
                      <p className="text-gray-400 text-sm">
                        Rigistrasse 1<br />
                        6374 Buochs, Switzerland
                      </p>
                      <a href="mailto:info@heitaria.ch" className="text-blue-400 text-sm mt-2 block hover:underline">info@heitaria.ch</a>
                    </div>

                    {/* Legal Links */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Legal</h3>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li><a href="/privacy" className="hover:text-white hover:underline">Privacy Policy</a></li>
                        <li><a href="/terms" className="hover:text-white hover:underline">Terms of Service</a></li>
                        <li><a href="/cookies" className="hover:text-white hover:underline">Cookie Policy</a></li>
                      </ul>
                    </div>

                    {/* Copyright/Tagline */}
                    <div className="md:text-right">
                      <p className="text-sm text-gray-400">
                        © {new Date().getFullYear()} Heitaria Swiss AG. All rights reserved.
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        MilestoneX Platform • Stablecoin Payments • AI
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


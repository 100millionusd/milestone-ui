'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useWeb3Auth as _useWeb3Auth } from '@/providers/Web3AuthProvider';

// Guard the provider so a missing/mis-timed context won't crash the nav
function useSafeWeb3Auth() {
  try {
    return _useWeb3Auth();
  } catch {
    return { address: null, role: null, logout: async () => {} } as any;
  }
}

function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const pathnameRaw = usePathname() || '/';
  const router = useRouter();
  const { address, role, logout } = useSafeWeb3Auth();

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const pathname = useMemo(() => (pathnameRaw || '/').split('?')[0], [pathnameRaw]);

  const isActive = (href: string) => {
    const target = href.split('?')[0];
    return pathname === target || pathname.startsWith(target + '/');
  };

  const roleLoading = role === undefined || role === null;
  const isAdmin = role === 'admin';
  const onAdminRoute = pathname.startsWith('/admin');
  const showAdminMenu = isAdmin || onAdminRoute || (roleLoading && !!address);

  useEffect(() => { if (onAdminRoute) setIsAdminOpen(true); }, [onAdminRoute]);

  const mainLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/projects', label: 'Projects' },
    { href: '/new', label: 'Submit Proposal' },
    { href: '/vendor/dashboard', label: 'Vendor Portal' },
  ];

  const adminLinks = [
    { href: '/admin/proposals', label: 'Proposals' },
    { href: '/admin/bids', label: 'Bids' },
    { href: '/admin/proofs', label: 'Proofs' },
    { href: '/admin/dashboard?tab=vendors', label: 'Vendors (Admin)' },
  ];

  return (
    <header className="bg-gradient-to-r from-gray-800 to-gray-900 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">L</span>
            </div>
            <h1 className="text-xl font-semibold">LithiumX</h1>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1 relative">
            {mainLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(item.href) ? 'text-cyan-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}

            {/* Admin dropdown */}
            {showAdminMenu && (
              <div className="relative">
                <button
                  onClick={() => setIsAdminOpen((o) => !o)}
                  className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1 ${
                    onAdminRoute ? 'text-cyan-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  Admin
                  <svg className={`w-4 h-4 transform transition-transform ${isAdminOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isAdminOpen && (
                  <div className="absolute mt-2 w-56 bg-white text-gray-800 rounded-md shadow-lg py-1 z-50">
                    {adminLinks.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={`block px-4 py-2 text-sm ${
                          isActive(sub.href) ? 'bg-gray-100 text-cyan-600' : 'hover:bg-gray-100'
                        }`}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* User Actions */}
          <div className="hidden md:flex items-center space-x-4 relative">
            <div className="relative">
              <div
                className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-700"
                onClick={() => setIsProfileOpen((o) => !o)}
              >
                <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {address ? String(address).slice(2, 4).toUpperCase() : 'G'}
                </div>
                <span className="text-sm text-gray-300">
                  {address ? `${String(address).slice(0, 6)}...${String(address).slice(-4)}` : 'Guest'}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white text-gray-800 rounded-md shadow-lg py-1 z-50">
                  {address ? (
                    <button
                      onClick={async () => {
                        try { await logout?.(); } catch {}
                        router.push('/vendor/login');
                      }}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                    >
                      Logout
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push('/vendor/login')}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                    >
                      Login
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileMenuOpen((o) => !o)}
            className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none"
          >
            <span className="sr-only">Open main menu</span>
            <div className="w-6 h-6 space-y-1">
              <span className={`block w-6 h-0.5 bg-current transition-transform ${isMobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
              <span className={`block w-6 h-0.5 bg-current transition-opacity ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-6 h-0.5 bg-current transition-transform ${isMobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
            </div>
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-700">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {mainLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                    isActive(item.href)
                      ? 'text-cyan-400 bg-gray-700'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}

              {showAdminMenu && (
                <div>
                  <p className="px-3 py-2 text-gray-400 text-xs uppercase">Admin</p>
                  {adminLinks.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                        isActive(sub.href)
                          ? 'text-cyan-600 bg-gray-100'
                          : 'text-gray-800 hover:bg-gray-100'
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Navigation;

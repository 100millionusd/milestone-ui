// src/components/Navigation.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { getAuthRoleOnce } from '@/lib/api';

type Role = 'admin' | 'vendor' | 'guest';

type NavItem =
  | { href: string; label: string; roles?: Array<Role>; requiresApproval?: boolean }
  | {
      label: string;
      roles?: Array<Role>;
      children: { href: string; label: string }[];
    };

export default function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  // Wallet context
  const { address, role: web3Role, logout = async () => {}, provider } = useWeb3Auth() || ({} as any);

  // Server cookie/JWT
  const [serverRole, setServerRole] = useState<Role | null>(null);
  const [vendorStatus, setVendorStatus] = useState<'approved' | 'pending' | 'rejected' | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info = await getAuthRoleOnce(); // { address, role, vendorStatus }
        const backendRole = (info?.role || '').toLowerCase();
        const mappedRole: Role = backendRole === 'admin' ? 'admin' : info?.address ? 'vendor' : 'guest';
        if (alive) {
          setServerRole(mappedRole);
          setVendorStatus(((info as any)?.vendorStatus ?? 'pending').toLowerCase() as any);
        }
      } catch {
        if (alive) {
          setServerRole('guest');
          setVendorStatus(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Effective role
  const role: Role = useMemo(() => serverRole ?? 'guest', [serverRole]);

  // Only admins or approved vendors can see project lists
  const canSeeProjects = role === 'admin' || (role === 'vendor' && vendorStatus === 'approved');

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  const navItems: NavItem[] = useMemo(
    () => [
      { href: '/', label: 'Dashboard' },
      { href: '/projects', label: 'Projects', roles: ['admin', 'vendor'], requiresApproval: true },
      { href: '/public', label: 'Public Projects', roles: ['admin', 'vendor'], requiresApproval: true },
      { href: '/new', label: 'Submit Proposal' },
      {
        label: 'Admin',
        roles: ['admin'],
        children: [
          { href: '/admin/oversight', label: 'Oversight' },
          { href: '/admin/proposals', label: 'Proposals' },
          { href: '/admin/bids', label: 'Bids' },
          { href: '/admin/proofs', label: 'Proofs' },
          { href: '/admin/entities', label: 'Entities' },
          { href: '/admin/vendors', label: 'Vendors' },
        ],
      },
      { href: '/vendor/dashboard', label: 'MyDesk' },
      { href: '/vendor/oversight', label: 'My Activity', roles: ['vendor', 'admin'] },
    ],
    []
  );

  const showItem = (item: NavItem) => {
    if (!('children' in item) && (item as any).requiresApproval && !canSeeProjects) return false;
    if (!('children' in item) && item.href === '/vendor/oversight' && role === 'admin') return false;
    if (!('children' in item) && item.href === '/new' && role === 'admin') return false;
    if (!('children' in item) && item.href === '/vendor/dashboard' && role === 'admin') return false;

    if (role === 'admin') return true;
    if ('roles' in item && item.roles) return item.roles.includes(role ?? 'guest');
    return true;
  };

  const resolveHref = (href: string) =>
    href === '/new' && role === 'guest' ? `/vendor/login?next=${encodeURIComponent('/new')}` : href;

  // Close all dropdowns when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      setIsAdminOpen(false);
      setIsProfileOpen(false);
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleNavigation = (href: string) => {
    setIsMobileMenuOpen(false);
    setIsAdminOpen(false);
    setIsProfileOpen(false);
    router.push(href);
  };

  const handleLogout = async () => {
    setIsProfileOpen(false);
    try {
      await logout();
      router.push('/vendor/login');
    } catch (error) {
      console.error('Logout failed:', error);
      router.push('/vendor/login');
    }
  };

  return (
    <header className="bg-gradient-to-r from-gray-800 to-gray-900 text-white shadow-lg sticky top-0 z-[1000]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link prefetch={false} href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">L</span>
            </div>
            <h1 className="text-xl font-semibold">LithiumX</h1>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1 relative">
            {navItems.filter(showItem).map((item) =>
              'children' in item ? (
                <div key={item.label} className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsAdminOpen((o) => !o);
                    }}
                    className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1 ${
                      isActive('/admin')
                        ? 'text-cyan-400 bg-gray-700'
                        : 'text-gray-300 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {item.label}
                    <svg
                      className={`w-4 h-4 transform transition-transform ${isAdminOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isAdminOpen && (
                    <div className="absolute mt-2 w-48 bg-white text-gray-800 rounded-md shadow-lg py-1 z-50">
                      {item.children.map((sub) => (
                        <Link
                          prefetch={false}
                          key={sub.href}
                          href={sub.href}
                          onClick={() => {
                            setIsAdminOpen(false);
                            setIsMobileMenuOpen(false);
                          }}
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
              ) : (
                <Link
                  prefetch={false}
                  key={item.href}
                  href={resolveHref(item.href)}
                  onClick={() => {
                    setIsAdminOpen(false);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(item.href) ? 'text-cyan-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>

          {/* User Actions */}
          <div className="hidden md:flex items-center space-x-4 relative">
            <div className="relative">
              <div
                className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-700"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsProfileOpen((o) => !o);
                }}
              >
                <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {address ? address.slice(2, 4).toUpperCase() : 'G'}
                </div>
                <span className="text-sm text-gray-300">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Guest'}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white text-gray-800 rounded-md shadow-lg py-1 z-50">
                  {address ? (
                    <>
                      <Link
                        prefetch={false}
                        href="/vendor/profile"
                        className="block px-4 py-2 text-sm hover:bg-gray-100"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        Vendor Profile
                      </Link>

                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        Logout
                      </button>
                    </>
                  ) : (
                    <Link
                      href="/vendor/login"
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      onClick={() => setIsProfileOpen(false)}
                    >
                      Login
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMobileMenuOpen((o) => !o);
            }}
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
              {navItems.filter(showItem).map((item) =>
                'children' in item ? (
                  <div key={item.label}>
                    <p className="px-3 py-2 text-gray-400 text-xs uppercase">{item.label}</p>
                    {item.children.map((sub) => (
                      <Link
                        prefetch={false}
                        key={sub.href}
                        href={sub.href}
                        className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                          isActive(sub.href) ? 'text-cyan-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                        }`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    prefetch={false}
                    key={item.href}
                    href={resolveHref(item.href)}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                      isActive(item.href) ? 'text-cyan-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              )}

              {address ? (
                <>
                  <Link
                    prefetch={false}
                    href="/vendor/profile"
                    className="block px-3 py-2 rounded-md text-base font-medium transition-colors text-gray-300 hover:text-white hover:bg-gray-700"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Vendor Profile
                  </Link>
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="block w-full text-left px-3 py-2 rounded-md text-base font-medium transition-colors text-gray-300 hover:text-white hover:bg-gray-700"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  href="/vendor/login"
                  className="block px-3 py-2 rounded-md text-base font-medium transition-colors text-gray-300 hover:text-white hover:bg-gray-700"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
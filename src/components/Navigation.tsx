// src/components/Navigation.tsx
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { getAuthRoleOnce } from '@/lib/api';

type Role = 'admin' | 'vendor' | 'proposer' | 'guest';

type NavItem =
  | { href: string; label: string; roles?: Array<Role>; requiresApproval?: boolean }
  | {
      label: string;
      roles?: Array<Role>;
      children: { href: string; label: string }[];
    };

/** ------------ auth role singleflight + tiny cache (prevents loops / bursts) ------------ */
type AuthInfo = { role?: string; address?: string; vendorStatus?: string | null };
const ROLE_TTL_MS = 10_000; // keep fresh for 10s to avoid hammering on remounts

let __roleInflight: Promise<AuthInfo> | null = null;
let __roleCache: { at: number; data: AuthInfo } | null = null;

async function getAuthRoleOnceCached(): Promise<AuthInfo> {
  const now = Date.now();
  if (__roleCache && now - __roleCache.at < ROLE_TTL_MS) return __roleCache.data;
  if (__roleInflight) return __roleInflight;

  __roleInflight = (async () => {
    const info = (await getAuthRoleOnce()) || {};
    const data: AuthInfo = {
      role: (info as any)?.role,
      address: (info as any)?.address,
      vendorStatus: (info as any)?.vendorStatus ?? null,
    };
    __roleCache = { at: Date.now(), data };
    return data;
  })()
    .finally(() => {
      __roleInflight = null;
    });

  return __roleInflight;
}
/** -------------------------------------------------------------------------------------- */

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

  // mount-only role load, deduped & cached; also ignores updates after unmount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info = await getAuthRoleOnceCached();
        if (!alive) return;

        const backendRole = String(info?.role || '').toLowerCase();
 let mappedRole: Role;
if (backendRole === 'admin') {
  mappedRole = 'admin';
} else if (backendRole === 'vendor') {
  mappedRole = 'vendor';
} else if (backendRole === 'proposer') {
  mappedRole = 'proposer';
} else {
  mappedRole = 'guest';
}

        const vs = String(info?.vendorStatus ?? 'pending').toLowerCase() as
          | 'approved'
          | 'pending'
          | 'rejected';

        setServerRole(mappedRole);
        setVendorStatus(vs);
      } catch {
        if (!alive) return;
        setServerRole('guest');
        setVendorStatus(null);
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
    const clean = path.split('?')[0];
    return pathname === clean || pathname.startsWith(clean + '/');
  };

  const navItems: NavItem[] = useMemo(
    () => [
      { href: '/', label: 'Dashboard' },
      { href: '/projects', label: 'Projects', roles: ['admin', 'vendor'], requiresApproval: true },
      { href: '/public', label: 'Public Projects', roles: ['admin', 'vendor', 'proposer', 'guest'] },
      { href: '/new', label: 'Submit Proposal', roles: ['guest', 'proposer'] },
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
          { href: '/admin/analyst', label: 'Analyst' },
        ],
      },
      { href: '/vendor/dashboard', label: 'MyDesk' },
      { href: '/vendor/oversight', label: 'My Activity', roles: ['vendor', 'admin', 'proposer'] },
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

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/vendor/login');
    } catch (error) {
      console.error('Logout failed:', error);
      router.push('/vendor/login');
    }
  };

  // Special navigation handler for project pages
  const handleNavigation = (href: string, e?: React.MouseEvent) => {
    // Close all menus
    setIsMobileMenuOpen(false);
    setIsAdminOpen(false);
    setIsProfileOpen(false);

    // If we're on a project page, use a more direct approach
    if (pathname.startsWith('/projects/')) {
      if (e) e.preventDefault();
      window.location.href = href; // full reload keeps heavy views clean
      return;
    }

    if (e) e.preventDefault();
    router.push(href);
  };

  return (
    <header className="bg-gradient-to-r from-gray-800 to-gray-900 text-white shadow-lg sticky top-0 z-[1000]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div
            onClick={() => handleNavigation('/')}
            className="flex items-center space-x-2 cursor-pointer"
          >
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">L</span>
            </div>
            <h1 className="text-xl font-semibold">LithiumX</h1>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1 relative">
            {navItems.filter(showItem).map((item) =>
              'children' in item ? (
                <div key={item.label} className="relative">
                  <button
                    onClick={() => setIsAdminOpen(!isAdminOpen)}
                    className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1 ${
                      pathname.startsWith('/admin')
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
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white text-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200">
                      {item.children.map((sub) => (
                        <div
                          key={sub.href}
                          onClick={() => handleNavigation(sub.href)}
                          className={`block px-4 py-2 text-sm hover:bg-gray-100 transition-colors cursor-pointer ${
                            isActive(sub.href) ? 'text-cyan-600 bg-gray-50' : 'text-gray-700'
                          }`}
                        >
                          {sub.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={item.href}
                  onClick={() => handleNavigation(resolveHref(item.href))}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive(item.href) ? 'text-cyan-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </div>
              )
            )}
          </nav>

          {/* User Actions */}
          <div className="hidden md:flex items-center space-x-4 relative">
            <div className="relative">
              <div
                className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-700"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
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
                <div className="absolute right-0 mt-1 w-48 bg-white text-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200">
                  {address ? (
                    <>
 <div
  onClick={() => handleNavigation('/vendor/profile')}
  className="block px-4 py-2 text-sm hover:bg-gray-100 transition-colors cursor-pointer"
  title="Profile"
  aria-label="Profile"
>
  Profile
</div>

                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                      >
                        Logout
                      </button>
                    </>
                  ) : (
                    <div
                      onClick={() => handleNavigation('/vendor/login')}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      Login
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
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
                    <p className="px-3 py-2 text-gray-400 text-xs uppercase font-medium">{item.label}</p>
                    <div className="ml-2 space-y-1">
                      {item.children.map((sub) => (
                        <div
                          key={sub.href}
                          onClick={() => handleNavigation(sub.href)}
                          className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                            isActive(sub.href) ? 'text-cyan-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                          }`}
                        >
                          {sub.label}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    key={item.href}
                    onClick={() => handleNavigation(resolveHref(item.href))}
                    className={`block px-3 py-2 rounded-md text-base font-medium transition-colors cursor-pointer ${
                      isActive(item.href) ? 'text-cyan-400 bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {item.label}
                  </div>
                )
              )}

              {address ? (
                <>
 <div
  onClick={() => handleNavigation('/vendor/profile')}
  className="block px-3 py-2 rounded-md text-base font-medium transition-colors text-gray-300 hover:text-white hover:bg-gray-700 cursor-pointer"
  title="Profile"
  aria-label="Profile"
>
  Profile
</div>
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
                <div
                  onClick={() => handleNavigation('/vendor/login')}
                  className="block px-3 py-2 rounded-md text-base font-medium transition-colors text-gray-300 hover:text-white hover:bg-gray-700 cursor-pointer"
                >
                  Login
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

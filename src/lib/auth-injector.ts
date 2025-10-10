'use client';

// Set this to your API origin
const API_ORIGIN = 'https://milestone-api-production.up.railway.app';
const FRONTEND_BASE_URL = 'https://lithiumx.netlify.app';

// Enhanced token management with refresh support
function getToken(): string | null {
  try {
    // Check multiple possible token storage keys
    const tokenKeys = ['lx_token', 'token', 'auth_token', 'jwt_token'];
    let token: string | null = null;
    
    for (const key of tokenKeys) {
      const value = localStorage.getItem(key);
      if (value && value.split('.').length === 3 && value.length > 40) {
        token = value;
        break;
      }
    }

    if (!token) return null;

    // Validate token expiration
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload?.exp && Date.now() >= payload.exp * 1000) {
        console.warn('JWT expired; clearing tokens');
        clearAllTokens();
        return null;
      }
      return token;
    } catch (parseError) {
      console.error('Invalid token format:', parseError);
      clearAllTokens();
      return null;
    }
  } catch (error) {
    console.error('Token retrieval error:', error);
    return null;
  }
}

function clearAllTokens(): void {
  const tokenKeys = ['lx_token', 'token', 'auth_token', 'jwt_token'];
  tokenKeys.forEach(key => localStorage.removeItem(key));
}

function redirectToLogin(): void {
  // Clear any existing tokens
  clearAllTokens();
  
  // Try to find the correct login path by checking common routes
  const commonLoginPaths = ['/', '/login', '/auth', '/auth/login', '/signin', '/sign-in'];
  const currentPath = window.location.pathname + window.location.search;
  
  // Check if we're already on a page that might be the login
  const isAlreadyOnLoginPage = commonLoginPaths.some(path => 
    window.location.pathname === path || window.location.pathname.startsWith(path + '/')
  );
  
  if (isAlreadyOnLoginPage) {
    console.log('Already on potential login page, not redirecting');
    return;
  }
  
  // Try each common login path until we find one that works
  let loginAttempts = 0;
  
  const tryLoginRedirect = () => {
    if (loginAttempts >= commonLoginPaths.length) {
      console.error('No valid login path found, redirecting to home');
      window.location.href = FRONTEND_BASE_URL;
      return;
    }
    
    const loginPath = commonLoginPaths[loginAttempts];
    const loginUrl = `${FRONTEND_BASE_URL}${loginPath}?redirect=${encodeURIComponent(currentPath)}`;
    
    console.log(`Trying login redirect to: ${loginUrl}`);
    
    // Test if this path exists by checking if we'd be staying on the same page
    if (loginPath === window.location.pathname) {
      loginAttempts++;
      tryLoginRedirect();
      return;
    }
    
    // Use a hidden iframe to test the URL first
    const testFrame = document.createElement('iframe');
    testFrame.style.display = 'none';
    testFrame.src = loginUrl;
    
    testFrame.onload = () => {
      document.body.removeChild(testFrame);
      console.log(`Login path ${loginPath} exists, redirecting...`);
      window.location.href = loginUrl;
    };
    
    testFrame.onerror = () => {
      document.body.removeChild(testFrame);
      console.warn(`Login path ${loginPath} not found, trying next...`);
      loginAttempts++;
      setTimeout(tryLoginRedirect, 100);
    };
    
    document.body.appendChild(testFrame);
  };
  
  tryLoginRedirect();
}

// Enhanced fetch injector with better error handling
(function installFetchInjector() {
  if (typeof window === 'undefined') return;
  if ((window as any).__authInjectorInstalled) return;
  (window as any).__authInjectorInstalled = true;

  const origFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    let href = typeof input === 'string' ? input : (input as Request).url;
    let url: URL;
    
    try { 
      url = new URL(href, window.location.href);
    } catch (error) {
      console.error('Invalid URL:', href);
      return origFetch(input, init);
    }

    const isTargetAPI = url.origin === API_ORIGIN;
    const isAuthEndpoint = url.pathname.includes('/auth/');

    // Prepare headers for API requests
    if (isTargetAPI && !isAuthEndpoint) {
      const headers = new Headers(
        init?.headers || 
        (typeof input !== 'string' ? (input as Request).headers : undefined)
      );

      // Add Authorization header if not present
      if (!headers.has('Authorization')) {
        const token = getToken();
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
          if (process.env.NODE_ENV !== 'production') {
            console.log('🔒 Injecting Bearer token for API request to:', url.pathname);
          }
        } else {
          console.warn('No auth token available for API request to:', url.pathname);
          
          // Don't redirect for public endpoints that might not need auth
          const publicEndpoints = ['/proposals', '/health', '/test'];
          const isPublicEndpoint = publicEndpoints.some(endpoint => 
            url.pathname === endpoint || url.pathname.startsWith(endpoint + '/')
          );
          
          if (!isPublicEndpoint) {
            console.warn('Non-public endpoint without auth, might fail:', url.pathname);
          }
        }
      }

      // Ensure CORS settings for cross-site requests
      init = { 
        mode: 'cors', 
        credentials: 'include', 
        ...init, 
        headers 
      };
    }

    try {
      const response = await origFetch(input, init);
      
      // Handle authentication errors (401 Unauthorized)
      if (isTargetAPI && response.status === 401 && !isAuthEndpoint) {
        console.warn('Authentication failed (401) for:', url.pathname);
        
        // Don't redirect if we're already trying to authenticate
        if (url.pathname.includes('/auth/')) {
          return response;
        }
        
        // Check if we have a token that might be expired
        const token = getToken();
        if (token) {
          console.warn('Token exists but API returned 401, token might be expired');
        }
        
        redirectToLogin();
        throw new Error('Authentication required');
      }

      // Handle forbidden access (403 Forbidden)
      if (isTargetAPI && response.status === 403) {
        console.error('Access forbidden (403) for:', url.pathname);
      }

      return response;
    } catch (error) {
      // Only log non-auth errors to avoid console noise during redirects
      if (!error.message.includes('Authentication required')) {
        console.error('Fetch error for', url.pathname, ':', error);
      }
      throw error;
    }
  };

  // Add method to manually clear auth state
  (window as any).clearAuth = clearAllTokens;
  
  // Add method to check auth status
  (window as any).getAuthStatus = () => {
    const token = getToken();
    if (!token) return { isAuthenticated: false };
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isExpired = payload.exp ? Date.now() >= payload.exp * 1000 : false;
      
      return { 
        isAuthenticated: !isExpired,
        isExpired,
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
        payload 
      };
    } catch {
      return { isAuthenticated: false, isExpired: true };
    }
  };

  // Add method to manually redirect to login
  (window as any).redirectToLogin = redirectToLogin;

  if (process.env.NODE_ENV !== 'production') {
    console.log('🔒 Enhanced Bearer fetch injector installed for', API_ORIGIN);
    console.log('💡 Available methods: clearAuth(), getAuthStatus(), redirectToLogin()');
  }

  // Auto-check auth status on page load
  setTimeout(() => {
    const status = (window as any).getAuthStatus();
    if (!status.isAuthenticated) {
      console.log('🔐 No active authentication session found');
      
      // If we're on a protected route and not authenticated, consider redirecting
      const protectedRoutes = ['/vendor/', '/admin/', '/dashboard'];
      const isProtectedRoute = protectedRoutes.some(route => 
        window.location.pathname.startsWith(route)
      );
      
      if (isProtectedRoute && !status.isAuthenticated) {
        console.log('🛡️ Protected route without auth, considering redirect...');
        // You might want to redirect here, or let the frontend handle it
      }
    } else {
      console.log('🔐 Active session found, expires:', status.expiresAt);
    }
  }, 1000);
})();

// Export functions for manual use if needed
export const authInjector = {
  getToken,
  clearTokens: clearAllTokens,
  redirectToLogin
};
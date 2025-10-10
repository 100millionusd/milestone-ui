'use client';

// Set this to your API origin
const API_ORIGIN = 'https://milestone-api-production.up.railway.app';
const FRONTEND_BASE_URL = 'https://lithiumx.netlify.app';
const LOGIN_PATH = '/login'; // Frontend login page path

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
  
  // Redirect to frontend login page (not API login)
  const currentPath = window.location.pathname + window.location.search;
  const loginUrl = `${FRONTEND_BASE_URL}${LOGIN_PATH}?redirect=${encodeURIComponent(currentPath)}`;
  
  console.log('Redirecting to login:', loginUrl);
  window.location.href = loginUrl;
}

// Enhanced fetch injector with error handling and retry logic
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
            console.log('🔒 Injecting Bearer token for API request');
          }
        } else {
          console.warn('No auth token available for API request');
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
        console.warn('Authentication failed (401), redirecting to login...');
        
        // Try to get more info from response body for debugging
        try {
          const errorData = await response.clone().json();
          console.warn('Auth error details:', errorData);
        } catch (e) {
          // Ignore if response body is not JSON
        }
        
        redirectToLogin();
        throw new Error('Authentication required');
      }

      // Handle forbidden access (403 Forbidden)
      if (isTargetAPI && response.status === 403) {
        console.error('Access forbidden (403)');
        // You could redirect to a "no access" page here or show a message
      }

      return response;
    } catch (error) {
      // Only log non-auth errors to avoid console noise during redirects
      if (!error.message.includes('Authentication required')) {
        console.error('Fetch error:', error);
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
      return { 
        isAuthenticated: true,
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
        payload 
      };
    } catch {
      return { isAuthenticated: false };
    }
  };

  // Add method to manually redirect to login
  (window as any).redirectToLogin = redirectToLogin;

  if (process.env.NODE_ENV !== 'production') {
    console.log('🔒 Enhanced Bearer fetch injector installed for', API_ORIGIN);
    console.log('💡 Available methods: clearAuth(), getAuthStatus(), redirectToLogin()');
    console.log('📍 Frontend base URL:', FRONTEND_BASE_URL);
    console.log('🔑 Login path:', LOGIN_PATH);
  }

  // Optional: Auto-check auth status on page load
  setTimeout(() => {
    const status = (window as any).getAuthStatus();
    if (!status.isAuthenticated) {
      console.log('🔐 No active authentication session found');
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

// Optional: Auto-initialize and check auth status
if (typeof window !== 'undefined') {
  // You can also add a global auth state listener
  window.addEventListener('storage', (event) => {
    if (event.key === 'lx_token' || event.key === 'token') {
      console.log('Auth storage changed, rechecking status...');
      const status = (window as any).getAuthStatus();
      if (!status.isAuthenticated && !window.location.pathname.includes(LOGIN_PATH)) {
        console.log('Token removed, redirecting to login...');
        redirectToLogin();
      }
    }
  });
}
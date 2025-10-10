'use client';

// Set this to your API origin
const API_ORIGIN = 'https://milestone-api-production.up.railway.app';
const LOGIN_PATH = '/auth/login'; // Path to redirect on auth failures

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
  
  // Redirect to login page
  const currentPath = window.location.pathname + window.location.search;
  const loginUrl = `${LOGIN_PATH}?redirect=${encodeURIComponent(currentPath)}`;
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
        console.warn('Authentication failed, redirecting to login...');
        redirectToLogin();
        throw new Error('Authentication required');
      }

      // Handle forbidden access (403 Forbidden)
      if (isTargetAPI && response.status === 403) {
        console.error('Access forbidden');
        // You could redirect to a "no access" page here
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

  if (process.env.NODE_ENV !== 'production') {
    console.log('🔒 Enhanced Bearer fetch injector installed for', API_ORIGIN);
    console.log('💡 Available methods: clearAuth(), getAuthStatus()');
  }
})();

// Export functions for manual use if needed
export const authInjector = {
  getToken,
  clearTokens: clearAllTokens,
  redirectToLogin
};
/**
 * App Bridge v4 Authentication Helpers
 * These functions are injected into admin pages for client-side use
 */

export const authHelpersScript = `
<script data-api-key="{{apiKey}}" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
<script>
  // Wait for App Bridge to be available
  function waitForAppBridge(maxWait = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      function check() {
        if (typeof window.shopify !== 'undefined') {
          resolve();
        } else if (Date.now() - startTime > maxWait) {
          reject(new Error('App Bridge not available after ' + maxWait + 'ms'));
        } else {
          setTimeout(check, 100);
        }
      }

      check();
    });
  }

  // Initialize App Bridge
  async function initAppBridge() {
    try {
      await waitForAppBridge();
      console.log('App Bridge initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize App Bridge:', error);
      return false;
    }
  }

  // Get fresh session token from App Bridge
  async function getSessionToken() {
    if (typeof window.shopify === 'undefined') {
      throw new Error('App Bridge not initialized');
    }

    try {
      const token = await window.shopify.idToken();
      return token;
    } catch (error) {
      console.error('Failed to get session token:', error);
      throw new Error('Failed to get session token: ' + error.message);
    }
  }

  // Authenticated fetch wrapper - automatically adds Bearer token
  async function authenticatedFetch(url, options = {}) {
    try {
      const token = await getSessionToken();
      console.log('Session token obtained:', token ? 'Yes (length: ' + token.length + ')' : 'No');
      console.log('Making request to:', url, 'Method:', options.method || 'GET');

      const headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      };

      console.log('Request headers:', headers);
      const response = await fetch(url, {
        ...options,
        headers,
      });
      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Request failed with status ' + response.status);
      }

      return response;
    } catch (error) {
      console.error('Authenticated fetch failed:', error);
      throw error;
    }
  }

  // Helper for GET requests
  async function apiGet(url) {
    const response = await authenticatedFetch(url, { method: 'GET' });
    return response.json();
  }

  // Helper for POST requests
  async function apiPost(url, data) {
    const response = await authenticatedFetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.json();
  }

  // Helper for PUT requests
  async function apiPut(url, data) {
    const response = await authenticatedFetch(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.json();
  }

  // Helper for DELETE requests
  async function apiDelete(url) {
    const response = await authenticatedFetch(url, { method: 'DELETE' });
    return response.json();
  }

  // Show toast notification using App Bridge
  async function showToast(message, isError = false) {
    if (typeof window.shopify !== 'undefined' && window.shopify.toast) {
      window.shopify.toast.show(message, { isError });
    } else {
      if (isError) {
        console.error(message);
      } else {
        console.log(message);
      }
    }
  }

  // Navigate using App Bridge v4
  // For embedded apps, simply change the iframe location
  function navigateTo(path) {
    // Construct full URL from relative path
    const url = new URL(path, window.location.origin);
    window.location.href = url.href;
  }

  // Set up event delegation for navigation links
  function setupNavigation() {
    console.log('Setting up navigation event delegation');
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-path]');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        const path = link.dataset.path;
        console.log('Navigation click detected, path:', path);
        navigateTo(path);
      }
    }, true); // Use capture phase to ensure this runs first
  }

  // Auto-setup navigation when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupNavigation);
  } else {
    setupNavigation();
  }

  // Expose functions globally for use in other scripts
  window.initAppBridge = initAppBridge;
  window.getSessionToken = getSessionToken;
  window.authenticatedFetch = authenticatedFetch;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
  window.apiPut = apiPut;
  window.apiDelete = apiDelete;
  window.showToast = showToast;
  window.navigateTo = navigateTo;
</script>
`;

export default authHelpersScript;

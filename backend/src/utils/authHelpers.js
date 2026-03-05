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
  // Retries once with a fresh token if the server returns 401 with retry header
  async function authenticatedFetch(url, options = {}, _isRetry = false) {
    try {
      const token = await getSessionToken();
      console.log('Session token obtained:', token ? 'Yes (length: ' + token.length + ')' : 'No');
      console.log('Making request to:', url, 'Method:', options.method || 'GET');

      const headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      };

      const response = await fetch(url, {
        ...options,
        headers,
      });
      console.log('Response status:', response.status);

      // If 401 with retry header and this is the first attempt,
      // get a fresh session token and retry once
      if (response.status === 401 && !_isRetry) {
        const shouldRetry = response.headers.get('X-Shopify-Retry-Invalid-Session-Request');
        if (shouldRetry) {
          console.log('Server requested session retry, fetching fresh token...');
          return authenticatedFetch(url, options, true);
        }
      }

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

  // Custom Polaris-styled confirmation modal
  // Returns a Promise that resolves to true if confirmed, false if cancelled
  async function showConfirm(messageOrOptions, options = {}) {
    // Support both showConfirm('message') and showConfirm({ message, title, ... })
    let config;
    if (typeof messageOrOptions === 'string') {
      config = { message: messageOrOptions, ...options };
    } else {
      config = messageOrOptions;
    }

    const {
      title = 'Confirm',
      message,
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      destructive = false
    } = config;

    return new Promise((resolve) => {
      // Create modal styles if not already present
      if (!document.getElementById('polaris-modal-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'polaris-modal-styles';
        styleSheet.textContent = \`
          .polaris-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.2s ease-out;
          }
          .polaris-modal-overlay.visible {
            opacity: 1;
          }
          .polaris-modal {
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 26px 80px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.2);
            max-width: 500px;
            width: calc(100% - 32px);
            transform: scale(0.95);
            transition: transform 0.2s ease-out;
          }
          .polaris-modal-overlay.visible .polaris-modal {
            transform: scale(1);
          }
          .polaris-modal-header {
            padding: 16px 20px;
            border-bottom: 1px solid #e1e3e5;
          }
          .polaris-modal-title {
            font-size: 16px;
            font-weight: 600;
            color: #202223;
            margin: 0;
            line-height: 24px;
          }
          .polaris-modal-body {
            padding: 20px;
          }
          .polaris-modal-message {
            font-size: 14px;
            color: #6d7175;
            line-height: 20px;
            margin: 0;
            white-space: pre-line;
          }
          .polaris-modal-footer {
            padding: 16px 20px;
            border-top: 1px solid #e1e3e5;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
          }
          .polaris-modal-btn {
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.1s ease, border-color 0.1s ease;
            border: 1px solid transparent;
            line-height: 20px;
          }
          .polaris-modal-btn:focus {
            outline: 2px solid #005bd3;
            outline-offset: 2px;
          }
          .polaris-modal-btn-secondary {
            background: #fff;
            border-color: #8c9196;
            color: #202223;
          }
          .polaris-modal-btn-secondary:hover {
            background: #f6f6f7;
          }
          .polaris-modal-btn-primary {
            background: #008060;
            color: #fff;
          }
          .polaris-modal-btn-primary:hover {
            background: #006e52;
          }
          .polaris-modal-btn-destructive {
            background: #d82c0d;
            color: #fff;
          }
          .polaris-modal-btn-destructive:hover {
            background: #bc2200;
          }
        \`;
        document.head.appendChild(styleSheet);
      }

      // Create modal HTML
      const overlay = document.createElement('div');
      overlay.className = 'polaris-modal-overlay';
      overlay.innerHTML = \`
        <div class="polaris-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="polaris-modal-header">
            <h2 class="polaris-modal-title" id="modal-title">\${title}</h2>
          </div>
          <div class="polaris-modal-body">
            <p class="polaris-modal-message">\${message}</p>
          </div>
          <div class="polaris-modal-footer">
            <button class="polaris-modal-btn polaris-modal-btn-secondary" data-action="cancel">\${cancelText}</button>
            <button class="polaris-modal-btn \${destructive ? 'polaris-modal-btn-destructive' : 'polaris-modal-btn-primary'}" data-action="confirm">\${confirmText}</button>
          </div>
        </div>
      \`;

      document.body.appendChild(overlay);

      // Trigger animation
      requestAnimationFrame(() => {
        overlay.classList.add('visible');
      });

      function closeModal(result) {
        overlay.classList.remove('visible');
        setTimeout(() => {
          overlay.remove();
          resolve(result);
        }, 200);
      }

      // Handle button clicks
      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => closeModal(false));
      overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => closeModal(true));

      // Close on overlay click (outside modal)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal(false);
        }
      });

      // Close on Escape key
      function handleEscape(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleEscape);
          closeModal(false);
        }
      }
      document.addEventListener('keydown', handleEscape);

      // Focus the cancel button initially for accessibility
      overlay.querySelector('[data-action="cancel"]').focus();
    });
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
  window.showConfirm = showConfirm;
  window.confirmModal = showConfirm;  // Alias for confirmModal('message', options) syntax
  window.navigateTo = navigateTo;
</script>
`;

export default authHelpersScript;

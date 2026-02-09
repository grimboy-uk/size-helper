import jwt from 'jsonwebtoken';
import { createLogger } from '../utils/logger.js';
import { query } from '../config/database.js';

const logger = createLogger('Auth');

/**
 * Perform token exchange with Shopify
 * Exchanges a session token (JWT) for an offline access token
 * https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange
 */
async function performTokenExchange(shopDomain, sessionToken, sessionStorage) {
  try {
    logger.info('Attempting token exchange for shop:', shopDomain);

    const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: sessionToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('Token exchange failed:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    if (!data.access_token) {
      logger.warn('Token exchange response missing access_token');
      return null;
    }

    logger.info('Token exchange successful for shop:', shopDomain);

    // Create session object
    const session = {
      id: `offline_${shopDomain}`,
      shop: shopDomain,
      state: '',
      isOnline: false,
      accessToken: data.access_token,
      scope: data.scope || process.env.SHOPIFY_SCOPES,
    };

    // Store in session storage
    await sessionStorage.storeSession(session);

    // Also store in database for future recovery
    const cycleStart = new Date();
    const cycleEnd = new Date();
    cycleEnd.setDate(cycleEnd.getDate() + 30);

    await query(
      `INSERT INTO shops (shop_domain, access_token, scope, billing_cycle_start, billing_cycle_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (shop_domain)
       DO UPDATE SET access_token = $2, scope = $3, updated_at = CURRENT_TIMESTAMP`,
      [shopDomain, data.access_token, data.scope || process.env.SHOPIFY_SCOPES, cycleStart, cycleEnd]
    );

    logger.info('Token exchange: session stored in storage and database:', shopDomain);

    return session;
  } catch (error) {
    logger.error('Token exchange error:', error.message);
    return null;
  }
}

/**
 * Middleware to verify Shopify JWT token from App Bridge v4
 * Extracts shop domain and validates the session
 *
 * Session recovery flow:
 * 1. Try to load existing session from session storage
 * 2. If not found, try to recover from database (stored during app installation)
 * 3. If not in database, attempt token exchange to get access token from session token
 * 4. If all recovery fails, return 401 with retry header (App Bridge handles bounce flow)
 */
export function verifyShop(sessionStorage) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        logger.warn('Missing or invalid authorization header');
        // Add retry header so App Bridge can refresh the session
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({ error: 'Authorization header required' });
      }

      const token = authHeader.split(' ')[1];

      if (!token) {
        logger.warn('No token provided in authorization header');
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({ error: 'Token required' });
      }

      // Verify JWT token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.SHOPIFY_API_SECRET, {
          algorithms: ['HS256'],
        });
      } catch (jwtError) {
        logger.warn('JWT verification failed:', jwtError.message);
        // Token invalid or expired - signal App Bridge to retry
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Validate audience
      if (decoded.aud !== process.env.SHOPIFY_API_KEY) {
        logger.warn('Token audience mismatch');
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({ error: 'Invalid token audience' });
      }

      // Validate expiration
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        logger.warn('Token expired');
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({ error: 'Token expired' });
      }

      // Validate not-before
      if (decoded.nbf && decoded.nbf > now) {
        logger.warn('Token not yet valid');
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({ error: 'Token not yet valid' });
      }

      // Extract shop domain from dest or iss claim
      let shopDomain = null;
      if (decoded.dest) {
        const url = new URL(decoded.dest);
        shopDomain = url.host;
      } else if (decoded.iss) {
        const url = new URL(decoded.iss);
        shopDomain = url.host;
      }

      if (!shopDomain) {
        logger.warn('Could not extract shop domain from token');
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({ error: 'Invalid token: no shop domain' });
      }

      // Step 1: Try to load session from session storage
      const sessionId = `offline_${shopDomain}`;
      let session = await sessionStorage.loadSession(sessionId);

      // Step 2: If no session in storage, try to recover from database
      if (!session) {
        logger.info('No session in storage, attempting recovery from database:', shopDomain);
        session = await recoverSessionFromDatabase(shopDomain, sessionStorage);
      }

      // Step 3: If still no session, attempt token exchange
      if (!session) {
        logger.info('No session in database, attempting token exchange:', shopDomain);
        session = await performTokenExchange(shopDomain, token, sessionStorage);
      }

      // Step 4: If still no session after all recovery attempts, signal for retry
      if (!session) {
        logger.warn('No session found for shop after all recovery attempts:', shopDomain);
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({
          error: 'Session not found',
          message: 'Please reinstall the app or refresh the page',
        });
      }

      // Validate session has required fields
      if (!session.accessToken) {
        logger.warn('Session missing access token:', shopDomain);
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({
          error: 'Invalid session',
          message: 'Session is incomplete. Please reinstall the app.',
        });
      }

      // Attach session and shop info to response locals
      res.locals.shopify = {
        session,
        shopDomain,
      };

      logger.debug('Shop verified successfully:', shopDomain);
      next();
    } catch (error) {
      logger.error('Shop verification error:', error);
      res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
      return res.status(500).json({ error: 'Authentication error' });
    }
  };
}

/**
 * Attempt to recover session from database
 * The shops table stores access_token and scope during OAuth callback
 */
async function recoverSessionFromDatabase(shopDomain, sessionStorage) {
  try {
    const result = await query(
      `SELECT access_token, scope FROM shops WHERE shop_domain = $1`,
      [shopDomain]
    );

    if (result.rows.length === 0 || !result.rows[0].access_token) {
      logger.info('No shop record with access token found:', shopDomain);
      return null;
    }

    const shopData = result.rows[0];

    // Reconstruct session object
    const session = {
      id: `offline_${shopDomain}`,
      shop: shopDomain,
      state: '',
      isOnline: false,
      accessToken: shopData.access_token,
      scope: shopData.scope || process.env.SHOPIFY_SCOPES,
    };

    // Store the recovered session back to session storage
    await sessionStorage.storeSession(session);
    logger.info('Session recovered from database and stored:', shopDomain);

    return session;
  } catch (error) {
    logger.error('Failed to recover session from database:', error);
    return null;
  }
}

/**
 * Middleware for document (page) requests that need session validation
 * Unlike verifyShop (for API requests), this redirects to bounce flow instead of returning 401
 *
 * Usage: For admin pages that need to verify the shop has a valid session
 * If no valid session exists, redirects through the OAuth bounce flow
 */
export function verifyShopDocument(sessionStorage) {
  return async (req, res, next) => {
    try {
      // Extract shop from query params (provided by Shopify when loading embedded app)
      const shop = req.query.shop;

      if (!shop) {
        // No shop param - this might be internal navigation via App Bridge
        // App Bridge will handle authentication via XHR requests
        return next();
      }

      // Check if we have a valid session for this shop
      const sessionId = `offline_${shop}`;
      let session = await sessionStorage.loadSession(sessionId);

      // Try database recovery if not in session storage
      if (!session) {
        session = await recoverSessionFromDatabase(shop, sessionStorage);
      }

      // If we have a valid session, continue
      if (session?.accessToken) {
        res.locals.shopify = {
          session,
          shopDomain: shop,
        };
        return next();
      }

      // No valid session - redirect to bounce flow for OAuth
      logger.info('No valid session for document request, redirecting to bounce flow:', shop);
      const host = req.query.host || '';
      const exitIframeUrl = `/auth/exit-iframe?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;
      return res.redirect(exitIframeUrl);
    } catch (error) {
      logger.error('Document verification error:', error);
      // On error, try to continue - App Bridge might handle it
      next();
    }
  };
}

export default verifyShop;

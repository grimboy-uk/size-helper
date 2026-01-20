import jwt from 'jsonwebtoken';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Auth');

/**
 * Middleware to verify Shopify JWT token from App Bridge v4
 * Extracts shop domain and validates the session
 */
export function verifyShop(sessionStorage) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Missing or invalid authorization header');
        return res.status(401).json({ error: 'Authorization header required' });
      }

      const token = authHeader.split(' ')[1];

      if (!token) {
        logger.warn('No token provided in authorization header');
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
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Validate audience
      if (decoded.aud !== process.env.SHOPIFY_API_KEY) {
        logger.warn('Token audience mismatch');
        return res.status(401).json({ error: 'Invalid token audience' });
      }

      // Validate expiration
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        logger.warn('Token expired');
        return res.status(401).json({ error: 'Token expired' });
      }

      // Validate not-before
      if (decoded.nbf && decoded.nbf > now) {
        logger.warn('Token not yet valid');
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
        return res.status(401).json({ error: 'Invalid token: no shop domain' });
      }

      // Load session from storage
      const sessionId = `offline_${shopDomain}`;
      const session = await sessionStorage.loadSession(sessionId);

      if (!session) {
        logger.warn('No session found for shop:', shopDomain);
        return res.status(401).json({ error: 'Session not found' });
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
      return res.status(500).json({ error: 'Authentication error' });
    }
  };
}

export default verifyShop;

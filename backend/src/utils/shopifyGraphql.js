import { createLogger } from './logger.js';
import { getShopifyInstance } from '../services/webhookService.js';
import { performTokenExchange } from '../middleware/verifyShop.js';

const logger = createLogger('ShopifyGraphQL');

/**
 * Make a Shopify GraphQL API request with automatic retry on 401 (stale access token).
 *
 * When a stored access token has been revoked (e.g. after uninstall/reinstall or scope change),
 * Shopify's GraphQL API returns 401. This wrapper detects that, performs a token exchange
 * to get a fresh access token, and retries the request once.
 *
 * @param {object} params
 * @param {object} params.session - The Shopify session with accessToken
 * @param {string} params.query - GraphQL query or mutation string
 * @param {object} [params.variables] - GraphQL variables
 * @param {object} [params.authContext] - Auth context for token exchange retry
 * @param {string} [params.authContext.sessionToken] - JWT session token from App Bridge
 * @param {object} [params.authContext.sessionStorage] - Session storage instance
 * @returns {Promise<object>} The GraphQL response
 */
export async function shopifyGraphqlRequest({ session, query, variables, authContext }) {
  const shopify = getShopifyInstance();
  if (!shopify) {
    throw new Error('Shopify instance not initialized');
  }

  const client = new shopify.api.clients.Graphql({ session });

  try {
    const response = await client.request(query, variables ? { variables } : undefined);
    return response;
  } catch (error) {
    // Check if this is a 401 from Shopify (stale access token)
    const is401 = error.response?.code === 401 ||
      error.message?.includes('401') ||
      error.message?.includes('Unauthorized');

    if (!is401 || !authContext?.sessionToken || !authContext?.sessionStorage) {
      // Not a 401, or no auth context for retry — rethrow
      throw error;
    }

    logger.warn('Shopify API returned 401, attempting token exchange retry for:', session.shop);

    // Perform token exchange to get a fresh access token
    const refreshedSession = await performTokenExchange(
      session.shop,
      authContext.sessionToken,
      authContext.sessionStorage
    );

    if (!refreshedSession) {
      logger.error('Token exchange failed during 401 retry for:', session.shop);
      throw error; // Rethrow original error
    }

    // Update the session object in place so the caller sees the refreshed token
    session.accessToken = refreshedSession.accessToken;
    session.scope = refreshedSession.scope;

    logger.info('Token exchange successful, retrying Shopify API call for:', session.shop);

    // Retry with fresh access token
    const retryClient = new shopify.api.clients.Graphql({ session: refreshedSession });
    return await retryClient.request(query, variables ? { variables } : undefined);
  }
}

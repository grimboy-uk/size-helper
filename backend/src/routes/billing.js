import express from 'express';
import { Session } from '@shopify/shopify-api';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  SUBSCRIPTION_TIERS,
  createSubscription,
  cancelSubscription,
  syncSubscriptionStatus,
  getSubscriptionStatus,
  getAvailableTiers,
} from '../services/billingService.js';
import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('BillingRoute');

/**
 * GET /api/billing/tiers
 * Get available subscription tiers with annual pricing info
 */
router.get(
  '/tiers',
  asyncHandler(async (req, res) => {
    const tiers = getAvailableTiers();
    res.json({ tiers });
  })
);

/**
 * GET /api/billing/current
 * Get current subscription status
 */
router.get(
  '/current',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const status = await getSubscriptionStatus(shopDomain);

    if (!status) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    res.json({ subscription: status });
  })
);

/**
 * POST /api/billing/subscribe
 * Create or change subscription
 */
router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const session = res.locals.shopify.session;
    const { tier, host, isAnnual } = req.body;

    if (!tier || !SUBSCRIPTION_TIERS[tier]) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }

    // Include host parameter for embedded app redirect
    // Ensure URL has protocol prefix
    let appUrl = process.env.SHOPIFY_APP_URL || '';
    if (appUrl && !appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
      appUrl = `https://${appUrl}`;
    }
    const annual = isAnnual === true || isAnnual === 'true';
    const returnUrl = `${appUrl}/billing/callback?shop=${session.shop}&host=${encodeURIComponent(host || '')}`;

    try {
      const authContext = {
          sessionToken: res.locals.shopify.sessionToken,
          sessionStorage: res.locals.shopify.sessionStorage,
        };
      const result = await createSubscription(session, tier, returnUrl, annual, authContext);

      if (result.confirmationUrl) {
        // Paid tier - redirect to Shopify approval
        res.json({
          success: true,
          requiresApproval: true,
          confirmationUrl: result.confirmationUrl,
          trialDays: result.trialDays,
          isAnnual: annual,
        });
      } else {
        // Free tier - immediate success
        res.json({
          success: true,
          requiresApproval: false,
          tier,
        });
      }
    } catch (error) {
      logger.error('Subscription creation failed:', error);
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  })
);

/**
 * POST /api/billing/cancel
 * Cancel subscription (downgrade to free)
 */
router.post(
  '/cancel',
  asyncHandler(async (req, res) => {
    const session = res.locals.shopify.session;

    try {
      const authContext = {
          sessionToken: res.locals.shopify.sessionToken,
          sessionStorage: res.locals.shopify.sessionStorage,
        };
      await cancelSubscription(session, authContext);
      res.json({ success: true, message: 'Subscription cancelled, downgraded to Free tier' });
    } catch (error) {
      logger.error('Subscription cancellation failed:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  })
);

/**
 * GET /billing/callback
 * Callback from Shopify after subscription approval (or decline)
 * (Not under /api - direct page load, unauthenticated)
 *
 * Instead of blindly trusting the charge_id URL param, we recover the shop's
 * session from the DB and call syncSubscriptionStatus to read Shopify's
 * activeSubscriptions — the ground truth for what was actually approved.
 */
export async function billingCallbackHandler(req, res) {
  logger.info('Billing callback received:', req.query);
  const { shop, host } = req.query;

  if (!shop || !/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
    logger.error('Billing callback missing or invalid shop parameter:', shop);
    return res.status(400).send('Missing or invalid parameters');
  }

  const redirectSuccess = () => {
    if (host) {
      res.redirect(`/?shop=${shop}&host=${encodeURIComponent(host)}&billing=success`);
    } else {
      const storeName = shop.replace('.myshopify.com', '');
      res.redirect(`https://admin.shopify.com/store/${storeName}/apps/${process.env.SHOPIFY_API_KEY}/settings?billing=success`);
    }
  };

  const redirectError = () => {
    if (host) {
      res.redirect(`/?shop=${shop}&host=${encodeURIComponent(host)}&billing=error`);
    } else {
      const storeName = shop.replace('.myshopify.com', '');
      res.redirect(`https://admin.shopify.com/store/${storeName}/apps/${process.env.SHOPIFY_API_KEY}/settings?billing=error`);
    }
  };

  try {
    // Recover session from DB (same pattern as verifyShop middleware)
    const result = await query(
      `SELECT access_token, scope FROM shops WHERE shop_domain = $1`,
      [shop]
    );

    if (result.rows.length === 0 || !result.rows[0].access_token) {
      logger.error('No shop record with access token for billing callback:', shop);
      return redirectError();
    }

    const shopData = result.rows[0];
    const session = new Session({
      id: `offline_${shop}`,
      shop,
      state: '',
      isOnline: false,
      accessToken: shopData.access_token,
      scope: shopData.scope || process.env.SHOPIFY_SCOPES,
    });

    // Sync subscription state from Shopify's ground truth
    await syncSubscriptionStatus(session);
    logger.info('Subscription synced from Shopify after billing callback:', shop);
    redirectSuccess();
  } catch (error) {
    logger.error('Billing callback error:', error);
    redirectError();
  }
}

export default router;

import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  SUBSCRIPTION_TIERS,
  createSubscription,
  confirmSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  getAvailableTiers,
} from '../services/billingService.js';
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
    const returnUrl = `${appUrl}/billing/callback?shop=${session.shop}&tier=${tier}&host=${encodeURIComponent(host || '')}&annual=${annual}`;

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
 * Callback from Shopify after subscription approval
 * (Not under /api - direct page load)
 */
export function billingCallbackHandler(req, res) {
  logger.info('Billing callback received:', req.query);
  const { shop, tier, charge_id, host, annual } = req.query;

  if (!shop || !tier) {
    logger.error('Billing callback missing parameters:', { shop, tier });
    return res.status(400).send('Missing parameters');
  }

  const isAnnual = annual === 'true';
  logger.info('Processing billing callback:', { shop, tier, charge_id, isAnnual });

  // Confirm the subscription
  confirmSubscription(shop, tier, charge_id, isAnnual)
    .then(() => {
      logger.info('Subscription confirmed successfully:', { shop, tier });
      // Redirect back to app
      // If host is provided, use it; otherwise redirect to Shopify admin embedded app URL
      if (host) {
        res.redirect(`/?shop=${shop}&host=${encodeURIComponent(host)}&billing=success`);
      } else {
        // Construct Shopify admin URL for embedded app
        // Shop format: mystore.myshopify.com -> admin URL: admin.shopify.com/store/mystore
        const storeName = shop.replace('.myshopify.com', '');
        const embeddedUrl = `https://admin.shopify.com/store/${storeName}/apps/${process.env.SHOPIFY_API_KEY}/settings?billing=success`;
        res.redirect(embeddedUrl);
      }
    })
    .catch((error) => {
      logger.error('Billing callback error:', error);
      if (host) {
        res.redirect(`/?shop=${shop}&host=${encodeURIComponent(host)}&billing=error`);
      } else {
        const storeName = shop.replace('.myshopify.com', '');
        const embeddedUrl = `https://admin.shopify.com/store/${storeName}/apps/${process.env.SHOPIFY_API_KEY}/settings?billing=error`;
        res.redirect(embeddedUrl);
      }
    });
}

export default router;

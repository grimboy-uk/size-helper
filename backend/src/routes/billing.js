import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  SUBSCRIPTION_TIERS,
  createSubscription,
  confirmSubscription,
  cancelSubscription,
  getSubscriptionStatus,
} from '../services/billingService.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('BillingRoute');

/**
 * GET /api/billing/tiers
 * Get available subscription tiers
 */
router.get(
  '/tiers',
  asyncHandler(async (req, res) => {
    const tiers = Object.entries(SUBSCRIPTION_TIERS).map(([key, tier]) => ({
      key,
      ...tier,
      // Include both limit types for display
      productTypeLimit: tier.sizeChartLimit, // Legacy compatibility
    }));
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
    const { tier, host } = req.body;

    if (!tier || !SUBSCRIPTION_TIERS[tier]) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }

    // Include host parameter for embedded app redirect
    const returnUrl = `${process.env.SHOPIFY_APP_URL}/billing/callback?shop=${session.shop}&tier=${tier}&host=${encodeURIComponent(host || '')}`;

    try {
      const result = await createSubscription(session, tier, returnUrl);

      if (result.confirmationUrl) {
        // Paid tier - redirect to Shopify approval
        res.json({
          success: true,
          requiresApproval: true,
          confirmationUrl: result.confirmationUrl,
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
      await cancelSubscription(session);
      res.json({ success: true, message: 'Subscription cancelled, downgraded to Startup tier' });
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
  const { shop, tier, charge_id, host } = req.query;

  if (!shop || !tier) {
    return res.status(400).send('Missing parameters');
  }

  // Confirm the subscription
  confirmSubscription(shop, tier, charge_id)
    .then(() => {
      // Redirect back to app with host parameter for embedded apps
      const hostParam = host ? `&host=${encodeURIComponent(host)}` : '';
      res.redirect(`/?shop=${shop}${hostParam}&billing=success`);
    })
    .catch((error) => {
      logger.error('Billing callback error:', error);
      const hostParam = host ? `&host=${encodeURIComponent(host)}` : '';
      res.redirect(`/?shop=${shop}${hostParam}&billing=error`);
    });
}

export default router;

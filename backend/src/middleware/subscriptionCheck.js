import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';
import { SUBSCRIPTION_TIERS } from '../services/billingService.js';

const logger = createLogger('Subscription');

/**
 * Middleware to check subscription status and limits
 * Attaches subscription info to req.subscriptionInfo
 */
export function subscriptionCheck(options = {}) {
  const { enforceLimit = false } = options;

  return async (req, res, next) => {
    try {
      const shopDomain = res.locals.shopify?.shopDomain;

      if (!shopDomain) {
        return res.status(401).json({ error: 'Shop not authenticated' });
      }

      // Get shop subscription info
      const result = await query(
        `SELECT subscription_tier, product_type_count, billing_cycle_start, billing_cycle_end
         FROM shops WHERE shop_domain = $1`,
        [shopDomain]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Shop not found' });
      }

      const shop = result.rows[0];
      const tier = SUBSCRIPTION_TIERS[shop.subscription_tier] || SUBSCRIPTION_TIERS.STARTUP;

      // Check if billing cycle needs reset
      const now = new Date();
      const cycleEnd = new Date(shop.billing_cycle_end);

      if (cycleEnd < now) {
        // Reset billing cycle
        const newCycleStart = new Date();
        const newCycleEnd = new Date();
        newCycleEnd.setDate(newCycleEnd.getDate() + 30);

        await query(
          `UPDATE shops SET billing_cycle_start = $1, billing_cycle_end = $2 WHERE shop_domain = $3`,
          [newCycleStart, newCycleEnd, shopDomain]
        );

        logger.info('Billing cycle reset for shop:', shopDomain);
      }

      // Get current product type count
      const countResult = await query(
        `SELECT COUNT(*) as count FROM size_templates WHERE shop_domain = $1 AND is_active = true`,
        [shopDomain]
      );
      const productTypeCount = parseInt(countResult.rows[0].count, 10);

      // Attach subscription info
      req.subscriptionInfo = {
        tier: shop.subscription_tier,
        tierName: tier.name,
        productTypeLimit: tier.productTypeLimit,
        productTypeCount,
        canCreateMore: productTypeCount < tier.productTypeLimit,
        remainingSlots: tier.productTypeLimit - productTypeCount,
      };

      // Optionally enforce limit
      if (enforceLimit && !req.subscriptionInfo.canCreateMore) {
        return res.status(403).json({
          error: 'Product type limit reached',
          message: `Your ${tier.name} plan allows up to ${tier.productTypeLimit} product types. Please upgrade to add more.`,
          currentCount: productTypeCount,
          limit: tier.productTypeLimit,
        });
      }

      next();
    } catch (error) {
      logger.error('Subscription check error:', error);
      return res.status(500).json({ error: 'Failed to check subscription status' });
    }
  };
}

export default subscriptionCheck;

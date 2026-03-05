import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';
import { SUBSCRIPTION_TIERS } from '../services/billingService.js';

const logger = createLogger('Subscription');

/**
 * Middleware to check subscription status and limits
 * Attaches subscription info to req.subscriptionInfo
 *
 * Options:
 * - enforceLimit: If true, blocks creation when size chart limit is reached
 * - enforceSizeHelperLimit: If true, blocks creation when size helper limit is reached
 * - checkSizeHelper: If true, check if the request is trying to create a size helper template
 */
export function subscriptionCheck(options = {}) {
  const { enforceLimit = false, enforceSizeHelperLimit = false } = options;

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
      const tier = SUBSCRIPTION_TIERS[shop.subscription_tier] || SUBSCRIPTION_TIERS.FREE;

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

      // Get counts for both template types
      const countResult = await query(
        `SELECT
           COUNT(*) FILTER (WHERE is_active = true) as total_count,
           COUNT(*) FILTER (WHERE is_active = true AND include_size_helper = true) as size_helper_count
         FROM size_templates WHERE shop_domain = $1`,
        [shopDomain]
      );

      const counts = countResult.rows[0];
      const sizeChartCount = Number.parseInt(counts.total_count, 10);
      const sizeHelperCount = Number.parseInt(counts.size_helper_count, 10);

      // Attach subscription info
      // A limit of 0 means unlimited
      req.subscriptionInfo = {
        tier: shop.subscription_tier,
        tierName: tier.name,
        // Size chart limits (total templates)
        sizeChartLimit: tier.sizeChartLimit,
        sizeChartCount,
        canCreateSizeChart: tier.sizeChartLimit === 0 || sizeChartCount < tier.sizeChartLimit,
        sizeChartRemaining: tier.sizeChartLimit === 0 ? null : tier.sizeChartLimit - sizeChartCount,
        // Size helper limits (templates with size helper enabled)
        sizeHelperLimit: tier.sizeHelperLimit,
        sizeHelperCount,
        canCreateSizeHelper: tier.sizeHelperLimit === 0 || sizeHelperCount < tier.sizeHelperLimit,
        sizeHelperRemaining: tier.sizeHelperLimit === 0 ? null : tier.sizeHelperLimit - sizeHelperCount,
        // Feature flags
        showBranding: tier.showBranding,
        detailedAnalytics: tier.detailedAnalytics,
        customButtonColor: tier.customButtonColor,
        recommendationLimit: tier.recommendationLimit,
        // Legacy fields for backwards compatibility
        productTypeLimit: tier.sizeChartLimit,
        productTypeCount: sizeChartCount,
        canCreateMore: tier.sizeChartLimit === 0 || sizeChartCount < tier.sizeChartLimit,
        remainingSlots: tier.sizeChartLimit === 0 ? null : tier.sizeChartLimit - sizeChartCount,
      };

      // Optionally enforce size chart limit
      if (enforceLimit && !req.subscriptionInfo.canCreateSizeChart) {
        return res.status(403).json({
          error: 'Size chart limit reached',
          message: `Your ${tier.name} plan allows up to ${tier.sizeChartLimit} size charts. Please upgrade to add more.`,
          currentCount: sizeChartCount,
          limit: tier.sizeChartLimit,
        });
      }

      // Optionally enforce size helper limit
      if (enforceSizeHelperLimit) {
        const requestIncludesSizeHelper = req.body?.includeSizeHelper === true;
        if (requestIncludesSizeHelper && !req.subscriptionInfo.canCreateSizeHelper) {
          return res.status(403).json({
            error: 'Size helper limit reached',
            message: `Your ${tier.name} plan allows up to ${tier.sizeHelperLimit} templates with Size Helper. Please upgrade or create a Size Chart Only template.`,
            currentCount: sizeHelperCount,
            limit: tier.sizeHelperLimit,
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Subscription check error:', error);
      return res.status(500).json({ error: 'Failed to check subscription status' });
    }
  };
}

export default subscriptionCheck;

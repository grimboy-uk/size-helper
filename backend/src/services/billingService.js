import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';
import { getShopifyInstance } from './webhookService.js';

const logger = createLogger('Billing');

/**
 * Subscription tier definitions
 * - sizeChartLimit: Number of "Size Chart Only" templates allowed
 * - sizeHelperLimit: Number of "Size Chart + Size Helper" templates allowed
 * - recommendationLimit: Monthly size recommendation limit (0 = unlimited)
 * - showBranding: Whether "Powered by RMS" branding is shown
 * - detailedAnalytics: Whether per-product analytics breakdown is available
 * - customButtonColor: Whether button colour customization is available
 */
export const SUBSCRIPTION_TIERS = {
  STARTUP: {
    name: 'Startup',
    price: 0,
    sizeChartLimit: 5,
    sizeHelperLimit: 2,
    recommendationLimit: 100,
    showBranding: true,
    detailedAnalytics: false,
    customButtonColor: false,
    description: 'Free tier - Perfect for getting started',
    features: [
      'Up to 5 size charts',
      '2 with Size Helper',
      '100 recommendations/month',
      'Basic analytics (totals only)',
      'Default button styling',
      'RMS branding shown',
    ],
  },
  MICRO_ENTERPRISE: {
    name: 'Micro Enterprise',
    price: 10,
    sizeChartLimit: 10,
    sizeHelperLimit: 7,
    recommendationLimit: 0,
    showBranding: false,
    detailedAnalytics: true,
    customButtonColor: true,
    description: 'For growing stores with more products',
    features: [
      'Up to 10 size charts',
      '7 with Size Helper',
      'Unlimited recommendations',
      'Per-product analytics',
      'Custom button colours',
      'No RMS branding',
    ],
  },
  SMALL_BUSINESS: {
    name: 'Small Business',
    price: 20,
    sizeChartLimit: 30,
    sizeHelperLimit: 20,
    recommendationLimit: 0,
    showBranding: false,
    detailedAnalytics: true,
    customButtonColor: true,
    description: 'For established stores with large catalogs',
    features: [
      'Up to 30 size charts',
      '20 with Size Helper',
      'Unlimited recommendations',
      'Per-product analytics',
      'Custom button colours',
      'No RMS branding',
    ],
  },
};

/**
 * Create a subscription using Shopify Billing API
 */
export async function createSubscription(session, tierKey, returnUrl) {
  const tier = SUBSCRIPTION_TIERS[tierKey];

  if (!tier) {
    throw new Error('Invalid subscription tier');
  }

  if (tier.price === 0) {
    // Free tier - just update the database
    await query(
      `UPDATE shops SET subscription_tier = $1, subscription_id = NULL WHERE shop_domain = $2`,
      [tierKey, session.shop]
    );
    return { success: true, tier: tierKey, confirmationUrl: null };
  }

  // Create paid subscription via Shopify GraphQL
  const shopify = getShopifyInstance();
  if (!shopify) {
    logger.error('Shopify instance not initialized');
    throw new Error('Shopify instance not initialized');
  }
  logger.info('Creating subscription for tier:', tierKey, 'shop:', session.shop);
  const client = new shopify.api.clients.Graphql({ session });

  const mutation = `
    mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        test: ${process.env.NODE_ENV !== 'production'}
      ) {
        appSubscription {
          id
          status
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    name: `Size Helper - ${tier.name}`,
    returnUrl,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: tier.price,
              currencyCode: 'USD',
            },
            interval: 'EVERY_30_DAYS',
          },
        },
      },
    ],
  };

  try {
    const response = await client.request(mutation, { variables });

    const { appSubscriptionCreate } = response.data;

    if (appSubscriptionCreate.userErrors.length > 0) {
      logger.error('Subscription creation errors:', appSubscriptionCreate.userErrors);
      throw new Error(appSubscriptionCreate.userErrors[0].message);
    }

    return {
      success: true,
      tier: tierKey,
      subscriptionId: appSubscriptionCreate.appSubscription.id,
      confirmationUrl: appSubscriptionCreate.confirmationUrl,
    };
  } catch (error) {
    logger.error('Failed to create subscription:', error.message);
    logger.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    throw error;
  }
}

/**
 * Confirm subscription after merchant approval
 */
export async function confirmSubscription(shopDomain, tierKey, chargeId) {
  try {
    const cycleStart = new Date();
    const cycleEnd = new Date();
    cycleEnd.setDate(cycleEnd.getDate() + 30);

    // Convert charge_id to proper GID format for Shopify GraphQL API
    const subscriptionGid = chargeId ? `gid://shopify/AppSubscription/${chargeId}` : null;

    await query(
      `UPDATE shops
       SET subscription_tier = $1,
           subscription_id = $2,
           billing_cycle_start = $3,
           billing_cycle_end = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE shop_domain = $5`,
      [tierKey, subscriptionGid, cycleStart, cycleEnd, shopDomain]
    );

    logger.info('Subscription confirmed:', { shopDomain, tier: tierKey, subscriptionGid });
    return { success: true };
  } catch (error) {
    logger.error('Failed to confirm subscription:', error);
    throw error;
  }
}

/**
 * Cancel subscription (downgrade to free tier)
 */
export async function cancelSubscription(session) {
  try {
    // Get current subscription ID
    const result = await query(
      `SELECT subscription_id FROM shops WHERE shop_domain = $1`,
      [session.shop]
    );

    if (result.rows.length === 0) {
      throw new Error('Shop not found');
    }

    const subscriptionId = result.rows[0].subscription_id;
    logger.info('Cancelling subscription:', { shop: session.shop, subscriptionId });

    if (subscriptionId) {
      // Cancel via Shopify GraphQL
      const shopify = getShopifyInstance();
      if (!shopify) {
        logger.error('Shopify instance not initialized');
        throw new Error('Shopify instance not initialized');
      }

      const client = new shopify.api.clients.Graphql({ session });

      const mutation = `
        mutation AppSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            appSubscription {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      try {
        const response = await client.request(mutation, {
          variables: { id: subscriptionId },
        });

        const { appSubscriptionCancel } = response.data;
        if (appSubscriptionCancel?.userErrors?.length > 0) {
          logger.error('Subscription cancellation errors:', appSubscriptionCancel.userErrors);
          // Don't throw - still update database to downgrade locally
        } else {
          logger.info('Shopify subscription cancelled:', appSubscriptionCancel?.appSubscription);
        }
      } catch (shopifyError) {
        logger.error('Shopify API error during cancellation:', shopifyError.message);
        // Don't throw - still update database to downgrade locally
        // The subscription might already be cancelled or invalid
      }
    }

    // Update database to free tier
    await query(
      `UPDATE shops
       SET subscription_tier = 'STARTUP',
           subscription_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE shop_domain = $1`,
      [session.shop]
    );

    logger.info('Subscription cancelled successfully:', session.shop);
    return { success: true };
  } catch (error) {
    logger.error('Failed to cancel subscription:', error);
    throw error;
  }
}

/**
 * Get monthly recommendation count for a shop
 */
export async function getMonthlyRecommendationCount(shopDomain) {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startDateStr = startOfMonth.toISOString().split('T')[0];

    const result = await query(
      `SELECT COALESCE(SUM(count), 0) as total
       FROM analytics
       WHERE shop_domain = $1 AND event_type = 'recommendation_made' AND event_date >= $2`,
      [shopDomain, startDateStr]
    );

    return Number.parseInt(result.rows[0].total, 10);
  } catch (error) {
    logger.error('Failed to get monthly recommendation count:', error);
    return 0;
  }
}

/**
 * Check if shop can make more recommendations this month
 */
export async function canMakeRecommendation(shopDomain) {
  try {
    const result = await query(
      `SELECT subscription_tier FROM shops WHERE shop_domain = $1`,
      [shopDomain]
    );

    if (result.rows.length === 0) {
      return { allowed: false, reason: 'Shop not found' };
    }

    const tier = SUBSCRIPTION_TIERS[result.rows[0].subscription_tier] || SUBSCRIPTION_TIERS.STARTUP;

    // Unlimited recommendations for paid tiers (limit = 0)
    if (tier.recommendationLimit === 0) {
      return { allowed: true };
    }

    const count = await getMonthlyRecommendationCount(shopDomain);

    if (count >= tier.recommendationLimit) {
      return {
        allowed: false,
        reason: 'Monthly recommendation limit reached',
        count,
        limit: tier.recommendationLimit,
      };
    }

    return {
      allowed: true,
      count,
      limit: tier.recommendationLimit,
      remaining: tier.recommendationLimit - count,
    };
  } catch (error) {
    logger.error('Failed to check recommendation limit:', error);
    // Allow on error to not break the user experience
    return { allowed: true };
  }
}

/**
 * Get current subscription status for a shop
 */
export async function getSubscriptionStatus(shopDomain) {
  try {
    const result = await query(
      `SELECT subscription_tier, subscription_id, billing_cycle_start, billing_cycle_end
       FROM shops WHERE shop_domain = $1`,
      [shopDomain]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const shop = result.rows[0];
    const tier = SUBSCRIPTION_TIERS[shop.subscription_tier] || SUBSCRIPTION_TIERS.STARTUP;

    // Get counts for both template types
    const countResult = await query(
      `SELECT
         COUNT(*) FILTER (WHERE is_active = true) as total_count,
         COUNT(*) FILTER (WHERE is_active = true AND include_size_helper = true) as size_helper_count,
         COUNT(*) FILTER (WHERE is_active = true AND include_size_helper = false) as size_chart_only_count
       FROM size_templates WHERE shop_domain = $1`,
      [shopDomain]
    );

    const counts = countResult.rows[0];
    const sizeChartCount = Number.parseInt(counts.total_count, 10);
    const sizeHelperCount = Number.parseInt(counts.size_helper_count, 10);

    // Get monthly recommendation count
    const recommendationCount = await getMonthlyRecommendationCount(shopDomain);

    return {
      tier: shop.subscription_tier,
      tierName: tier.name,
      price: tier.price,
      // Size chart limits (total templates)
      sizeChartLimit: tier.sizeChartLimit,
      sizeChartCount,
      sizeChartRemaining: tier.sizeChartLimit - sizeChartCount,
      // Size helper limits (templates with size helper enabled)
      sizeHelperLimit: tier.sizeHelperLimit,
      sizeHelperCount,
      sizeHelperRemaining: tier.sizeHelperLimit - sizeHelperCount,
      // Recommendation limits
      recommendationLimit: tier.recommendationLimit,
      recommendationCount,
      recommendationRemaining: tier.recommendationLimit === 0 ? null : tier.recommendationLimit - recommendationCount,
      // Feature flags
      showBranding: tier.showBranding,
      detailedAnalytics: tier.detailedAnalytics,
      customButtonColor: tier.customButtonColor,
      // Legacy field for backwards compatibility
      productTypeLimit: tier.sizeChartLimit,
      productTypeCount: sizeChartCount,
      remainingSlots: tier.sizeChartLimit - sizeChartCount,
      billingCycleStart: shop.billing_cycle_start,
      billingCycleEnd: shop.billing_cycle_end,
    };
  } catch (error) {
    logger.error('Failed to get subscription status:', error);
    throw error;
  }
}

export default {
  SUBSCRIPTION_TIERS,
  createSubscription,
  confirmSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  getMonthlyRecommendationCount,
  canMakeRecommendation,
};

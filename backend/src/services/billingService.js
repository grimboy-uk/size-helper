import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';
import { getShopifyInstance } from './webhookService.js';

const logger = createLogger('Billing');

// Configurable trial period (days) - can be overridden via environment variable
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || '7', 10);

// Annual discount percentage
const ANNUAL_DISCOUNT_PERCENT = 20;

/**
 * Subscription tier definitions
 * - sizeChartLimit: Number of size chart templates allowed (0 = unlimited)
 * - sizeHelperLimit: Number of templates with Size Helper enabled (0 = unlimited)
 * - recommendationLimit: Monthly size recommendation limit (0 = unlimited)
 * - analyticsRetentionDays: How long analytics data is retained (0 = unlimited)
 * - showBranding: Whether "Powered by RMS" branding is shown
 * - detailedAnalytics: Whether per-product analytics breakdown is available
 * - customButtonColor: Whether button colour customization is available
 * - prioritySupport: Whether priority support is included
 * - apiAccess: Whether API access is available
 */
export const SUBSCRIPTION_TIERS = {
  FREE: {
    name: 'Free',
    price: 0,
    annualPrice: 0,
    sizeChartLimit: 3,
    sizeHelperLimit: 1,
    recommendationLimit: 50,
    analyticsRetentionDays: 30,
    showBranding: true,
    detailedAnalytics: false,
    customButtonColor: false,
    prioritySupport: false,
    apiAccess: false,
    trialDays: 0,
    description: 'Perfect for getting started',
    features: [
      'Up to 3 size charts',
      '1 with Size Helper',
      '50 recommendations/month',
      '30-day analytics',
      'Default button styling',
      'RMS branding shown',
    ],
  },
  GROWTH: {
    name: 'Growth',
    price: 9,
    annualPrice: 86, // ~20% off ($108 -> $86)
    sizeChartLimit: 15,
    sizeHelperLimit: 10,
    recommendationLimit: 500,
    analyticsRetentionDays: 90,
    showBranding: false,
    detailedAnalytics: true,
    customButtonColor: true,
    prioritySupport: false,
    apiAccess: false,
    trialDays: TRIAL_DAYS,
    description: 'For growing stores',
    features: [
      'Up to 15 size charts',
      '10 with Size Helper',
      '500 recommendations/month',
      '90-day analytics',
      'Per-product analytics',
      'Custom button colours',
      'No RMS branding',
    ],
  },
  PROFESSIONAL: {
    name: 'Professional',
    price: 19,
    annualPrice: 182, // ~20% off ($228 -> $182)
    sizeChartLimit: 50,
    sizeHelperLimit: 35,
    recommendationLimit: 0, // Unlimited
    analyticsRetentionDays: 365,
    showBranding: false,
    detailedAnalytics: true,
    customButtonColor: true,
    prioritySupport: true,
    apiAccess: false,
    trialDays: TRIAL_DAYS,
    description: 'For established stores',
    features: [
      'Up to 50 size charts',
      '35 with Size Helper',
      'Unlimited recommendations',
      '1-year analytics',
      'Per-product analytics',
      'Custom button colours',
      'Priority support',
      'No RMS branding',
    ],
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 49,
    annualPrice: 470, // ~20% off ($588 -> $470)
    sizeChartLimit: 0, // Unlimited
    sizeHelperLimit: 0, // Unlimited
    recommendationLimit: 0, // Unlimited
    analyticsRetentionDays: 0, // Unlimited
    showBranding: false,
    detailedAnalytics: true,
    customButtonColor: true,
    prioritySupport: true,
    apiAccess: true,
    trialDays: TRIAL_DAYS,
    description: 'For high-volume stores',
    features: [
      'Unlimited size charts',
      'Unlimited Size Helpers',
      'Unlimited recommendations',
      'Unlimited analytics retention',
      'Per-product analytics',
      'Custom button colours',
      'Priority support',
      'API access',
      'No RMS branding',
    ],
  },
};

// Legacy tier mappings for backwards compatibility
const LEGACY_TIER_MAP = {
  STARTUP: 'FREE',
  MICRO_ENTERPRISE: 'GROWTH',
  SMALL_BUSINESS: 'PROFESSIONAL',
};

/**
 * Get the actual tier key, handling legacy tier names
 */
function normalizeTierKey(tierKey) {
  return LEGACY_TIER_MAP[tierKey] || tierKey;
}

/**
 * Get tier configuration, handling legacy tier names
 */
function getTierConfig(tierKey) {
  const normalizedKey = normalizeTierKey(tierKey);
  return SUBSCRIPTION_TIERS[normalizedKey] || SUBSCRIPTION_TIERS.FREE;
}

/**
 * Create a subscription using Shopify Billing API
 * @param {Object} session - Shopify session
 * @param {string} tierKey - Tier key (FREE, GROWTH, PROFESSIONAL, ENTERPRISE)
 * @param {string} returnUrl - URL to return to after approval
 * @param {boolean} isAnnual - Whether to create an annual subscription
 */
export async function createSubscription(session, tierKey, returnUrl, isAnnual = false) {
  const tier = SUBSCRIPTION_TIERS[tierKey];

  if (!tier) {
    throw new Error('Invalid subscription tier');
  }

  if (tier.price === 0) {
    // Free tier - just update the database
    await query(
      `UPDATE shops SET subscription_tier = $1, subscription_id = NULL, billing_interval = 'MONTHLY' WHERE shop_domain = $2`,
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

  logger.info('Creating subscription for tier:', tierKey, 'shop:', session.shop, 'annual:', isAnnual);
  logger.info('Creating GraphQL client with session:', { shop: session.shop, hasAccessToken: !!session.accessToken });
  const client = new shopify.api.clients.Graphql({ session });
  logger.info('GraphQL client created successfully');

  // Calculate price and interval
  const price = isAnnual ? tier.annualPrice : tier.price;
  const interval = isAnnual ? 'ANNUAL' : 'EVERY_30_DAYS';
  logger.info('Price and interval calculated:', { price, interval });

  // Check if shop has already used a trial (prevent trial abuse on reinstall)
  let trialDays = tier.trialDays || 0;
  logger.info('Initial trial days:', trialDays);
  if (trialDays > 0) {
    try {
      logger.info('Checking if shop has already used trial...');
      const trialCheck = await query(
        `SELECT trial_used_at FROM shops WHERE shop_domain = $1`,
        [session.shop]
      );
      logger.info('Trial check result:', trialCheck.rows);
      if (trialCheck.rows.length > 0 && trialCheck.rows[0].trial_used_at) {
        logger.info('Shop has already used trial, skipping trial days:', session.shop);
        trialDays = 0;
      }
    } catch (trialError) {
      // Column might not exist in older databases - continue without trial check
      logger.warn('Trial check failed (column may not exist):', trialError.message);
    }
  }

  // Test charges only work on development stores
  // Use SHOPIFY_DEV_STORE=true to enable test charges when testing on dev stores
  // In production with real stores, set SHOPIFY_DEV_STORE=false or leave unset
  const isTestCharge = process.env.SHOPIFY_DEV_STORE === 'true' || process.env.NODE_ENV !== 'production';
  logger.info('Billing config:', {
    isTestCharge,
    SHOPIFY_DEV_STORE: process.env.SHOPIFY_DEV_STORE,
    NODE_ENV: process.env.NODE_ENV,
    price,
    interval,
    trialDays,
  });

  // Build the mutation with optional trial days
  const mutation = `
    mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!${trialDays > 0 ? ', $trialDays: Int!' : ''}) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        ${trialDays > 0 ? 'trialDays: $trialDays' : ''}
        test: ${isTestCharge}
      ) {
        appSubscription {
          id
          status
          trialDays
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
    name: `Size Helper - ${tier.name}${isAnnual ? ' (Annual)' : ''}`,
    returnUrl,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: price,
              currencyCode: 'USD',
            },
            interval,
          },
        },
      },
    ],
  };

  if (trialDays > 0) {
    variables.trialDays = trialDays;
  }

  logger.info('Subscription mutation variables:', JSON.stringify(variables, null, 2));
  logger.info('Subscription mutation:', mutation);
  logger.info('About to call Shopify GraphQL API...');

  try {
    const response = await client.request(mutation, { variables });
    logger.info('Shopify GraphQL API call completed');
    logger.info('Subscription API response:', JSON.stringify(response, null, 2));

    const { appSubscriptionCreate } = response.data;

    if (appSubscriptionCreate.userErrors.length > 0) {
      logger.error('Subscription creation errors:', appSubscriptionCreate.userErrors);
      throw new Error(appSubscriptionCreate.userErrors[0].message);
    }

    const subscriptionId = appSubscriptionCreate.appSubscription.id;
    // Extract the numeric charge ID from the GID for the callback URL
    const chargeId = subscriptionId.split('/').pop();

    // For test charges on dev stores, the approve button is greyed out and no redirect happens
    // Auto-confirm the subscription immediately after successful API response
    if (isTestCharge) {
      logger.info('Test charge detected - auto-confirming subscription');
      await confirmSubscription(session.shop, tierKey, chargeId, isAnnual);
      return {
        success: true,
        tier: tierKey,
        subscriptionId,
        confirmationUrl: null, // No redirect needed for test charges
        trialDays: appSubscriptionCreate.appSubscription.trialDays,
        isAnnual,
        autoConfirmed: true,
      };
    }

    return {
      success: true,
      tier: tierKey,
      subscriptionId,
      confirmationUrl: appSubscriptionCreate.confirmationUrl,
      trialDays: appSubscriptionCreate.appSubscription.trialDays,
      isAnnual,
    };
  } catch (error) {
    logger.error('Failed to create subscription:', error.message);
    logger.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    throw error;
  }
}

/**
 * Confirm subscription after merchant approval
 * Also marks trial as used if this is the first paid subscription (prevents trial abuse on reinstall)
 */
export async function confirmSubscription(shopDomain, tierKey, chargeId, isAnnual = false) {
  logger.info('confirmSubscription called:', { shopDomain, tierKey, chargeId, isAnnual });
  try {
    const cycleStart = new Date();
    const cycleEnd = new Date();
    // Set cycle end based on billing interval
    if (isAnnual) {
      cycleEnd.setFullYear(cycleEnd.getFullYear() + 1);
    } else {
      cycleEnd.setDate(cycleEnd.getDate() + 30);
    }

    // Convert charge_id to proper GID format for Shopify GraphQL API
    const subscriptionGid = chargeId ? `gid://shopify/AppSubscription/${chargeId}` : null;
    logger.info('Updating database with:', { tierKey, subscriptionGid, cycleStart, cycleEnd, isAnnual, shopDomain });

    // Mark trial as used if this is a paid tier (prevents trial abuse on reinstall)
    // Only set trial_used_at if it's not already set
    const result = await query(
      `UPDATE shops
       SET subscription_tier = $1,
           subscription_id = $2,
           billing_cycle_start = $3,
           billing_cycle_end = $4,
           billing_interval = $5,
           trial_used_at = COALESCE(trial_used_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE shop_domain = $6
       RETURNING *`,
      [tierKey, subscriptionGid, cycleStart, cycleEnd, isAnnual ? 'ANNUAL' : 'MONTHLY', shopDomain]
    );

    logger.info('Database update result:', { rowCount: result.rowCount, rows: result.rows });
    logger.info('Subscription confirmed:', { shopDomain, tier: tierKey, subscriptionGid, isAnnual });
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
       SET subscription_tier = 'FREE',
           subscription_id = NULL,
           billing_interval = 'MONTHLY',
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

    const tier = getTierConfig(result.rows[0].subscription_tier);

    // Unlimited recommendations (limit = 0)
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
      `SELECT subscription_tier, subscription_id, billing_cycle_start, billing_cycle_end, billing_interval, trial_used_at
       FROM shops WHERE shop_domain = $1`,
      [shopDomain]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const shop = result.rows[0];
    const normalizedTierKey = normalizeTierKey(shop.subscription_tier);
    const tier = getTierConfig(shop.subscription_tier);

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

    // Calculate limits (0 means unlimited)
    const sizeChartLimit = tier.sizeChartLimit || Infinity;
    const sizeHelperLimit = tier.sizeHelperLimit || Infinity;

    return {
      tier: normalizedTierKey,
      tierName: tier.name,
      price: tier.price,
      annualPrice: tier.annualPrice,
      billingInterval: shop.billing_interval || 'MONTHLY',
      // Size chart limits (total templates)
      sizeChartLimit: tier.sizeChartLimit,
      sizeChartCount,
      sizeChartRemaining: tier.sizeChartLimit === 0 ? null : Math.max(0, sizeChartLimit - sizeChartCount),
      canCreateSizeChart: tier.sizeChartLimit === 0 || sizeChartCount < sizeChartLimit,
      // Size helper limits (templates with size helper enabled)
      sizeHelperLimit: tier.sizeHelperLimit,
      sizeHelperCount,
      sizeHelperRemaining: tier.sizeHelperLimit === 0 ? null : Math.max(0, sizeHelperLimit - sizeHelperCount),
      canCreateSizeHelper: tier.sizeHelperLimit === 0 || sizeHelperCount < sizeHelperLimit,
      // Recommendation limits
      recommendationLimit: tier.recommendationLimit,
      recommendationCount,
      recommendationRemaining: tier.recommendationLimit === 0 ? null : tier.recommendationLimit - recommendationCount,
      // Feature flags
      showBranding: tier.showBranding,
      detailedAnalytics: tier.detailedAnalytics,
      customButtonColor: tier.customButtonColor,
      prioritySupport: tier.prioritySupport,
      apiAccess: tier.apiAccess,
      analyticsRetentionDays: tier.analyticsRetentionDays,
      trialDays: tier.trialDays,
      // Trial status (for UI display)
      trialUsed: !!shop.trial_used_at,
      trialUsedAt: shop.trial_used_at,
      // Legacy fields for backwards compatibility
      productTypeLimit: tier.sizeChartLimit,
      productTypeCount: sizeChartCount,
      remainingSlots: tier.sizeChartLimit === 0 ? null : Math.max(0, sizeChartLimit - sizeChartCount),
      canCreateMore: tier.sizeChartLimit === 0 || sizeChartCount < sizeChartLimit,
      billingCycleStart: shop.billing_cycle_start,
      billingCycleEnd: shop.billing_cycle_end,
    };
  } catch (error) {
    logger.error('Failed to get subscription status:', error);
    throw error;
  }
}

/**
 * Get all available tiers for display
 */
export function getAvailableTiers() {
  return Object.entries(SUBSCRIPTION_TIERS).map(([key, tier]) => ({
    key,
    ...tier,
    annualSavings: tier.price > 0 ? Math.round((tier.price * 12 - tier.annualPrice) / (tier.price * 12) * 100) : 0,
    monthlyEquivalent: tier.annualPrice > 0 ? (tier.annualPrice / 12).toFixed(2) : 0,
  }));
}

export default {
  SUBSCRIPTION_TIERS,
  TRIAL_DAYS,
  ANNUAL_DISCOUNT_PERCENT,
  createSubscription,
  confirmSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  getMonthlyRecommendationCount,
  canMakeRecommendation,
  getAvailableTiers,
};

import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';
import { shopifyGraphqlRequest } from '../utils/shopifyGraphql.js';

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
export async function createSubscription(session, tierKey, returnUrl, isAnnual = false, authContext = null) {
  const tier = SUBSCRIPTION_TIERS[tierKey];

  if (!tier) {
    throw new Error('Invalid subscription tier');
  }

  if (tier.price === 0) {
    const existing = await query(
      `SELECT subscription_id FROM shops WHERE shop_domain = $1`,
      [session.shop]
    );
    const subscriptionId = existing.rows[0]?.subscription_id;
    if (subscriptionId) {
      logger.info('Cancelling existing Shopify subscription before downgrade to FREE:', { shop: session.shop, subscriptionId });
      const cancelResponse = await shopifyGraphqlRequest({
        session,
        query: `
          mutation AppSubscriptionCancel($id: ID!) {
            appSubscriptionCancel(id: $id) {
              appSubscription { id status }
              userErrors { field message }
            }
          }
        `,
        variables: { id: subscriptionId },
        authContext,
      });
      const cancelErrors = cancelResponse.data?.appSubscriptionCancel?.userErrors;
      if (cancelErrors?.length > 0) {
        const isAlreadyInactive = cancelErrors.some(e => e.message?.includes('InvalidTransitionError'));
        if (isAlreadyInactive) {
          logger.info('Subscription already inactive on Shopify during FREE downgrade (stale subscription_id will be cleared):', subscriptionId);
        } else {
          throw new Error(cancelErrors[0].message);
        }
      } else {
        logger.info('Shopify subscription cancelled during FREE downgrade:', subscriptionId);
      }
    }

    // Confirm from Shopify ground truth before writing to DB
    await syncSubscriptionStatus(session, authContext);
    return { success: true, tier: tierKey, confirmationUrl: null };
  }

  // Create paid subscription via Shopify GraphQL
  logger.info('Creating subscription for tier:', tierKey, 'shop:', session.shop, 'annual:', isAnnual);

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

  // Use test charges on non-production environments so dev-store billing works
  // (dev stores require test: true to enable the Approve button)
  const isTestCharge = process.env.NODE_ENV !== 'production';
  logger.info('Billing config:', {
    isTestCharge,
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
  logger.info('About to call Shopify GraphQL API...');

  try {
    const response = await shopifyGraphqlRequest({
      session,
      query: mutation,
      variables,
      authContext,
    });
    logger.info('Shopify GraphQL API call completed');
    logger.info('Subscription API response:', JSON.stringify(response, null, 2));

    const { appSubscriptionCreate } = response.data;

    if (appSubscriptionCreate.userErrors.length > 0) {
      logger.error('Subscription creation errors:', appSubscriptionCreate.userErrors);
      throw new Error(appSubscriptionCreate.userErrors[0].message);
    }

    const subscriptionId = appSubscriptionCreate.appSubscription.id;

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
export async function cancelSubscription(session, authContext = null) {
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

      const response = await shopifyGraphqlRequest({
        session,
        query: mutation,
        variables: { id: subscriptionId },
        authContext,
      });

      const { appSubscriptionCancel } = response.data;
      if (appSubscriptionCancel?.userErrors?.length > 0) {
        const isAlreadyInactive = appSubscriptionCancel.userErrors.some(e => e.message?.includes('InvalidTransitionError'));
        if (isAlreadyInactive) {
          logger.info('Subscription already inactive on Shopify (stale subscription_id will be cleared):', subscriptionId);
        } else {
          throw new Error(appSubscriptionCancel.userErrors[0].message);
        }
      } else {
        logger.info('Shopify subscription cancelled:', appSubscriptionCancel?.appSubscription);
      }
    }

    // Confirm cancellation from Shopify ground truth before updating DB
    await syncSubscriptionStatus(session, authContext);
    logger.info('Subscription cancellation confirmed via sync:', session.shop);
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

/**
 * Map a price amount back to a tier key by comparing against known tier prices
 * @param {number} price - The price amount from Shopify
 * @param {boolean} isAnnual - Whether this is an annual subscription
 * @returns {string} The tier key (FREE, GROWTH, PROFESSIONAL, ENTERPRISE)
 */
function mapPriceToTier(price, isAnnual) {
  const amount = parseFloat(price);
  for (const [key, tier] of Object.entries(SUBSCRIPTION_TIERS)) {
    const tierPrice = isAnnual ? tier.annualPrice : tier.price;
    if (tierPrice === amount) {
      return key;
    }
  }
  logger.warn('Could not map price to tier:', { price, isAnnual });
  return null;
}

/**
 * Sync subscription status from Shopify's ground truth
 * Queries currentAppInstallation.activeSubscriptions and reconciles the DB
 * @param {Object} session - Shopify session with accessToken
 * @param {Object} [authContext] - Auth context for token exchange retry
 */
export async function syncSubscriptionStatus(session, authContext = null) {
  const response = await shopifyGraphqlRequest({
    session,
    query: `
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            createdAt
            currentPeriodEnd
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    interval
                    price {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    authContext,
  });

  const subscriptions = response.data?.currentAppInstallation?.activeSubscriptions || [];
  logger.info('Active subscriptions from Shopify:', JSON.stringify(subscriptions));

  if (subscriptions.length === 0) {
    // No active Shopify subscription — ensure DB reflects FREE tier
    logger.info('No active subscriptions, setting shop to FREE:', session.shop);
    await query(
      `UPDATE shops
       SET subscription_tier = 'FREE',
           subscription_id = NULL,
           billing_interval = 'MONTHLY',
           updated_at = CURRENT_TIMESTAMP
       WHERE shop_domain = $1`,
      [session.shop]
    );
    return;
  }

  const activeSub = subscriptions[0];
  const pricingDetails = activeSub.lineItems[0]?.plan?.pricingDetails;
  const price = parseFloat(pricingDetails?.price?.amount || '0');
  const interval = pricingDetails?.interval;
  const isAnnual = interval === 'ANNUAL';
  const tierKey = mapPriceToTier(price, isAnnual);

  if (!tierKey) {
    // Could not map the Shopify price to a known tier — skip DB update to avoid silent downgrade
    logger.error('Skipping subscription sync — unknown price/tier mapping:', { shop: session.shop, price, isAnnual });
    return;
  }

  // Use Shopify's actual period dates when available, fall back to calculated dates
  const cycleStart = activeSub.createdAt ? new Date(activeSub.createdAt) : new Date();
  const cycleEnd = activeSub.currentPeriodEnd
    ? new Date(activeSub.currentPeriodEnd)
    : (() => {
        const end = new Date();
        if (isAnnual) end.setFullYear(end.getFullYear() + 1);
        else end.setDate(end.getDate() + 30);
        return end;
      })();

  logger.info('Syncing subscription from Shopify:', { shop: session.shop, tierKey, subscriptionId: activeSub.id, isAnnual });

  await query(
    `UPDATE shops
     SET subscription_tier = $1,
         subscription_id = $2,
         billing_cycle_start = $3,
         billing_cycle_end = $4,
         billing_interval = $5,
         trial_used_at = COALESCE(trial_used_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE shop_domain = $6`,
    [tierKey, activeSub.id, cycleStart, cycleEnd, isAnnual ? 'ANNUAL' : 'MONTHLY', session.shop]
  );
}

export default {
  SUBSCRIPTION_TIERS,
  TRIAL_DAYS,
  ANNUAL_DISCOUNT_PERCENT,
  createSubscription,
  confirmSubscription,
  cancelSubscription,
  syncSubscriptionStatus,
  getSubscriptionStatus,
  getMonthlyRecommendationCount,
  canMakeRecommendation,
  getAvailableTiers,
};

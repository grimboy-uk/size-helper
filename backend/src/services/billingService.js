import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Billing');

/**
 * Subscription tier definitions
 */
export const SUBSCRIPTION_TIERS = {
  STARTUP: {
    name: 'Startup',
    price: 0,
    productTypeLimit: 2,
    description: 'Free tier - up to 2 product types',
  },
  MICRO_ENTERPRISE: {
    name: 'Micro Enterprise',
    price: 10,
    productTypeLimit: 10,
    description: '$10/month - up to 10 product types',
  },
  SMALL_BUSINESS: {
    name: 'Small Business',
    price: 20,
    productTypeLimit: 30,
    description: '$20/month - up to 30 product types',
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
  const client = new (await import('@shopify/shopify-api')).default.clients.Graphql({
    session,
  });

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
    const response = await client.query({
      data: {
        query: mutation,
        variables,
      },
    });

    const { appSubscriptionCreate } = response.body.data;

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
    logger.error('Failed to create subscription:', error);
    throw error;
  }
}

/**
 * Confirm subscription after merchant approval
 */
export async function confirmSubscription(shopDomain, tierKey, subscriptionId) {
  try {
    const cycleStart = new Date();
    const cycleEnd = new Date();
    cycleEnd.setDate(cycleEnd.getDate() + 30);

    await query(
      `UPDATE shops
       SET subscription_tier = $1,
           subscription_id = $2,
           billing_cycle_start = $3,
           billing_cycle_end = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE shop_domain = $5`,
      [tierKey, subscriptionId, cycleStart, cycleEnd, shopDomain]
    );

    logger.info('Subscription confirmed:', { shopDomain, tier: tierKey });
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

    if (subscriptionId) {
      // Cancel via Shopify GraphQL
      const client = new (await import('@shopify/shopify-api')).default.clients.Graphql({
        session,
      });

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

      await client.query({
        data: {
          query: mutation,
          variables: { id: subscriptionId },
        },
      });
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

    logger.info('Subscription cancelled:', session.shop);
    return { success: true };
  } catch (error) {
    logger.error('Failed to cancel subscription:', error);
    throw error;
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

    // Get current product type count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM size_templates WHERE shop_domain = $1 AND is_active = true`,
      [shopDomain]
    );
    const productTypeCount = parseInt(countResult.rows[0].count, 10);

    return {
      tier: shop.subscription_tier,
      tierName: tier.name,
      price: tier.price,
      productTypeLimit: tier.productTypeLimit,
      productTypeCount,
      remainingSlots: tier.productTypeLimit - productTypeCount,
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
};

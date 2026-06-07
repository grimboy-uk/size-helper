import { createLogger } from '../utils/logger.js';

const logger = createLogger('WebhookService');

// This will be set by index.js after shopify is initialized
let shopifyInstance = null;

export const setShopifyInstance = (instance) => {
  shopifyInstance = instance;
};

export const getShopifyInstance = () => shopifyInstance;

// Register webhooks for a shop
export async function registerWebhooks(session) {
  if (!shopifyInstance) {
    logger.error('Shopify instance not set - call setShopifyInstance first');
    return;
  }

  try {
    logger.info('=== registerWebhooks called ===');
    logger.info('Registering webhooks for:', session.shop);

    const webhooks = [
      {
        topic: 'inventory_levels/update',
        address: `${process.env.SHOPIFY_APP_URL}/api/webhooks/inventory`,
        format: 'json',
      },
      {
        topic: 'app/uninstalled',
        address: `${process.env.SHOPIFY_APP_URL}/api/webhooks/uninstall`,
        format: 'json',
      },
      {
        topic: 'orders/paid',
        address: `${process.env.SHOPIFY_APP_URL}/api/webhooks/orders/paid`,
        format: 'json',
      },
    ];

    logger.debug('Creating REST client...');

    const client = new shopifyInstance.api.clients.Rest({ session });
    logger.debug('REST client created');

    for (const webhookConfig of webhooks) {
      try {
        logger.debug(`Attempting to register: ${webhookConfig.topic}`);
        const response = await client.post({
          path: 'webhooks.json',
          data: {
            webhook: {
              topic: webhookConfig.topic,
              address: webhookConfig.address,
              format: webhookConfig.format
            }
          }
        });

        if (response.body) {
          logger.info(`Registered webhook: ${webhookConfig.topic}`);
        } else {
          logger.error(`Failed to register ${webhookConfig.topic}:`, response);
        }
      } catch (error) {
        logger.error(`Error registering webhook ${webhookConfig.topic}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Fatal error in registerWebhooks:', error.message);
    logger.error('Stack:', error.stack);
  }
}

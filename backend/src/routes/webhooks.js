import express from 'express';
import crypto from 'crypto';
import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';
import { reportPartnerEvent } from '../services/partnerService.js';

const router = express.Router();
const logger = createLogger('Webhooks');

/**
 * Verify Shopify webhook HMAC
 */
function verifyWebhook(req) {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];

  if (!hmacHeader) {
    return false;
  }

  const body = req.rawBody;
  const secret = process.env.SHOPIFY_API_SECRET;

  const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

/**
 * Middleware to verify webhook signature
 */
function webhookVerification(req, res, next) {
  if (!verifyWebhook(req)) {
    logger.warn('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
}

/**
 * POST /api/webhooks/app/uninstalled
 * Handle app uninstall - clean up shop data
 */
router.post('/app/uninstalled', webhookVerification, async (req, res) => {
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'];
    logger.info('App uninstalled webhook received:', shopDomain);

    // Partner Programme — report churn before the shop row is deleted below.
    // NOTE: unlike bis-app/returns-manager, this app deletes the shops row
    // entirely on uninstall rather than preserving it, so a reinstall here
    // will NOT retain the original partner attribution (partner_id goes with
    // the row). Pre-existing behavior of this app, not introduced by this
    // change — flagging since it differs from the other 3 RMS apps.
    try {
      const partnerResult = await query(`SELECT partner_id FROM shops WHERE shop_domain = $1`, [shopDomain]);
      await reportPartnerEvent({ partnerId: partnerResult.rows[0]?.partner_id, eventType: 'cancel', shopDomain });
    } catch (partnerError) {
      logger.warn('Partner cancel report failed:', partnerError.message);
    }

    // Delete shop data (cascades to related tables)
    await query(`DELETE FROM shops WHERE shop_domain = $1`, [shopDomain]);

    logger.info('Shop data cleaned up:', shopDomain);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error handling uninstall webhook:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/webhooks/customers/data_request
 * GDPR: Handle customer data request
 */
router.post('/customers/data_request', webhookVerification, async (req, res) => {
  try {
    const { shop_domain, customer } = req.body;
    logger.info('Customer data request:', { shop: shop_domain, customer_id: customer?.id });

    // This app doesn't store customer PII beyond what's needed for recommendations
    // Size recommendations are anonymous and don't include customer identifiers

    res.status(200).json({
      success: true,
      message: 'No customer PII stored by this app',
    });
  } catch (error) {
    logger.error('Error handling data request webhook:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/webhooks/customers/redact
 * GDPR: Handle customer data erasure request
 */
router.post('/customers/redact', webhookVerification, async (req, res) => {
  try {
    const { shop_domain, customer } = req.body;
    logger.info('Customer redact request:', { shop: shop_domain, customer_id: customer?.id });

    // This app doesn't store customer PII
    // All recommendation data is anonymous

    res.status(200).json({
      success: true,
      message: 'No customer data to redact',
    });
  } catch (error) {
    logger.error('Error handling customer redact webhook:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/webhooks/shop/redact
 * GDPR: Handle shop data erasure request
 */
router.post('/shop/redact', webhookVerification, async (req, res) => {
  try {
    const { shop_domain } = req.body;
    logger.info('Shop redact request:', shop_domain);

    // Delete all shop data
    await query(`DELETE FROM shops WHERE shop_domain = $1`, [shop_domain]);

    logger.info('Shop data redacted:', shop_domain);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error handling shop redact webhook:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * Attribute a paid order line item to size guide analytics when a recent recommendation exists.
 */
async function attributePurchaseLineItem(shopDomain, lineItem) {
  const productId = lineItem.product_id;
  if (!productId) {
    return;
  }

  const assignment = await query(
    `SELECT 1 FROM product_assignments WHERE shop_domain = $1 AND product_id = $2 LIMIT 1`,
    [shopDomain, productId]
  );
  if (assignment.rows.length === 0) {
    return;
  }

  const recommendation = await query(
    `SELECT id FROM size_recommendations
     WHERE shop_domain = $1 AND product_id = $2 AND created_at > NOW() - INTERVAL '2 hours'
     LIMIT 1`,
    [shopDomain, productId]
  );
  if (recommendation.rows.length === 0) {
    return;
  }

  const lineValue = parseFloat(lineItem.price) * lineItem.quantity;
  if (!Number.isFinite(lineValue)) {
    return;
  }

  await query(
    `INSERT INTO analytics (shop_domain, product_id, event_type, event_date, count, value)
     VALUES ($1, $2, 'purchase_attributed', CURRENT_DATE, 1, $3)
     ON CONFLICT (shop_domain, product_id, event_type, event_date)
     DO UPDATE SET count = analytics.count + 1, value = analytics.value + EXCLUDED.value`,
    [shopDomain, productId, lineValue]
  );
}

/**
 * Handle orders/paid webhook — attribute revenue to products with recent size recommendations.
 */
export async function handleOrderPaid(shopDomain, order) {
  const lineItems = order?.line_items || [];
  await Promise.all(lineItems.map((lineItem) => attributePurchaseLineItem(shopDomain, lineItem)));
}

/**
 * POST /api/webhooks/orders/paid
 * Handle paid order — attribute purchases to recent size recommendations
 */
router.post('/orders/paid', webhookVerification, async (req, res) => {
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'];
    logger.info('Order paid webhook received:', shopDomain);

    await handleOrderPaid(shopDomain, req.body);

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error handling order paid webhook:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

export { webhookVerification };
export default router;

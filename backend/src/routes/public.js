import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../config/database.js';
import { calculateRecommendation, getSizeChart } from '../services/sizeRecommendationService.js';
import { canMakeRecommendation } from '../services/billingService.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('PublicRoute');

const ALLOWED_TRACK_EVENTS = new Set(['add_to_cart_after_rec']);

/**
 * GET /api/public/size-chart
 * Get size chart for a product (public endpoint for storefront)
 */
router.get(
  '/size-chart',
  asyncHandler(async (req, res) => {
    const { shop, productId, unit } = req.query;

    if (!shop) {
      return res.status(400).json({ error: 'Shop parameter is required' });
    }

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    // Validate unit if provided
    if (unit && !['cm', 'in'].includes(unit)) {
      return res.status(400).json({ error: 'Unit must be "cm" or "in"' });
    }

    const sizeChart = await getSizeChart(shop, productId, unit);

    if (!sizeChart) {
      return res.status(404).json({ error: 'No size guide available for this product' });
    }

    // Track size chart view
    const today = new Date().toISOString().split('T')[0];
    await query(
      `INSERT INTO analytics (shop_domain, product_id, event_type, event_date, count)
       VALUES ($1, $2, 'size_guide_opened', $3, 1)
       ON CONFLICT (shop_domain, product_id, event_type, event_date)
       DO UPDATE SET count = analytics.count + 1`,
      [shop, productId, today]
    ).catch((err) => logger.error('Failed to track size chart view:', err));

    res.json(sizeChart);
  })
);

/**
 * POST /api/public/recommend
 * Get size recommendation based on user inputs
 */
router.post(
  '/recommend',
  asyncHandler(async (req, res) => {
    const { shop, productId, measurements, bodyShape, usualSize, preferredFit, measurementUnit } = req.body;

    if (!shop) {
      return res.status(400).json({ error: 'Shop is required' });
    }

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    // Need at least one input
    if (!measurements && !bodyShape && !usualSize) {
      return res.status(400).json({
        error: 'At least one input is required (measurements, body shape, or usual size)',
      });
    }

    // Check recommendation limit for this shop
    const limitCheck = await canMakeRecommendation(shop);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: 'Monthly recommendation limit reached',
        message: 'This store has reached its monthly size recommendation limit. Please try again next month or ask the store to upgrade their plan.',
        limit: limitCheck.limit,
        count: limitCheck.count,
      });
    }

    try {
      const recommendation = await calculateRecommendation(shop, productId, {
        measurements,
        bodyShape,
        usualSize,
        preferredFit,
        measurementUnit,
      });

      // Include remaining recommendations in response for free tier
      if (limitCheck.remaining !== undefined) {
        recommendation.recommendationsRemaining = limitCheck.remaining - 1; // -1 because we just used one
      }

      res.json(recommendation);
    } catch (error) {
      if (error.message === 'No size guide available for this product') {
        return res.status(404).json({ error: error.message });
      }
      throw error;
    }
  })
);

/**
 * POST /api/public/track
 * Record client-side storefront events (e.g. add-to-cart after recommendation)
 */
router.post(
  '/track',
  asyncHandler(async (req, res) => {
    const { shop, productId, event } = req.body;

    if (!shop) {
      return res.status(400).json({ error: 'Shop is required' });
    }

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    if (!event || !ALLOWED_TRACK_EVENTS.has(event)) {
      return res.status(400).json({ error: 'Invalid or unsupported event type' });
    }

    await query(
      `INSERT INTO analytics (shop_domain, product_id, event_type, event_date, count)
       VALUES ($1, $2, $3, CURRENT_DATE, 1)
       ON CONFLICT (shop_domain, product_id, event_type, event_date)
       DO UPDATE SET count = analytics.count + 1`,
      [shop, productId, event]
    );

    res.json({ ok: true });
  })
);

/**
 * GET /api/public/has-size-guide
 * Check if a product has a size guide (for conditional rendering)
 */
router.get(
  '/has-size-guide',
  asyncHandler(async (req, res) => {
    const { shop, productId } = req.query;

    if (!shop || !productId) {
      return res.status(400).json({ error: 'Shop and product ID are required' });
    }

    const result = await query(
      `SELECT pa.id FROM product_assignments pa
       INNER JOIN size_templates t ON pa.template_id = t.id
       WHERE pa.shop_domain = $1 AND pa.product_id = $2 AND t.is_active = true
       LIMIT 1`,
      [shop, productId]
    );

    res.json({ hasSizeGuide: result.rows.length > 0 });
  })
);

/**
 * GET /api/public/body-shapes
 * Get body shape options for a product
 */
router.get(
  '/body-shapes',
  asyncHandler(async (req, res) => {
    const { shop, productId } = req.query;

    if (!shop || !productId) {
      return res.status(400).json({ error: 'Shop and product ID are required' });
    }

    const result = await query(
      `SELECT t.body_shapes FROM size_templates t
       INNER JOIN product_assignments pa ON t.id = pa.template_id
       WHERE pa.shop_domain = $1 AND pa.product_id = $2 AND t.is_active = true
       LIMIT 1`,
      [shop, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No size guide available for this product' });
    }

    res.json({ bodyShapes: result.rows[0].body_shapes });
  })
);

export default router;

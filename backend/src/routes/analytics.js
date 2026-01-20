import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('AnalyticsRoute');

/**
 * GET /api/analytics/dashboard
 * Get dashboard analytics summary
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days, 10));
    const startDateStr = startDate.toISOString().split('T')[0];

    // Get total counts
    const totalsResult = await query(
      `SELECT
         event_type,
         SUM(count) as total
       FROM analytics
       WHERE shop_domain = $1 AND event_date >= $2
       GROUP BY event_type`,
      [shopDomain, startDateStr]
    );

    const totals = {
      sizeGuideOpened: 0,
      recommendationMade: 0,
    };

    for (const row of totalsResult.rows) {
      if (row.event_type === 'size_guide_opened') {
        totals.sizeGuideOpened = parseInt(row.total, 10);
      } else if (row.event_type === 'recommendation_made') {
        totals.recommendationMade = parseInt(row.total, 10);
      }
    }

    // Calculate conversion rate
    const conversionRate =
      totals.sizeGuideOpened > 0
        ? ((totals.recommendationMade / totals.sizeGuideOpened) * 100).toFixed(1)
        : 0;

    // Get template count
    const templateResult = await query(
      `SELECT COUNT(*) as count FROM size_templates WHERE shop_domain = $1 AND is_active = true`,
      [shopDomain]
    );
    const templateCount = parseInt(templateResult.rows[0].count, 10);

    // Get assigned products count
    const productResult = await query(
      `SELECT COUNT(DISTINCT product_id) as count FROM product_assignments WHERE shop_domain = $1`,
      [shopDomain]
    );
    const assignedProducts = parseInt(productResult.rows[0].count, 10);

    res.json({
      period: `${days} days`,
      totals,
      conversionRate: parseFloat(conversionRate),
      templateCount,
      assignedProducts,
    });
  })
);

/**
 * GET /api/analytics/timeline
 * Get timeline data for charts
 */
router.get(
  '/timeline',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days, 10));
    const startDateStr = startDate.toISOString().split('T')[0];

    const result = await query(
      `SELECT
         event_date,
         event_type,
         SUM(count) as total
       FROM analytics
       WHERE shop_domain = $1 AND event_date >= $2
       GROUP BY event_date, event_type
       ORDER BY event_date ASC`,
      [shopDomain, startDateStr]
    );

    // Organize by date
    const timelineMap = {};

    for (const row of result.rows) {
      const date = row.event_date.toISOString().split('T')[0];
      if (!timelineMap[date]) {
        timelineMap[date] = {
          date,
          sizeGuideOpened: 0,
          recommendationMade: 0,
        };
      }

      if (row.event_type === 'size_guide_opened') {
        timelineMap[date].sizeGuideOpened = parseInt(row.total, 10);
      } else if (row.event_type === 'recommendation_made') {
        timelineMap[date].recommendationMade = parseInt(row.total, 10);
      }
    }

    // Fill in missing dates
    const timeline = [];
    const current = new Date(startDateStr);
    const end = new Date();

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      timeline.push(
        timelineMap[dateStr] || {
          date: dateStr,
          sizeGuideOpened: 0,
          recommendationMade: 0,
        }
      );
      current.setDate(current.getDate() + 1);
    }

    res.json({ timeline });
  })
);

/**
 * GET /api/analytics/top-products
 * Get top products by size guide usage
 */
router.get(
  '/top-products',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { limit = 10, days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days, 10));
    const startDateStr = startDate.toISOString().split('T')[0];

    const result = await query(
      `SELECT
         a.product_id,
         pa.product_title,
         SUM(CASE WHEN a.event_type = 'size_guide_opened' THEN a.count ELSE 0 END) as opens,
         SUM(CASE WHEN a.event_type = 'recommendation_made' THEN a.count ELSE 0 END) as recommendations
       FROM analytics a
       LEFT JOIN product_assignments pa ON a.product_id = pa.product_id AND a.shop_domain = pa.shop_domain
       WHERE a.shop_domain = $1 AND a.event_date >= $2 AND a.product_id IS NOT NULL
       GROUP BY a.product_id, pa.product_title
       ORDER BY opens DESC
       LIMIT $3`,
      [shopDomain, startDateStr, parseInt(limit, 10)]
    );

    const products = result.rows.map((row) => ({
      productId: row.product_id,
      productTitle: row.product_title || `Product ${row.product_id}`,
      opens: parseInt(row.opens, 10),
      recommendations: parseInt(row.recommendations, 10),
      conversionRate:
        row.opens > 0 ? ((row.recommendations / row.opens) * 100).toFixed(1) : 0,
    }));

    res.json({ products });
  })
);

/**
 * GET /api/analytics/recommendations
 * Get recent recommendations log
 */
router.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT
         sr.id,
         sr.product_id,
         sr.recommended_size,
         sr.user_inputs,
         sr.created_at,
         pa.product_title,
         t.name as template_name
       FROM size_recommendations sr
       LEFT JOIN product_assignments pa ON sr.product_id = pa.product_id AND sr.shop_domain = pa.shop_domain
       LEFT JOIN size_templates t ON sr.template_id = t.id
       WHERE sr.shop_domain = $1
       ORDER BY sr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [shopDomain, parseInt(limit, 10), parseInt(offset, 10)]
    );

    res.json({ recommendations: result.rows });
  })
);

export default router;

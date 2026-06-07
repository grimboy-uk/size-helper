import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../config/database.js';
import { SUBSCRIPTION_TIERS } from '../services/billingService.js';

const router = express.Router();

function computeTrend(current, previous) {
  if (previous === 0) {
    return null;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

async function getPeriodMetrics(shopDomain, startDateStr, endDateStr = null) {
  const params = [shopDomain, startDateStr];
  let dateFilter = 'event_date >= $2';

  if (endDateStr) {
    dateFilter += ' AND event_date < $3';
    params.push(endDateStr);
  }

  const totalsResult = await query(
    `SELECT
       event_type,
       SUM(count) as total,
       SUM(value) as total_value
     FROM analytics
     WHERE shop_domain = $1 AND ${dateFilter}
     GROUP BY event_type`,
    params
  );

  const metrics = {
    opens: 0,
    recommendations: 0,
    addToCart: 0,
    purchases: 0,
    revenue: 0,
  };

  for (const row of totalsResult.rows) {
    const total = Number.parseInt(row.total, 10) || 0;

    if (row.event_type === 'size_guide_opened') {
      metrics.opens = total;
    } else if (row.event_type === 'recommendation_made') {
      metrics.recommendations = total;
    } else if (row.event_type === 'add_to_cart_after_rec') {
      metrics.addToCart = total;
    } else if (row.event_type === 'purchase_attributed') {
      metrics.purchases = total;
      metrics.revenue = Number.parseFloat(row.total_value) || 0;
    }
  }

  return metrics;
}

// Helper function to format date as YYYY-MM-DD in local timezone
function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper function to get shop's tier features
 */
async function getShopTierFeatures(shopDomain) {
  const result = await query(
    `SELECT subscription_tier FROM shops WHERE shop_domain = $1`,
    [shopDomain]
  );
  const tierKey = result.rows[0]?.subscription_tier || 'FREE';
  return SUBSCRIPTION_TIERS[tierKey] || SUBSCRIPTION_TIERS.FREE;
}

/**
 * GET /api/analytics/dashboard
 * Get dashboard analytics summary
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { days = 30 } = req.query;
    const daysNum = Number.parseInt(days, 10);

    const currentStart = new Date();
    currentStart.setDate(currentStart.getDate() - daysNum);
    const currentStartStr = formatDateLocal(currentStart);

    const previousEnd = new Date(currentStart);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - daysNum);
    const previousStartStr = formatDateLocal(previousStart);

    const [current, previous] = await Promise.all([
      getPeriodMetrics(shopDomain, currentStartStr),
      getPeriodMetrics(shopDomain, previousStartStr, currentStartStr),
    ]);

    const conversionRate =
      current.opens > 0
        ? ((current.recommendations / current.opens) * 100).toFixed(1)
        : 0;

    // Get template count
    const templateResult = await query(
      `SELECT COUNT(*) as count FROM size_templates WHERE shop_domain = $1 AND is_active = true`,
      [shopDomain]
    );
    const templateCount = Number.parseInt(templateResult.rows[0].count, 10);

    // Get assigned products count
    const productResult = await query(
      `SELECT COUNT(DISTINCT product_id) as count FROM product_assignments WHERE shop_domain = $1`,
      [shopDomain]
    );
    const assignedProducts = Number.parseInt(productResult.rows[0].count, 10);

    res.json({
      period: `${days} days`,
      totals: {
        sizeGuideOpened: current.opens,
        recommendationMade: current.recommendations,
        addToCartAfterRec: current.addToCart,
        purchaseAttributed: current.purchases,
      },
      conversionRate: Number.parseFloat(conversionRate),
      templateCount,
      assignedProducts,
      opens: current.opens,
      recommendations: current.recommendations,
      addToCart: current.addToCart,
      purchases: current.purchases,
      revenue: current.revenue,
      trends: {
        opens: computeTrend(current.opens, previous.opens),
        recommendations: computeTrend(current.recommendations, previous.recommendations),
        addToCart: computeTrend(current.addToCart, previous.addToCart),
        purchases: computeTrend(current.purchases, previous.purchases),
        revenue: computeTrend(current.revenue, previous.revenue),
      },
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
    startDate.setDate(startDate.getDate() - Number.parseInt(days, 10));
    const startDateStr = formatDateLocal(startDate);

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
    // Note: event_date is now returned as string 'YYYY-MM-DD' due to pg type parser config
    const timelineMap = {};

    for (const row of result.rows) {
      const date = row.event_date; // Already a string 'YYYY-MM-DD'
      if (!timelineMap[date]) {
        timelineMap[date] = {
          date,
          sizeGuideOpened: 0,
          recommendationMade: 0,
          opens: 0,
          recommendations: 0,
          addToCart: 0,
          purchases: 0,
        };
      }

      const total = Number.parseInt(row.total, 10) || 0;

      if (row.event_type === 'size_guide_opened') {
        timelineMap[date].sizeGuideOpened = total;
        timelineMap[date].opens = total;
      } else if (row.event_type === 'recommendation_made') {
        timelineMap[date].recommendationMade = total;
        timelineMap[date].recommendations = total;
      } else if (row.event_type === 'add_to_cart_after_rec') {
        timelineMap[date].addToCart = total;
      } else if (row.event_type === 'purchase_attributed') {
        timelineMap[date].purchases = total;
      }
    }

    // Fill in missing dates
    const timeline = [];
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const current = new Date(startYear, startMonth - 1, startDay); // Month is 0-indexed
    const end = new Date();
    end.setHours(23, 59, 59, 999); // Include all of today

    const emptyDay = (dateStr) => ({
      date: dateStr,
      sizeGuideOpened: 0,
      recommendationMade: 0,
      opens: 0,
      recommendations: 0,
      addToCart: 0,
      purchases: 0,
    });

    while (current <= end) {
      const dateStr = formatDateLocal(current);
      timeline.push(timelineMap[dateStr] || emptyDay(dateStr));
      current.setDate(current.getDate() + 1);
    }

    res.json({ timeline });
  })
);

/**
 * GET /api/analytics/top-products
 * Get top products by size guide usage
 * Note: Requires detailedAnalytics feature (paid tiers only)
 */
router.get(
  '/top-products',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { limit = 10, days = 30 } = req.query;

    // Check if shop has detailed analytics access
    const tierFeatures = await getShopTierFeatures(shopDomain);
    if (!tierFeatures.detailedAnalytics) {
      return res.json({
        products: [],
        restricted: true,
        message: 'Per-product analytics requires a paid plan. Upgrade to see which products get the most size guide usage.',
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number.parseInt(days, 10));
    const startDateStr = formatDateLocal(startDate);

    const result = await query(
      `SELECT
         a.product_id,
         pa.product_title,
         SUM(CASE WHEN a.event_type = 'size_guide_opened' THEN a.count ELSE 0 END) as opens,
         SUM(CASE WHEN a.event_type = 'recommendation_made' THEN a.count ELSE 0 END) as recommendations,
         SUM(CASE WHEN a.event_type = 'add_to_cart_after_rec' THEN a.count ELSE 0 END) as add_to_cart,
         SUM(CASE WHEN a.event_type = 'purchase_attributed' THEN a.count ELSE 0 END) as purchases,
         SUM(CASE WHEN a.event_type = 'purchase_attributed' THEN a.value ELSE 0 END) as revenue
       FROM analytics a
       LEFT JOIN product_assignments pa ON a.product_id = pa.product_id AND a.shop_domain = pa.shop_domain
       WHERE a.shop_domain = $1 AND a.event_date >= $2 AND a.product_id IS NOT NULL
       GROUP BY a.product_id, pa.product_title
       ORDER BY opens DESC
       LIMIT $3`,
      [shopDomain, startDateStr, Number.parseInt(limit, 10)]
    );

    const products = result.rows.map((row) => ({
      productId: row.product_id,
      productTitle: row.product_title || `Product ${row.product_id}`,
      opens: Number.parseInt(row.opens, 10),
      recommendations: Number.parseInt(row.recommendations, 10),
      addToCart: Number.parseInt(row.add_to_cart, 10),
      purchases: Number.parseInt(row.purchases, 10),
      revenue: Number.parseFloat(row.revenue) || 0,
      conversionRate:
        row.opens > 0 ? ((row.recommendations / row.opens) * 100).toFixed(1) : 0,
    }));

    res.json({ products });
  })
);

/**
 * GET /api/analytics/recommendations
 * Get recent recommendations log
 * Note: Requires detailedAnalytics feature (paid tiers only)
 */
router.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { limit = 50, offset = 0 } = req.query;

    // Check if shop has detailed analytics access
    const tierFeatures = await getShopTierFeatures(shopDomain);
    if (!tierFeatures.detailedAnalytics) {
      return res.json({
        recommendations: [],
        restricted: true,
        message: 'Detailed recommendation history requires a paid plan. Upgrade to see individual size recommendations.',
      });
    }

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
      [shopDomain, Number.parseInt(limit, 10), Number.parseInt(offset, 10)]
    );

    res.json({ recommendations: result.rows });
  })
);

export default router;

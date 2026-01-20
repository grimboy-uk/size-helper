import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('ProductsRoute');

/**
 * GET /api/products/assignments
 * Get all product assignments for the shop
 */
router.get(
  '/assignments',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { templateId } = req.query;

    let queryText = `
      SELECT pa.*, t.name as template_name, t.category as template_category
      FROM product_assignments pa
      INNER JOIN size_templates t ON pa.template_id = t.id
      WHERE pa.shop_domain = $1
    `;
    const params = [shopDomain];

    if (templateId) {
      queryText += ` AND pa.template_id = $${params.length + 1}`;
      params.push(templateId);
    }

    queryText += ` ORDER BY pa.created_at DESC`;

    const result = await query(queryText, params);
    res.json({ assignments: result.rows });
  })
);

/**
 * POST /api/products/assign
 * Assign a product to a template
 */
router.post(
  '/assign',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { productId, templateId, productTitle, productHandle } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }

    // Verify template exists and belongs to shop
    const templateResult = await query(
      `SELECT id FROM size_templates WHERE id = $1 AND shop_domain = $2`,
      [templateId, shopDomain]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Upsert product assignment
    const result = await query(
      `INSERT INTO product_assignments (shop_domain, template_id, product_id, product_title, product_handle)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (shop_domain, product_id)
       DO UPDATE SET template_id = $2, product_title = $4, product_handle = $5
       RETURNING *`,
      [shopDomain, templateId, productId, productTitle, productHandle]
    );

    logger.info('Product assigned to template:', { shopDomain, productId, templateId });
    res.json({ assignment: result.rows[0] });
  })
);

/**
 * POST /api/products/assign-bulk
 * Assign multiple products to a template
 */
router.post(
  '/assign-bulk',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { products, templateId } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products array is required' });
    }

    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }

    // Verify template exists
    const templateResult = await query(
      `SELECT id FROM size_templates WHERE id = $1 AND shop_domain = $2`,
      [templateId, shopDomain]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const results = [];
    const errors = [];

    for (const product of products) {
      try {
        const result = await query(
          `INSERT INTO product_assignments (shop_domain, template_id, product_id, product_title, product_handle)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (shop_domain, product_id)
           DO UPDATE SET template_id = $2, product_title = $4, product_handle = $5
           RETURNING *`,
          [shopDomain, templateId, product.productId, product.productTitle, product.productHandle]
        );
        results.push(result.rows[0]);
      } catch (error) {
        errors.push({ productId: product.productId, error: error.message });
      }
    }

    logger.info('Bulk product assignment:', { shopDomain, templateId, count: results.length });
    res.json({ assignments: results, errors });
  })
);

/**
 * DELETE /api/products/unassign/:productId
 * Remove product assignment
 */
router.delete(
  '/unassign/:productId',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { productId } = req.params;

    const result = await query(
      `DELETE FROM product_assignments WHERE shop_domain = $1 AND product_id = $2 RETURNING id`,
      [shopDomain, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    logger.info('Product unassigned:', { shopDomain, productId });
    res.json({ success: true });
  })
);

/**
 * GET /api/products/search
 * Search products from Shopify (for product picker)
 */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const session = res.locals.shopify.session;
    const { query: searchQuery, limit = 25 } = req.query;

    const { default: shopifyApi } = await import('@shopify/shopify-api');
    const client = new shopifyApi.clients.Graphql({ session });

    const gqlQuery = `
      query SearchProducts($query: String, $first: Int!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              featuredImage {
                url
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await client.query({
      data: {
        query: gqlQuery,
        variables: {
          query: searchQuery || '',
          first: parseInt(limit, 10),
        },
      },
    });

    const products = response.body.data.products.edges.map((edge) => ({
      id: edge.node.id.replace('gid://shopify/Product/', ''),
      title: edge.node.title,
      handle: edge.node.handle,
      image: edge.node.featuredImage?.url,
      variants: edge.node.variants.edges.map((v) => ({
        id: v.node.id.replace('gid://shopify/ProductVariant/', ''),
        title: v.node.title,
      })),
    }));

    res.json({ products });
  })
);

export default router;

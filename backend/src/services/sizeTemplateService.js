import { query, getClient } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SizeTemplate');

/**
 * Predefined product categories with their default measurement fields
 */
export const PRODUCT_CATEGORIES = {
  TOPS: {
    name: 'Tops',
    description: 'T-shirts, shirts, blouses, sweaters',
    defaultFields: [
      { key: 'chest', label: 'Chest', required: true },
      { key: 'waist', label: 'Waist', required: true },
      { key: 'length', label: 'Length', required: true },
      { key: 'shoulder', label: 'Shoulder', required: false },
    ],
  },
  BOTTOMS: {
    name: 'Bottoms',
    description: 'Pants, jeans, shorts, skirts',
    defaultFields: [
      { key: 'waist', label: 'Waist', required: true },
      { key: 'hip', label: 'Hip', required: true },
      { key: 'inseam', label: 'Inseam', required: true },
      { key: 'thigh', label: 'Thigh', required: false },
    ],
  },
  DRESSES: {
    name: 'Dresses',
    description: 'Dresses, jumpsuits, rompers',
    defaultFields: [
      { key: 'chest', label: 'Chest', required: true },
      { key: 'waist', label: 'Waist', required: true },
      { key: 'hip', label: 'Hip', required: true },
      { key: 'length', label: 'Length', required: true },
      { key: 'shoulder', label: 'Shoulder', required: false },
    ],
  },
  OUTERWEAR: {
    name: 'Outerwear',
    description: 'Jackets, coats, blazers',
    defaultFields: [
      { key: 'chest', label: 'Chest', required: true },
      { key: 'shoulder', label: 'Shoulder', required: true },
      { key: 'sleeve', label: 'Sleeve Length', required: true },
      { key: 'length', label: 'Length', required: true },
    ],
  },
  FOOTWEAR: {
    name: 'Footwear',
    description: 'Shoes, boots, sneakers, sandals',
    defaultFields: [
      { key: 'length', label: 'Foot Length', required: true },
      { key: 'width', label: 'Foot Width', required: false },
    ],
  },
  CUSTOM: {
    name: 'Custom',
    description: 'Create your own measurement fields',
    defaultFields: [],
  },
};

/**
 * Default body shapes with placeholder descriptions
 */
export const DEFAULT_BODY_SHAPES = [
  {
    key: 'slim',
    label: 'Slim',
    description: 'Narrow build, smaller frame',
    adjustment: -1, // Size down tendency
  },
  {
    key: 'regular',
    label: 'Regular',
    description: 'Average build',
    adjustment: 0,
  },
  {
    key: 'athletic',
    label: 'Athletic',
    description: 'Broader shoulders, defined muscles',
    adjustment: 0.5,
  },
  {
    key: 'relaxed',
    label: 'Relaxed',
    description: 'Fuller build, prefer looser fit',
    adjustment: 1, // Size up tendency
  },
];

/**
 * Create a new size template
 */
export async function createTemplate(shopDomain, templateData) {
  const {
    name,
    category,
    measurementUnit = 'cm',
    measurementFields,
    sizes,
    bodyShapes = DEFAULT_BODY_SHAPES,
  } = templateData;

  try {
    const result = await query(
      `INSERT INTO size_templates (shop_domain, name, category, measurement_unit, measurement_fields, sizes, body_shapes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        shopDomain,
        name,
        category,
        measurementUnit,
        JSON.stringify(measurementFields),
        JSON.stringify(sizes),
        JSON.stringify(bodyShapes),
      ]
    );

    logger.info('Size template created:', { shopDomain, name, id: result.rows[0].id });
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('A template with this name already exists');
    }
    logger.error('Failed to create size template:', error);
    throw error;
  }
}

/**
 * Update an existing size template
 */
export async function updateTemplate(shopDomain, templateId, templateData) {
  const {
    name,
    category,
    measurementUnit,
    measurementFields,
    sizes,
    bodyShapes,
    isActive,
  } = templateData;

  try {
    const result = await query(
      `UPDATE size_templates
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           measurement_unit = COALESCE($3, measurement_unit),
           measurement_fields = COALESCE($4, measurement_fields),
           sizes = COALESCE($5, sizes),
           body_shapes = COALESCE($6, body_shapes),
           is_active = COALESCE($7, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND shop_domain = $9
       RETURNING *`,
      [
        name,
        category,
        measurementUnit,
        measurementFields ? JSON.stringify(measurementFields) : null,
        sizes ? JSON.stringify(sizes) : null,
        bodyShapes ? JSON.stringify(bodyShapes) : null,
        isActive,
        templateId,
        shopDomain,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Template not found');
    }

    logger.info('Size template updated:', { shopDomain, templateId });
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to update size template:', error);
    throw error;
  }
}

/**
 * Get a single template by ID
 */
export async function getTemplate(shopDomain, templateId) {
  try {
    const result = await query(
      `SELECT * FROM size_templates WHERE id = $1 AND shop_domain = $2`,
      [templateId, shopDomain]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to get size template:', error);
    throw error;
  }
}

/**
 * Get all templates for a shop
 */
export async function getTemplates(shopDomain, options = {}) {
  const { activeOnly = false, category = null } = options;

  try {
    let queryText = `SELECT * FROM size_templates WHERE shop_domain = $1`;
    const params = [shopDomain];

    if (activeOnly) {
      queryText += ` AND is_active = true`;
    }

    if (category) {
      queryText += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    queryText += ` ORDER BY created_at DESC`;

    const result = await query(queryText, params);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get size templates:', error);
    throw error;
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(shopDomain, templateId) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // First remove all product assignments
    await client.query(
      `DELETE FROM product_assignments WHERE template_id = $1 AND shop_domain = $2`,
      [templateId, shopDomain]
    );

    // Then delete the template
    const result = await client.query(
      `DELETE FROM size_templates WHERE id = $1 AND shop_domain = $2 RETURNING id`,
      [templateId, shopDomain]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Template not found');
    }

    await client.query('COMMIT');
    logger.info('Size template deleted:', { shopDomain, templateId });
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to delete size template:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get template for a specific product
 */
export async function getTemplateForProduct(shopDomain, productId) {
  try {
    const result = await query(
      `SELECT t.* FROM size_templates t
       INNER JOIN product_assignments pa ON t.id = pa.template_id
       WHERE pa.shop_domain = $1 AND pa.product_id = $2 AND t.is_active = true`,
      [shopDomain, productId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to get template for product:', error);
    throw error;
  }
}

/**
 * Convert measurements between units
 */
export function convertMeasurement(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;

  if (fromUnit === 'cm' && toUnit === 'in') {
    return parseFloat((value / 2.54).toFixed(2));
  }

  if (fromUnit === 'in' && toUnit === 'cm') {
    return parseFloat((value * 2.54).toFixed(2));
  }

  return value;
}

export default {
  PRODUCT_CATEGORIES,
  DEFAULT_BODY_SHAPES,
  createTemplate,
  updateTemplate,
  getTemplate,
  getTemplates,
  deleteTemplate,
  getTemplateForProduct,
  convertMeasurement,
};

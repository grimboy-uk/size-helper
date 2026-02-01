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
    description: 'Trousers, jeans, shorts, skirts',
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
 * Default body shapes with descriptions
 */
export const DEFAULT_BODY_SHAPES = [
  {
    key: 'lean',
    label: 'Lean',
    description: 'Small frame, low muscle/fat',
    adjustment: -1, // Size down tendency
  },
  {
    key: 'balanced',
    label: 'Balanced',
    description: 'Moderate proportions',
    adjustment: 0,
  },
  {
    key: 'toned',
    label: 'Toned',
    description: 'Muscle definition, straight/broad shoulders',
    adjustment: 0.5,
  },
  {
    key: 'curvy',
    label: 'Curvy',
    description: 'Fuller, softer body frame',
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
    measurementGender = 'unisex',
    sizeNotation = 'UK',
    buttonColor = '#008060',
    buttonBorderRadius = 8,
    measurementFields,
    sizes,
    bodyShapes = DEFAULT_BODY_SHAPES,
    includeSizeHelper = true,
    illustrationType = null,
  } = templateData;

  try {
    const result = await query(
      `INSERT INTO size_templates (shop_domain, name, category, measurement_unit, measurement_gender, size_notation, button_color, button_border_radius, measurement_fields, sizes, body_shapes, include_size_helper, illustration_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        shopDomain,
        name,
        category,
        measurementUnit,
        measurementGender,
        sizeNotation,
        buttonColor,
        buttonBorderRadius,
        JSON.stringify(measurementFields),
        JSON.stringify(sizes),
        JSON.stringify(bodyShapes),
        includeSizeHelper,
        illustrationType,
      ]
    );

    logger.info('Size template created:', { shopDomain, name, id: result.rows[0].id, includeSizeHelper });
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
    measurementGender,
    sizeNotation,
    buttonColor,
    buttonBorderRadius,
    measurementFields,
    sizes,
    bodyShapes,
    includeSizeHelper,
    isActive,
    illustrationType,
  } = templateData;

  try {
    const result = await query(
      `UPDATE size_templates
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           measurement_unit = COALESCE($3, measurement_unit),
           measurement_gender = COALESCE($4, measurement_gender),
           size_notation = COALESCE($5, size_notation),
           button_color = COALESCE($6, button_color),
           button_border_radius = COALESCE($7, button_border_radius),
           measurement_fields = COALESCE($8, measurement_fields),
           sizes = COALESCE($9, sizes),
           body_shapes = COALESCE($10, body_shapes),
           include_size_helper = COALESCE($11, include_size_helper),
           is_active = COALESCE($12, is_active),
           illustration_type = COALESCE($13, illustration_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $14 AND shop_domain = $15
       RETURNING *`,
      [
        name,
        category,
        measurementUnit,
        measurementGender,
        sizeNotation,
        buttonColor,
        buttonBorderRadius,
        measurementFields ? JSON.stringify(measurementFields) : null,
        sizes ? JSON.stringify(sizes) : null,
        bodyShapes ? JSON.stringify(bodyShapes) : null,
        includeSizeHelper,
        isActive,
        illustrationType,
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

/**
 * Size notation conversion maps
 * These are approximate conversions for general clothing (not footwear)
 */
export const SIZE_NOTATION_CONVERSIONS = {
  // Women's clothing conversions (numeric sizes)
  women: {
    US: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
    UK: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24], // UK = US + 4
    EU: [30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50], // EU = US + 30
    AU: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24], // AU = UK
    JP: [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23], // JP = US + 3
    CN: [155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205], // CN height-based
  },
  // Men's clothing conversions (numeric sizes)
  men: {
    US: [34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54],
    UK: [34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54], // UK = US for men
    EU: [44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64], // EU = US + 10
    AU: [34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54], // AU = US
    JP: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // JP uses numbered sizes
    CN: [165, 170, 175, 180, 185, 190, 195, 200, 205, 210, 215], // CN height-based
  },
  // Footwear conversions
  footwear: {
    women: {
      US: [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10],
      UK: [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5], // UK = US - 2.5
      EU: [35, 35.5, 36, 37, 37.5, 38, 38.5, 39, 40, 40.5, 41],
      AU: [3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5], // AU = US - 1.5
      JP: [22, 22.5, 23, 23.5, 24, 24.5, 25, 25.5, 26, 26.5, 27], // JP in cm
      CN: [35, 35.5, 36, 37, 37.5, 38, 38.5, 39, 40, 40.5, 41], // CN = EU
    },
    men: {
      US: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12],
      UK: [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11], // UK = US - 1
      EU: [40, 40.5, 41, 42, 42.5, 43, 44, 44.5, 45, 45.5, 46],
      AU: [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11], // AU = UK
      JP: [25, 25.5, 26, 26.5, 27, 27.5, 28, 28.5, 29, 29.5, 30], // JP in cm
      CN: [40, 40.5, 41, 42, 42.5, 43, 44, 44.5, 45, 45.5, 46], // CN = EU
    },
  },
};

/**
 * Convert a numeric size between notation systems
 * @param {number} size - The size value to convert
 * @param {string} fromNotation - Source notation (US, UK, EU, AU, JP, CN)
 * @param {string} toNotation - Target notation
 * @param {string} gender - 'women' or 'men'
 * @param {string} category - Product category for context
 * @returns {number|string} Converted size or original if conversion not possible
 */
export function convertSizeNotation(size, fromNotation, toNotation, gender = 'women', category = 'TOPS') {
  if (fromNotation === toNotation) return size;

  // For letter sizes (XS, S, M, L, XL, etc.), return as-is
  if (typeof size === 'string' && /^(XXS|XS|S|M|L|XL|XXL|XXXL)$/i.test(size)) {
    return size;
  }

  const conversionTable = category === 'FOOTWEAR'
    ? SIZE_NOTATION_CONVERSIONS.footwear[gender]
    : SIZE_NOTATION_CONVERSIONS[gender];

  if (!conversionTable) return size;

  const fromSizes = conversionTable[fromNotation];
  const toSizes = conversionTable[toNotation];

  if (!fromSizes || !toSizes) return size;

  // Find index in source notation
  const index = fromSizes.indexOf(Number(size));
  if (index === -1) {
    // Try to find closest match
    const closest = fromSizes.reduce((prev, curr) =>
      Math.abs(curr - size) < Math.abs(prev - size) ? curr : prev
    );
    const closestIndex = fromSizes.indexOf(closest);
    return toSizes[closestIndex] || size;
  }

  return toSizes[index] || size;
}

export default {
  PRODUCT_CATEGORIES,
  DEFAULT_BODY_SHAPES,
  SIZE_NOTATION_CONVERSIONS,
  createTemplate,
  updateTemplate,
  getTemplate,
  getTemplates,
  deleteTemplate,
  getTemplateForProduct,
  convertMeasurement,
  convertSizeNotation,
};

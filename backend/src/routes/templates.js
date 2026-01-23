import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { subscriptionCheck } from '../middleware/subscriptionCheck.js';
import {
  PRODUCT_CATEGORIES,
  DEFAULT_BODY_SHAPES,
  createTemplate,
  updateTemplate,
  getTemplate,
  getTemplates,
  deleteTemplate,
} from '../services/sizeTemplateService.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('TemplatesRoute');

/**
 * GET /api/templates/categories
 * Get available product categories with default fields
 */
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    res.json({
      categories: PRODUCT_CATEGORIES,
      bodyShapes: DEFAULT_BODY_SHAPES,
    });
  })
);

/**
 * GET /api/templates
 * Get all templates for the shop
 */
router.get(
  '/',
  subscriptionCheck(),
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { active, category } = req.query;
    logger.debug('Getting templates:', { shopDomain, active, category });

    const templates = await getTemplates(shopDomain, {
      activeOnly: active === 'true',
      category,
    });

    res.json({
      templates,
      subscription: req.subscriptionInfo,
    });
  })
);

/**
 * GET /api/templates/:id
 * Get a single template
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { id } = req.params;

    const template = await getTemplate(shopDomain, id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  })
);

/**
 * POST /api/templates
 * Create a new template
 */
router.post(
  '/',
  subscriptionCheck({ enforceLimit: true }),
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { name, category, measurementUnit, measurementGender, sizeNotation, measurementFields, sizes, bodyShapes } = req.body;

    logger.debug('Creating template:', { shopDomain, name });
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    if (!category || !PRODUCT_CATEGORIES[category]) {
      return res.status(400).json({ error: 'Valid category is required' });
    }

    if (!measurementFields || !Array.isArray(measurementFields) || measurementFields.length === 0) {
      return res.status(400).json({ error: 'At least one measurement field is required' });
    }

    if (!sizes || !Array.isArray(sizes) || sizes.length === 0) {
      return res.status(400).json({ error: 'At least one size is required' });
    }

    // Validate measurement unit
    if (measurementUnit && !['cm', 'in'].includes(measurementUnit)) {
      return res.status(400).json({ error: 'Measurement unit must be "cm" or "in"' });
    }

    // Validate sizes have measurements for all fields
    for (const size of sizes) {
      if (!size.name) {
        return res.status(400).json({ error: 'Each size must have a name' });
      }

      if (!size.measurements || typeof size.measurements !== 'object') {
        return res.status(400).json({ error: `Size "${size.name}" must have measurements` });
      }

      // Check required fields have values
      for (const field of measurementFields) {
        if (field.required && (size.measurements[field.key] === undefined || size.measurements[field.key] === null)) {
          return res.status(400).json({
            error: `Size "${size.name}" is missing required measurement: ${field.label}`,
          });
        }
      }
    }

    try {
      const template = await createTemplate(shopDomain, {
        name: name.trim(),
        category,
        measurementUnit: measurementUnit || 'cm',
        measurementGender: measurementGender || 'unisex',
        sizeNotation: sizeNotation || 'US',
        measurementFields,
        sizes,
        bodyShapes: bodyShapes || DEFAULT_BODY_SHAPES,
      });

      logger.info('Template created:', { shopDomain, templateId: template.id });
      res.status(201).json({ template });
    } catch (error) {
      if (error.message === 'A template with this name already exists') {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
  })
);

/**
 * PUT /api/templates/:id
 * Update a template
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { id } = req.params;
    const { name, category, measurementUnit, measurementGender, sizeNotation, measurementFields, sizes, bodyShapes, isActive } = req.body;

    // Validate measurement unit if provided
    if (measurementUnit && !['cm', 'in'].includes(measurementUnit)) {
      return res.status(400).json({ error: 'Measurement unit must be "cm" or "in"' });
    }

    // Validate size notation if provided
    if (sizeNotation && !['US', 'UK', 'EU', 'AU', 'JP', 'CN'].includes(sizeNotation)) {
      return res.status(400).json({ error: 'Invalid size notation' });
    }

    // Validate category if provided
    if (category && !PRODUCT_CATEGORIES[category]) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Validate size notation if provided
    if (sizeNotation && !['US', 'UK', 'EU', 'AU', 'JP', 'CN'].includes(sizeNotation)) {
      return res.status(400).json({ error: 'Invalid size notation' });
    }

    try {
      const template = await updateTemplate(shopDomain, id, {
        name,
        category,
        measurementUnit,
        measurementGender,
        sizeNotation,
        measurementFields,
        sizes,
        bodyShapes,
        isActive,
      });

      logger.info('Template updated:', { shopDomain, templateId: id });
      res.json({ template });
    } catch (error) {
      if (error.message === 'Template not found') {
        return res.status(404).json({ error: error.message });
      }
      throw error;
    }
  })
);

/**
 * DELETE /api/templates/:id
 * Delete a template
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const shopDomain = res.locals.shopify.shopDomain;
    const { id } = req.params;

    try {
      await deleteTemplate(shopDomain, id);
      logger.info('Template deleted:', { shopDomain, templateId: id });
      res.json({ success: true });
    } catch (error) {
      if (error.message === 'Template not found') {
        return res.status(404).json({ error: error.message });
      }
      throw error;
    }
  })
);

export default router;

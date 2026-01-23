import { query } from '../config/database.js';
import { getTemplateForProduct, convertMeasurement } from './sizeTemplateService.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SizeRecommendation');

/**
 * Calculate size recommendation based on user inputs
 *
 * Algorithm:
 * 1. If user provides measurements, find closest match
 * 2. Apply body shape adjustment
 * 3. If between sizes, recommend size up
 */
export async function calculateRecommendation(shopDomain, productId, userInputs) {
  const { measurements, bodyShape, usualSize, preferredFit, measurementUnit } = userInputs;

  // Get template for this product
  const template = await getTemplateForProduct(shopDomain, productId);

  if (!template) {
    throw new Error('No size guide available for this product');
  }

  const sizes = template.sizes;
  const templateUnit = template.measurement_unit;
  const bodyShapes = template.body_shapes || [];

  // Find body shape adjustment
  let bodyShapeAdjustment = 0;
  if (bodyShape) {
    const shape = bodyShapes.find((s) => s.key === bodyShape);
    if (shape) {
      bodyShapeAdjustment = shape.adjustment || 0;
    }
  }

  // Fit preference adjustment
  let fitAdjustment = 0;
  if (preferredFit === 'loose') {
    fitAdjustment = 0.5;
  } else if (preferredFit === 'tight') {
    fitAdjustment = -0.5;
  }

  let recommendation = null;
  let confidence = 'medium';
  let reasoning = [];

  // If user provided measurements, use them for calculation
  if (measurements && Object.keys(measurements).length > 0) {
    const convertedMeasurements = {};

    // Convert user measurements to template unit if needed
    const userUnit = measurementUnit || 'cm';
    for (const [key, value] of Object.entries(measurements)) {
      if (value !== null && value !== undefined && value !== '') {
        convertedMeasurements[key] = convertMeasurement(parseFloat(value), userUnit, templateUnit);
      }
    }

    // Calculate fit score for each size
    const sizeScores = sizes.map((size) => {
      let score = 0;
      let fieldsMatched = 0;

      for (const [key, userValue] of Object.entries(convertedMeasurements)) {
        const sizeValue = size.measurements[key];
        if (sizeValue !== undefined && sizeValue !== null) {
          // Calculate how close the user measurement is to this size
          // Lower difference = better score
          const diff = Math.abs(userValue - sizeValue);
          const percentDiff = diff / sizeValue;

          // Score: 100 for exact match, decreasing with difference
          const fieldScore = Math.max(0, 100 - percentDiff * 200);
          score += fieldScore;
          fieldsMatched++;
        }
      }

      return {
        size: size.name,
        score: fieldsMatched > 0 ? score / fieldsMatched : 0,
        fieldsMatched,
      };
    });

    // Sort by score (highest first)
    sizeScores.sort((a, b) => b.score - a.score);

    if (sizeScores.length > 0 && sizeScores[0].score > 0) {
      const bestMatch = sizeScores[0];
      const secondBest = sizeScores[1];

      // Apply adjustments
      let adjustedIndex = sizes.findIndex((s) => s.name === bestMatch.size);
      const totalAdjustment = bodyShapeAdjustment + fitAdjustment;

      if (totalAdjustment > 0.5 && adjustedIndex < sizes.length - 1) {
        adjustedIndex++;
        reasoning.push('Sized up based on body shape and fit preference');
      } else if (totalAdjustment < -0.5 && adjustedIndex > 0) {
        adjustedIndex--;
        reasoning.push('Sized down based on body shape and fit preference');
      }

      recommendation = sizes[adjustedIndex].name;

      // Determine confidence
      if (bestMatch.score > 80) {
        confidence = 'high';
        reasoning.push('Measurements closely match this size');
      } else if (bestMatch.score > 60) {
        confidence = 'medium';
        if (secondBest && Math.abs(bestMatch.score - secondBest.score) < 10) {
          reasoning.push(`You're between ${bestMatch.size} and ${secondBest.size}`);
        }
      } else {
        confidence = 'low';
        reasoning.push('Measurements are outside typical ranges - consider trying on');
      }
    }
  }

  // If no measurements or couldn't calculate, use usual size as starting point
  if (!recommendation && usualSize) {
    // Try to find a matching or similar size
    const exactMatch = sizes.find(
      (s) => s.name.toLowerCase() === usualSize.toLowerCase()
    );

    if (exactMatch) {
      let adjustedIndex = sizes.findIndex((s) => s.name === exactMatch.name);
      const totalAdjustment = bodyShapeAdjustment + fitAdjustment;

      if (totalAdjustment > 0.5 && adjustedIndex < sizes.length - 1) {
        adjustedIndex++;
        reasoning.push('Sized up from your usual size based on body shape');
      } else if (totalAdjustment < -0.5 && adjustedIndex > 0) {
        adjustedIndex--;
        reasoning.push('Sized down from your usual size based on body shape');
      } else {
        reasoning.push('Based on your usual size');
      }

      recommendation = sizes[adjustedIndex].name;
      confidence = 'medium';
    } else {
      // Try partial match (e.g., "Medium" matches "M")
      const sizeMap = {
        xs: ['xs', 'extra small', 'xsmall'],
        s: ['s', 'small', 'sm'],
        m: ['m', 'medium', 'med'],
        l: ['l', 'large', 'lg'],
        xl: ['xl', 'extra large', 'xlarge'],
        xxl: ['xxl', '2xl', 'extra extra large'],
      };

      const normalizedUsual = usualSize.toLowerCase().trim();
      let matchedSize = null;

      for (const size of sizes) {
        const normalizedSize = size.name.toLowerCase().trim();

        for (const [key, aliases] of Object.entries(sizeMap)) {
          if (aliases.includes(normalizedUsual) && aliases.includes(normalizedSize)) {
            matchedSize = size;
            break;
          }
        }
        if (matchedSize) break;
      }

      if (matchedSize) {
        recommendation = matchedSize.name;
        confidence = 'medium';
        reasoning.push('Matched based on standard size conversion');
      }
    }
  }

  // Fallback: recommend middle size
  if (!recommendation && sizes.length > 0) {
    const middleIndex = Math.floor(sizes.length / 2);
    recommendation = sizes[middleIndex].name;
    confidence = 'low';
    reasoning.push('Unable to determine best size - showing most common size');
  }

  // Log recommendation for analytics
  await logRecommendation(shopDomain, template.id, productId, recommendation, userInputs);

  return {
    recommendedSize: recommendation,
    confidence,
    reasoning,
    availableSizes: sizes.map((s) => s.name),
    template: {
      name: template.name,
      category: template.category,
      measurementUnit: templateUnit,
    },
  };
}

/**
 * Log recommendation for analytics
 */
async function logRecommendation(shopDomain, templateId, productId, recommendedSize, userInputs) {
  try {
    await query(
      `INSERT INTO size_recommendations (shop_domain, template_id, product_id, recommended_size, user_inputs)
       VALUES ($1, $2, $3, $4, $5)`,
      [shopDomain, templateId, productId, recommendedSize, JSON.stringify(userInputs)]
    );

    // Update analytics
    const today = new Date().toISOString().split('T')[0];
    await query(
      `INSERT INTO analytics (shop_domain, product_id, event_type, event_date, count)
       VALUES ($1, $2, 'recommendation_made', $3, 1)
       ON CONFLICT (shop_domain, product_id, event_type, event_date)
       DO UPDATE SET count = analytics.count + 1`,
      [shopDomain, productId, today]
    );
  } catch (error) {
    logger.error('Failed to log recommendation:', error);
    // Don't throw - logging failure shouldn't break the recommendation
  }
}

/**
 * Get size chart for a product (public endpoint)
 */
export async function getSizeChart(shopDomain, productId, displayUnit = null) {
  const template = await getTemplateForProduct(shopDomain, productId);

  if (!template) {
    return null;
  }

  const templateUnit = template.measurement_unit;
  const outputUnit = displayUnit || templateUnit;

  // Convert sizes to requested unit
  const sizes = template.sizes.map((size) => {
    const convertedMeasurements = {};

    for (const [key, value] of Object.entries(size.measurements)) {
      if (value !== null && value !== undefined) {
        convertedMeasurements[key] = convertMeasurement(value, templateUnit, outputUnit);
      }
    }

    return {
      name: size.name,
      measurements: convertedMeasurements,
    };
  });

  return {
    templateName: template.name,
    category: template.category,
    measurementUnit: outputUnit,
    measurementGender: template.measurement_gender,
    sizeNotation: template.size_notation || 'US',
    measurementFields: template.measurement_fields,
    sizes,
    bodyShapes: template.body_shapes,
  };
}

export default {
  calculateRecommendation,
  getSizeChart,
};

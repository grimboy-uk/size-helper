import cron from 'node-cron';
import { query } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Cleanup');

// Retention period in days (configurable via env var)
const RETENTION_DAYS = Number.parseInt(process.env.ANALYTICS_RETENTION_DAYS, 10) || 30;

/**
 * Start the cleanup scheduler
 * Runs daily at 3:00 AM UTC to clean up old analytics data
 */
export function startCleanupScheduler() {
  // Run daily at 3:00 AM UTC
  cron.schedule('0 3 * * *', async () => {
    logger.info('Starting scheduled cleanup...');
    await cleanupOldData();
  });

  logger.info(`Cleanup scheduler started (retention: ${RETENTION_DAYS} days, runs daily at 3:00 AM UTC)`);
}

/**
 * Clean up old analytics and recommendation data
 * Deletes records older than RETENTION_DAYS
 */
export async function cleanupOldData() {
  const startTime = Date.now();

  try {
    // Delete old analytics records (aggregated daily counts)
    const analyticsResult = await query(
      `DELETE FROM analytics WHERE event_date < CURRENT_DATE - INTERVAL '${RETENTION_DAYS} days'`
    );

    // Delete old size_recommendations records (individual recommendation logs)
    const recommendationsResult = await query(
      `DELETE FROM size_recommendations WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`
    );

    const duration = Date.now() - startTime;

    logger.info('Cleanup completed', {
      analyticsDeleted: analyticsResult.rowCount,
      recommendationsDeleted: recommendationsResult.rowCount,
      retentionDays: RETENTION_DAYS,
      durationMs: duration,
    });

    return {
      analyticsDeleted: analyticsResult.rowCount,
      recommendationsDeleted: recommendationsResult.rowCount,
    };
  } catch (error) {
    logger.error('Cleanup failed:', error);
    throw error;
  }
}

export default {
  startCleanupScheduler,
  cleanupOldData,
};

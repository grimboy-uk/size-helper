import pg from 'pg';
import { createLogger } from '../utils/logger.js';

const { Pool, types } = pg;
const logger = createLogger('Database');

// Fix for DATE type timezone issue:
// By default, pg parses DATE as a JS Date at midnight UTC, which can shift dates
// when interpreted in local timezone. Override to return DATE as string 'YYYY-MM-DD'.
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (val) => val);

// Create connection pool lazily
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    logger.info('Creating database pool');

    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    pool.on('connect', () => {
      logger.debug('New client connected to database');
    });

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  return pool;
}

/**
 * Initialize database schema
 */
export async function initializeDatabase() {
  const dbPool = getPool();
  const client = await dbPool.connect();

  try {
    logger.info('Initializing database schema...');

    // Shops table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shops (
        id SERIAL PRIMARY KEY,
        shop_domain VARCHAR(255) UNIQUE NOT NULL,
        access_token TEXT,
        scope TEXT,
        subscription_tier VARCHAR(50) DEFAULT 'FREE',
        subscription_id VARCHAR(255),
        billing_cycle_start DATE,
        billing_cycle_end DATE,
        billing_interval VARCHAR(20) DEFAULT 'MONTHLY',
        trial_used_at TIMESTAMP DEFAULT NULL,
        product_type_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Size templates table - defines measurement templates for product types
    await client.query(`
      CREATE TABLE IF NOT EXISTS size_templates (
        id SERIAL PRIMARY KEY,
        shop_domain VARCHAR(255) NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        measurement_unit VARCHAR(10) DEFAULT 'cm',
        measurement_gender VARCHAR(20) DEFAULT 'unisex',
        size_notation VARCHAR(10) DEFAULT 'UK',
        button_color VARCHAR(20) DEFAULT '#008060',
        measurement_fields JSONB NOT NULL DEFAULT '[]',
        sizes JSONB NOT NULL DEFAULT '[]',
        body_shapes JSONB DEFAULT '[]',
        include_size_helper BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(shop_domain, name)
      )
    `);

    // Add include_size_helper column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'size_templates' AND column_name = 'include_size_helper'
        ) THEN
          ALTER TABLE size_templates ADD COLUMN include_size_helper BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);

    // Add illustration_type column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'size_templates' AND column_name = 'illustration_type'
        ) THEN
          ALTER TABLE size_templates ADD COLUMN illustration_type VARCHAR(50);
        END IF;
      END $$;
    `);

    // Product assignments table - links products to size templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_assignments (
        id SERIAL PRIMARY KEY,
        shop_domain VARCHAR(255) NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
        template_id INTEGER NOT NULL REFERENCES size_templates(id) ON DELETE CASCADE,
        product_id BIGINT NOT NULL,
        product_title VARCHAR(500),
        product_handle VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(shop_domain, product_id)
      )
    `);

    // Size recommendations log - for analytics
    await client.query(`
      CREATE TABLE IF NOT EXISTS size_recommendations (
        id SERIAL PRIMARY KEY,
        shop_domain VARCHAR(255) NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
        template_id INTEGER REFERENCES size_templates(id) ON DELETE SET NULL,
        product_id BIGINT,
        recommended_size VARCHAR(50),
        user_inputs JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Analytics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        shop_domain VARCHAR(255) NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
        product_id BIGINT,
        event_type VARCHAR(50) NOT NULL,
        event_date DATE NOT NULL,
        count INTEGER DEFAULT 1,
        UNIQUE(shop_domain, product_id, event_type, event_date)
      )
    `);

    await client.query(`
      ALTER TABLE analytics ADD COLUMN IF NOT EXISTS value DECIMAL(12,2);
      ALTER TABLE shops ADD COLUMN IF NOT EXISTS partner_id VARCHAR(32);
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_size_templates_shop ON size_templates(shop_domain);
      CREATE INDEX IF NOT EXISTS idx_product_assignments_shop ON product_assignments(shop_domain);
      CREATE INDEX IF NOT EXISTS idx_product_assignments_product ON product_assignments(product_id);
      CREATE INDEX IF NOT EXISTS idx_size_recommendations_shop ON size_recommendations(shop_domain);
      CREATE INDEX IF NOT EXISTS idx_analytics_shop_date ON analytics(shop_domain, event_date);
    `);

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a query with parameters
 */
export async function query(text, params) {
  const dbPool = getPool();
  const start = Date.now();
  try {
    const result = await dbPool.query(text, params);
    const duration = Date.now() - start;
    logger.db(`Query executed in ${duration}ms`, { rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Query error:', { text, error: error.message });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient() {
  const dbPool = getPool();
  return dbPool.connect();
}

export default { getPool, query, getClient, initializeDatabase };

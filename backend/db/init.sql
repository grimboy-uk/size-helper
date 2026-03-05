--
-- RMS Size Helper - Database Schema
-- Consolidated build script for Railway PostgreSQL
--
-- Run this script to initialize a fresh database with all tables,
-- constraints, and indexes.
--

-- ============================================================================
-- TABLES
-- ============================================================================

-- Shops table - stores shop information and subscription details
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
);

-- Size templates table - defines measurement templates for product types
CREATE TABLE IF NOT EXISTS size_templates (
    id SERIAL PRIMARY KEY,
    shop_domain VARCHAR(255) NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    measurement_unit VARCHAR(10) DEFAULT 'cm',
    measurement_gender VARCHAR(20) DEFAULT 'unisex',
    size_notation VARCHAR(10) DEFAULT 'UK',
    button_color VARCHAR(20) DEFAULT '#008060',
    button_border_radius INTEGER DEFAULT 8,
    measurement_fields JSONB NOT NULL DEFAULT '[]',
    sizes JSONB NOT NULL DEFAULT '[]',
    body_shapes JSONB DEFAULT '[]',
    include_size_helper BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shop_domain, name)
);

-- Product assignments table - links products to size templates
CREATE TABLE IF NOT EXISTS product_assignments (
    id SERIAL PRIMARY KEY,
    shop_domain VARCHAR(255) NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
    template_id INTEGER NOT NULL REFERENCES size_templates(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    product_title VARCHAR(500),
    product_handle VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shop_domain, product_id)
);

-- Size recommendations table - logs individual size recommendations for analytics
CREATE TABLE IF NOT EXISTS size_recommendations (
    id SERIAL PRIMARY KEY,
    shop_domain VARCHAR(255) NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
    template_id INTEGER REFERENCES size_templates(id) ON DELETE SET NULL,
    product_id BIGINT,
    recommended_size VARCHAR(50),
    user_inputs JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics table - aggregated event counts per day
CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    shop_domain VARCHAR(255) NOT NULL REFERENCES shops(shop_domain) ON DELETE CASCADE,
    product_id BIGINT,
    event_type VARCHAR(50) NOT NULL,
    event_date DATE NOT NULL,
    count INTEGER DEFAULT 1,
    UNIQUE(shop_domain, product_id, event_type, event_date)
);

-- Shopify sessions table - managed by @shopify/shopify-app-session-storage-postgresql
-- This table is auto-created by the Shopify session storage package
CREATE TABLE IF NOT EXISTS shopify_sessions (
    id VARCHAR(255) PRIMARY KEY,
    shop VARCHAR(255) NOT NULL,
    state VARCHAR(255) NOT NULL,
    "isOnline" BOOLEAN NOT NULL,
    scope VARCHAR(1024),
    expires INTEGER,
    "onlineAccessInfo" VARCHAR(255),
    "accessToken" VARCHAR(255)
);

-- Shopify sessions migrations table - tracks applied migrations
CREATE TABLE IF NOT EXISTS shopify_sessions_migrations (
    migration_name VARCHAR(255) PRIMARY KEY
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_size_templates_shop ON size_templates(shop_domain);
CREATE INDEX IF NOT EXISTS idx_product_assignments_shop ON product_assignments(shop_domain);
CREATE INDEX IF NOT EXISTS idx_product_assignments_product ON product_assignments(product_id);
CREATE INDEX IF NOT EXISTS idx_size_recommendations_shop ON size_recommendations(shop_domain);
CREATE INDEX IF NOT EXISTS idx_analytics_shop_date ON analytics(shop_domain, event_date);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE shops IS 'Stores Shopify shop information and subscription details';
COMMENT ON TABLE size_templates IS 'Size chart templates with measurement fields and size data';
COMMENT ON TABLE product_assignments IS 'Links products to their assigned size templates';
COMMENT ON TABLE size_recommendations IS 'Individual size recommendation logs for detailed analytics';
COMMENT ON TABLE analytics IS 'Aggregated daily event counts (size_guide_opened, recommendation_made)';
COMMENT ON TABLE shopify_sessions IS 'Shopify OAuth session storage (managed by Shopify SDK)';

COMMENT ON COLUMN size_templates.include_size_helper IS 'When false, only shows size chart without the Find My Size questionnaire';
COMMENT ON COLUMN analytics.event_type IS 'Event types: size_guide_opened, recommendation_made';

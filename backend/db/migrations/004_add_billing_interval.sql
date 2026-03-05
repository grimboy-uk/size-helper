-- Add billing_interval column to shops table
-- Supports 'MONTHLY' or 'ANNUAL' billing intervals

ALTER TABLE shops ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(20) DEFAULT 'MONTHLY';

-- Add trial_used_at column to track when shop first used a trial (prevents trial abuse on reinstall)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS trial_used_at TIMESTAMP DEFAULT NULL;

-- Update existing STARTUP tier references to FREE (legacy tier migration)
UPDATE shops SET subscription_tier = 'FREE' WHERE subscription_tier = 'STARTUP';
UPDATE shops SET subscription_tier = 'GROWTH' WHERE subscription_tier = 'MICRO_ENTERPRISE';
UPDATE shops SET subscription_tier = 'PROFESSIONAL' WHERE subscription_tier = 'SMALL_BUSINESS';

-- Change the default value for subscription_tier from STARTUP to FREE
ALTER TABLE shops ALTER COLUMN subscription_tier SET DEFAULT 'FREE';

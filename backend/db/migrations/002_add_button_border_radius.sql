-- Migration: Add button_border_radius column to size_templates table
-- This column stores the corner radius (in pixels) for buttons in the size guide modal

ALTER TABLE size_templates
ADD COLUMN IF NOT EXISTS button_border_radius INTEGER DEFAULT 8;

COMMENT ON COLUMN size_templates.button_border_radius IS 'Corner radius in pixels for buttons in the size guide modal (0-24)';

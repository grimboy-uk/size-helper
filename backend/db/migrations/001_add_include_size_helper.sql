--
-- Migration: Add include_size_helper column to size_templates
-- This migration adds support for "Size Chart Only" templates
--

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'size_templates' AND column_name = 'include_size_helper'
    ) THEN
        ALTER TABLE size_templates ADD COLUMN include_size_helper BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added include_size_helper column to size_templates';
    ELSE
        RAISE NOTICE 'Column include_size_helper already exists';
    END IF;
END $$;

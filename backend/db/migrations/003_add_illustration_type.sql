-- Migration: Add illustration_type column to size_templates table
-- Date: 2026-02-01
-- Description: Adds support for selecting clothing illustration type per template
--
-- Valid illustration_type values:
--   Tops: 'top-jumper', 'top-polo-tee', 'top-shirt-long-sleeve', 'top-blouse'
--   Bottoms: 'bottom-trousers', 'bottom-shorts'
--   Footwear: 'shoe'

-- Add illustration_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'size_templates' AND column_name = 'illustration_type'
  ) THEN
    ALTER TABLE size_templates ADD COLUMN illustration_type VARCHAR(50);

    -- Set default values for existing templates based on category
    UPDATE size_templates
    SET illustration_type = CASE
      WHEN category = 'TOPS' THEN 'top-jumper'
      WHEN category = 'BOTTOMS' THEN 'bottom-trousers'
      WHEN category = 'DRESSES' THEN 'top-blouse'
      WHEN category = 'OUTERWEAR' THEN 'top-jumper'
      WHEN category = 'FOOTWEAR' THEN 'shoe'
      ELSE 'top-jumper'
    END
    WHERE illustration_type IS NULL;

    RAISE NOTICE 'Added illustration_type column to size_templates table';
  ELSE
    RAISE NOTICE 'illustration_type column already exists in size_templates table';
  END IF;
END $$;

-- Add comment to document the column
COMMENT ON COLUMN size_templates.illustration_type IS 'The clothing illustration to display in the size guide modal (e.g., top-jumper, top-blouse, bottom-trousers)';

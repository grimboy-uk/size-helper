-- ================================================================
-- Demo analytics data for reedmace-3.myshopify.com
-- Shows the full potential of the analytics view.
--
-- Safe to re-run — uses ON CONFLICT where possible.
-- Run with:  psql $DATABASE_URL -f scripts/seed-demo-analytics.sql
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Shop record — ENTERPRISE tier gives full analytics access
-- ----------------------------------------------------------------
INSERT INTO shops (shop_domain, access_token, subscription_tier, scope)
VALUES (
  'reedmace-3.myshopify.com',
  'shpua_demo_token_placeholder',
  'ENTERPRISE',
  'read_products,write_products'
)
ON CONFLICT (shop_domain) DO UPDATE
  SET subscription_tier = 'ENTERPRISE',
      updated_at        = NOW();

-- ----------------------------------------------------------------
-- 2. Size templates
-- ----------------------------------------------------------------
INSERT INTO size_templates (
  shop_domain, name, category, measurement_unit, measurement_gender,
  size_notation, include_size_helper, is_active, sizes, measurement_fields, body_shapes
)
VALUES
  (
    'reedmace-3.myshopify.com', 'Men''s Casual Tops', 'tops', 'cm', 'male', 'UK', true, true,
    '["XS","S","M","L","XL","XXL","3XL"]',
    '[{"key":"chest","label":"Chest","hint":"Measure around the fullest part of your chest"},{"key":"waist","label":"Waist","hint":"Measure around your natural waistline"}]',
    '["slim","regular","athletic","broad"]'
  ),
  (
    'reedmace-3.myshopify.com', 'Men''s Bottoms', 'bottoms', 'cm', 'male', 'UK', true, true,
    '["28","30","32","34","36","38","40"]',
    '[{"key":"waist","label":"Waist","hint":"Measure around your natural waistline"},{"key":"hips","label":"Hips","hint":"Measure around the fullest part of your hips"},{"key":"inseam","label":"Inseam","hint":"Measure from crotch to ankle"}]',
    '["slim","regular","athletic","broad"]'
  ),
  (
    'reedmace-3.myshopify.com', 'Women''s Activewear', 'activewear', 'cm', 'female', 'UK', true, true,
    '["XS","S","M","L","XL","XXL"]',
    '[{"key":"bust","label":"Bust","hint":"Measure around the fullest part of your bust"},{"key":"waist","label":"Waist","hint":"Measure around your natural waistline"},{"key":"hips","label":"Hips","hint":"Measure around the fullest part of your hips"}]',
    '["petite","regular","tall","athletic"]'
  )
ON CONFLICT (shop_domain, name) DO NOTHING;

-- ----------------------------------------------------------------
-- 3. Product assignments
-- ----------------------------------------------------------------
WITH tpl AS (
  SELECT id, name FROM size_templates WHERE shop_domain = 'reedmace-3.myshopify.com'
)
INSERT INTO product_assignments (shop_domain, product_id, product_title, product_handle, template_id)
SELECT v.shop_domain, v.product_id, v.product_title, v.product_handle, tpl.id
FROM (VALUES
  ('reedmace-3.myshopify.com', 9000000001::bigint, 'Classic Cotton Hoodie',      'classic-cotton-hoodie',      'Men''s Casual Tops'),
  ('reedmace-3.myshopify.com', 9000000002::bigint, 'Slim Fit Chinos',             'slim-fit-chinos',            'Men''s Bottoms'),
  ('reedmace-3.myshopify.com', 9000000003::bigint, 'Relaxed Linen Shirt',         'relaxed-linen-shirt',        'Men''s Casual Tops'),
  ('reedmace-3.myshopify.com', 9000000004::bigint, 'Sports Performance Jacket',   'sports-performance-jacket',  'Men''s Casual Tops'),
  ('reedmace-3.myshopify.com', 9000000005::bigint, 'Women''s Yoga Leggings',      'womens-yoga-leggings',       'Women''s Activewear'),
  ('reedmace-3.myshopify.com', 9000000006::bigint, 'Oversized Crew Sweatshirt',   'oversized-crew-sweatshirt',  'Men''s Casual Tops')
) AS v(shop_domain, product_id, product_title, product_handle, template_name)
JOIN tpl ON tpl.name = v.template_name
ON CONFLICT (shop_domain, product_id) DO NOTHING;

-- ----------------------------------------------------------------
-- 4. Analytics — 90 days of per-product funnel data
--
-- Growth: 0.55x at day 0 → 1.45x at day 89 (~+40% trend over last 30d)
-- Funnel rates: 63% open→rec, 37% rec→cart, 52% cart→purchase
-- Revenue per purchase: £48–60 (varies by day)
-- ----------------------------------------------------------------
WITH
date_series AS (
  SELECT
    d::date                                    AS event_date,
    (89 - (CURRENT_DATE - d::date))::float     AS day_offset  -- 0=oldest, 89=yesterday
  FROM generate_series(
    CURRENT_DATE - INTERVAL '90 days',
    CURRENT_DATE - INTERVAL '1 day',
    INTERVAL '1 day'
  ) d
),
products (product_id, base_opens, seed) AS (
  VALUES
    (9000000001::bigint, 13, 1.70),
    (9000000002::bigint,  9, 2.30),
    (9000000003::bigint,  8, 3.10),
    (9000000004::bigint,  6, 4.20),
    (9000000005::bigint,  4, 5.50),
    (9000000006::bigint,  3, 6.80)
),
computed AS (
  SELECT
    d.event_date,
    p.product_id,
    -- opens: grows from 55% to 145% of base, with a natural daily ripple
    GREATEST(1, ROUND(
      p.base_opens
      * (0.55 + (d.day_offset / 89.0) * 0.90)
      * (0.80 + 0.35 * ABS(SIN(d.day_offset * 1.7 + p.seed)))
    )::int) AS opens,
    GREATEST(0, ROUND(
      p.base_opens
      * (0.55 + (d.day_offset / 89.0) * 0.90)
      * (0.80 + 0.35 * ABS(SIN(d.day_offset * 1.7 + p.seed)))
      * 0.63
    )::int) AS recs,
    GREATEST(0, ROUND(
      p.base_opens
      * (0.55 + (d.day_offset / 89.0) * 0.90)
      * (0.80 + 0.35 * ABS(SIN(d.day_offset * 1.7 + p.seed)))
      * 0.63 * 0.37
    )::int) AS carts,
    GREATEST(0, ROUND(
      p.base_opens
      * (0.55 + (d.day_offset / 89.0) * 0.90)
      * (0.80 + 0.35 * ABS(SIN(d.day_offset * 1.7 + p.seed)))
      * 0.63 * 0.37 * 0.52
    )::int) AS purchases,
    GREATEST(0.00, ROUND((
      p.base_opens
      * (0.55 + (d.day_offset / 89.0) * 0.90)
      * (0.80 + 0.35 * ABS(SIN(d.day_offset * 1.7 + p.seed)))
      * 0.63 * 0.37 * 0.52
      * (32.0 + 12.0 * ABS(SIN(d.day_offset * 0.5 + p.seed * 2)))  -- £32-44 per purchase
    )::numeric, 2)) AS revenue
  FROM date_series d CROSS JOIN products p
),
all_events AS (
  SELECT product_id, event_date, 'size_guide_opened'     AS event_type, opens     AS cnt, NULL::numeric(12,2) AS val FROM computed WHERE opens    > 0
  UNION ALL
  SELECT product_id, event_date, 'recommendation_made'   AS event_type, recs      AS cnt, NULL               AS val FROM computed WHERE recs     > 0
  UNION ALL
  SELECT product_id, event_date, 'add_to_cart_after_rec' AS event_type, carts     AS cnt, NULL               AS val FROM computed WHERE carts    > 0
  UNION ALL
  SELECT product_id, event_date, 'purchase_attributed'   AS event_type, purchases AS cnt, revenue            AS val FROM computed WHERE purchases > 0
)
INSERT INTO analytics (shop_domain, product_id, event_type, event_date, count, value)
SELECT 'reedmace-3.myshopify.com', product_id, event_type, event_date, cnt, val
FROM all_events
ON CONFLICT (shop_domain, product_id, event_type, event_date)
DO UPDATE SET count = EXCLUDED.count, value = EXCLUDED.value;

-- ----------------------------------------------------------------
-- 5. Recent recommendation log (powers the "Recent Recommendations"
--    table — 20 entries spread across the last 14 days)
-- ----------------------------------------------------------------
DELETE FROM size_recommendations
WHERE shop_domain = 'reedmace-3.myshopify.com';

WITH tpl AS (
  SELECT id, name FROM size_templates WHERE shop_domain = 'reedmace-3.myshopify.com'
),
entries (product_id, template_name, recommended_size, user_inputs, hours_ago) AS (
  VALUES
    (9000000001::bigint, 'Men''s Casual Tops', 'M',   '{"chest":96,"waist":82,"bodyShape":"regular","fitPreference":"regular"}',   2),
    (9000000005::bigint, 'Women''s Activewear','M',   '{"bust":88,"waist":70,"hips":95,"bodyShape":"regular"}',                    5),
    (9000000002::bigint, 'Men''s Bottoms',     '32',  '{"waist":83,"hips":95,"inseam":81,"bodyShape":"regular"}',                  9),
    (9000000001::bigint, 'Men''s Casual Tops', 'L',   '{"chest":104,"waist":90,"bodyShape":"athletic","fitPreference":"relaxed"}', 14),
    (9000000003::bigint, 'Men''s Casual Tops', 'M',   '{"chest":97,"waist":83,"bodyShape":"slim","fitPreference":"regular"}',      21),
    (9000000005::bigint, 'Women''s Activewear','S',   '{"bust":82,"waist":64,"hips":88,"bodyShape":"petite"}',                    28),
    (9000000004::bigint, 'Men''s Casual Tops', 'L',   '{"chest":102,"waist":87,"bodyShape":"regular","fitPreference":"regular"}',  36),
    (9000000006::bigint, 'Men''s Casual Tops', 'XXL', '{"chest":118,"waist":104,"bodyShape":"broad","fitPreference":"relaxed"}',   45),
    (9000000002::bigint, 'Men''s Bottoms',     '34',  '{"waist":87,"hips":99,"inseam":82,"bodyShape":"athletic"}',                 52),
    (9000000001::bigint, 'Men''s Casual Tops', 'XL',  '{"chest":112,"waist":98,"bodyShape":"broad","fitPreference":"regular"}',    61),
    (9000000005::bigint, 'Women''s Activewear','L',   '{"bust":96,"waist":78,"hips":103,"bodyShape":"athletic"}',                  72),
    (9000000003::bigint, 'Men''s Casual Tops', 'L',   '{"chest":104,"waist":88,"bodyShape":"regular","fitPreference":"relaxed"}',  84),
    (9000000001::bigint, 'Men''s Casual Tops', 'S',   '{"chest":88,"waist":76,"bodyShape":"slim","fitPreference":"slim"}',         98),
    (9000000002::bigint, 'Men''s Bottoms',     '30',  '{"waist":78,"hips":90,"inseam":79,"bodyShape":"slim"}',                   115),
    (9000000004::bigint, 'Men''s Casual Tops', 'XL',  '{"chest":108,"waist":94,"bodyShape":"athletic","fitPreference":"regular"}',130),
    (9000000005::bigint, 'Women''s Activewear','XL',  '{"bust":103,"waist":84,"hips":110,"bodyShape":"tall"}',                   148),
    (9000000006::bigint, 'Men''s Casual Tops', 'L',   '{"chest":105,"waist":90,"bodyShape":"regular","fitPreference":"relaxed"}', 168),
    (9000000002::bigint, 'Men''s Bottoms',     '36',  '{"waist":92,"hips":105,"inseam":83,"bodyShape":"broad"}',                 192),
    (9000000001::bigint, 'Men''s Casual Tops', 'M',   '{"chest":98,"waist":84,"bodyShape":"regular","fitPreference":"slim"}',    216),
    (9000000005::bigint, 'Women''s Activewear','M',   '{"bust":91,"waist":72,"hips":98,"bodyShape":"regular"}',                  240)
)
INSERT INTO size_recommendations (shop_domain, product_id, template_id, recommended_size, user_inputs, created_at)
SELECT
  'reedmace-3.myshopify.com',
  e.product_id,
  tpl.id,
  e.recommended_size,
  e.user_inputs::jsonb,
  NOW() - (e.hours_ago * INTERVAL '1 hour')
FROM entries e
JOIN tpl ON tpl.name = e.template_name;

COMMIT;

-- ----------------------------------------------------------------
-- Verify what was inserted
-- ----------------------------------------------------------------
SELECT 'shops' AS tbl, COUNT(*) FROM shops WHERE shop_domain = 'reedmace-3.myshopify.com'
UNION ALL SELECT 'size_templates',    COUNT(*) FROM size_templates    WHERE shop_domain = 'reedmace-3.myshopify.com'
UNION ALL SELECT 'product_assignments',COUNT(*) FROM product_assignments WHERE shop_domain = 'reedmace-3.myshopify.com'
UNION ALL SELECT 'analytics rows',    COUNT(*) FROM analytics         WHERE shop_domain = 'reedmace-3.myshopify.com'
UNION ALL SELECT 'size_recommendations',COUNT(*) FROM size_recommendations WHERE shop_domain = 'reedmace-3.myshopify.com';

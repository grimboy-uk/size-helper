# Database Scripts

This directory contains SQL scripts for managing the RMS Size Helper database.

## Files

### `init.sql`
Complete database schema for initializing a fresh PostgreSQL database. Use this when:
- Setting up a new Railway deployment
- Creating a local development database
- Resetting the database from scratch

**Usage on Railway:**
1. Go to your Railway project
2. Select the PostgreSQL service
3. Go to the "Data" tab
4. Click "Query" and paste the contents of `init.sql`
5. Execute the query

**Usage locally:**
```bash
psql $DATABASE_URL < db/init.sql
```

### `migrations/`
Individual migration scripts for updating existing databases. Each migration is idempotent (safe to run multiple times).

**Current migrations:**
- `001_add_include_size_helper.sql` - Adds the `include_size_helper` column for "Size Chart Only" templates

## Schema Overview

| Table | Description |
|-------|-------------|
| `shops` | Shop information and subscription details |
| `size_templates` | Size chart templates with measurements and sizes |
| `product_assignments` | Links products to size templates |
| `size_recommendations` | Individual recommendation logs |
| `analytics` | Aggregated daily event counts |
| `shopify_sessions` | OAuth sessions (managed by Shopify SDK) |

## Notes

- The app's `initializeDatabase()` function in `src/config/database.js` automatically creates tables on startup using `CREATE TABLE IF NOT EXISTS`
- For fresh deployments, you can either run `init.sql` manually or let the app create tables automatically
- Migrations should be run manually when updating existing production databases

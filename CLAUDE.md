# RMS Size Helper — Project Guide

> **Context:** See `~/.claude/CLAUDE.md` for company/brand info and `workspace/CLAUDE.md` for cross-project patterns.
> **Shared skills:** `rms-shopify-auth`, `rms-billing`, `rms-webhooks`, `rms-brevo`, `rms-railway`

Embedded Shopify app that adds interactive size charts and a guided "Find My Size" questionnaire to product pages.

- **Production:** https://size-helper.reedmace.net
- **Shopify API version:** 2025-01

## Tech Stack

- **Backend:** Node.js (ES modules), Express, PostgreSQL
- **Frontend:** Server-rendered HTML templates, vanilla JS (no React)
- **Shopify:** `@shopify/shopify-app-express` v5, App Bridge v4, Shopify Billing API (GraphQL)
- **Storefront:** Shopify Theme App Extension (Liquid + vanilla JS)
- **Hosting:** Railway (nixpacks.toml)

## Project Structure

```
backend/src/
  index.js                 # Express app, routes, auth flow
  config/database.js       # PostgreSQL pool, schema init (CREATE TABLE IF NOT EXISTS)
  middleware/
    verifyShop.js          # JWT auth for API + page requests
    errorHandler.js
    subscriptionCheck.js   # Tier-gated feature enforcement
  routes/
    templates.js           # CRUD for size templates
    products.js            # Product-to-template assignment
    billing.js             # Subscription management + callback
    analytics.js
    public.js              # Unauthenticated storefront API
    webhooks.js            # APP_UNINSTALLED + GDPR
  services/
    billingService.js      # Tier definitions, billing mutations, subscription CRUD
    sizeTemplateService.js # Template CRUD, size notation conversions, measurement conversion
    sizeRecommendationService.js  # "Find My Size" algorithm
    webhookService.js
    cleanupService.js      # Daily 3am UTC analytics retention cleanup
  utils/
    authHelpers.js         # Client-side JS: App Bridge init, authenticated fetch, toast
    shopifyGraphql.js      # Shopify GraphQL wrapper with 401 retry via token exchange
    logger.js              # Structured logger with emoji prefixes
    templateLoader.js      # HTML template loader with {{variable}} replacement
    asyncHandler.js        # Express async error wrapper
  views/                   # dashboard.html, templates.html, products.html, analytics.html, settings.html
extensions/size-guide-widget/
  blocks/size-guide.liquid # Storefront widget (size chart + Find My Size)
  shopify.extension.toml
  assets/                  # Clothing illustrations, body shape images
shopify.app.toml
nixpacks.toml
```

## Auth Architecture

Two auth strategies coexist — see `rms-shopify-auth` skill for the general pattern.

**Sizer-specific:**
- Root route `/` uses `shopify.ensureInstalledOnShop()` → redirects to `/exitiframe` (no hyphen, library-hardcoded)
- Page requests use `verifyShopDocument` middleware → redirects to `/auth/exit-iframe` (with hyphen)
- **Both paths need route handlers** — they are different

## Billing Plans

4 tiers: FREE, GROWTH ($9/mo), PROFESSIONAL ($19/mo), ENTERPRISE ($49/mo). Annual at ~20% discount, 7-day trial.

**Legacy tier name mapping** (handled by `normalizeTierKey()`):
- `STARTUP` → `FREE`
- `MICRO_ENTERPRISE` → `GROWTH`
- `SMALL_BUSINESS` → `PROFESSIONAL`

| Feature | FREE | GROWTH | PROFESSIONAL | ENTERPRISE |
|---|---|---|---|---|
| Size chart templates | 3 | 15 | 50 | Unlimited |
| Size Helper templates | 1 | 10 | 35 | Unlimited |
| Recommendations/month | 50 | 500 | Unlimited | Unlimited |
| Analytics retention | 30d | 90d | 1yr | Unlimited |
| Custom button colours | No | Yes | Yes | Yes |
| Per-product analytics | No | Yes | Yes | Yes |
| RMS branding | Shown | Hidden | Hidden | Hidden |

See `rms-billing` skill for billing flow, trial logic, and `appSubscriptionCreate` GraphQL pattern.

## Size Notation System

Converts between letter sizes (XS, S, M, L...) and numeric sizes for 6 countries (US, UK, EU, AU, JP, CN), women's and men's separately.

**Critical:** Conversion tables exist in TWO places that must stay in sync:
1. `backend/src/services/sizeTemplateService.js` — `SIZE_NOTATION_CONVERSIONS` (backend)
2. `extensions/size-guide-widget/blocks/size-guide.liquid` — `SIZE_NOTATION_CONVERSIONS` (storefront, client-side)

EU sizes use the German/DACH standard (DE/AT/CH/SE), not French or Italian.

## Database

PostgreSQL with auto-schema init on startup. No migration runner — schema changes use conditional `ALTER TABLE` in `database.js`. Migration SQL files also in `backend/db/migrations/` for manual reference.

Tables: `shops`, `size_templates`, `product_assignments`, `size_recommendations`, `analytics`

## Storefront Widget

Theme App Extension at `extensions/size-guide-widget/`. Fully self-contained (no external JS dependencies).
- Lazy-loads size chart data only when modal opens
- Posts recommendation requests to `/api/public/recommend`
- Supports theme editor customisation (button text, colours, modal title/subtitle)

Recommendation algorithm: usual size + body shape (±1 size) + fit preference (±0.5 size) + optional body measurements.

## Common Gotchas

1. **Two exit-iframe paths:** `/exitiframe` (library) and `/auth/exit-iframe` (custom) — both need handlers
2. **Session objects must be `Session` class instances** — `new Session({...})` from `@shopify/shopify-api`, never plain objects (causes `session.toPropertyArray is not a function`)
3. **Session recovery chain:** session storage → `shops.access_token` column → token exchange → 401
4. **Stale access tokens:** `shopifyGraphqlRequest()` catches 401, performs token exchange, retries once
5. **Uninstall/reinstall:** `APP_UNINSTALLED` webhook deletes the `shops` row; on reinstall, `verifyShop` auto-creates a missing shop record
6. **Billing callback:** Route at `/billing/callback` — registered before auth middleware
7. **Template loader:** Simple `{{variable}}` replacement — no escaping, no conflict with JS template literals
8. **Date parsing:** PostgreSQL DATE type overridden to return strings (`YYYY-MM-DD`) to avoid timezone shift
9. **Client-side 401 retry:** `authenticatedFetch` in `authHelpers.js` retries once with fresh session token on `401` + `X-Shopify-Retry-Invalid-Session-Request` header
10. **Size notation sync:** Always update BOTH `sizeTemplateService.js` AND `size-guide.liquid` when changing size conversion tables

## Environment Variables

```
SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES
SHOPIFY_APP_URL=https://size-helper.reedmace.net
DATABASE_URL
NODE_ENV                    # production for real billing charges
PORT=3000
TRIAL_DAYS=7
ANALYTICS_RETENTION_DAYS    # default 30, overridden per tier
```

## Dev Commands

```bash
cd backend && npm run dev    # Start with --watch
cd backend && npm start      # Production start
shopify app dev              # Full Shopify dev mode with tunnel
```

# Session Memory Sync
At the end of every session, append a brief summary of:
- What was built or changed today
- Any decisions made and why
- Current status of each active task
- Anything the next session should know first

Write this to: ~/Documents/Wrenbys/pm/pm-shared/references/session-log.md
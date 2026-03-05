# RMS Size Helper — Project Guide

## What This App Does

RMS Size Helper is an embedded Shopify app that adds interactive size charts and a guided "Find My Size" questionnaire to product pages. Store managers create size templates, assign them to products, and customers use the storefront widget to find their size — reducing returns and increasing buyer confidence.

## Tech Stack

- **Backend:** Node.js (ES modules), Express, PostgreSQL
- **Frontend:** Server-rendered HTML templates with vanilla JS (no React/Vue)
- **Shopify Integration:** `@shopify/shopify-app-express` v5, App Bridge v4, Shopify Billing API (GraphQL)
- **Storefront Widget:** Shopify Theme App Extension (Liquid + vanilla JS)
- **Hosting:** Railway (nixpacks.toml), PostgreSQL via DATABASE_URL
- **Auth:** Shopify OAuth + JWT token exchange for embedded app sessions

## Project Structure

```
backend/
  src/
    index.js                 # Express app, routes, auth flow, page serving
    config/database.js       # PostgreSQL pool, schema init (CREATE TABLE IF NOT EXISTS)
    middleware/
      verifyShop.js          # JWT auth for API (verifyShop) + page requests (verifyShopDocument)
      errorHandler.js        # Global error + 404 handler
      subscriptionCheck.js   # Tier-gated feature enforcement
    routes/
      templates.js           # CRUD for size templates
      products.js            # Product-to-template assignment
      billing.js             # Subscription management, billing callback
      analytics.js           # Analytics data endpoints
      public.js              # Unauthenticated storefront API (size guide data, recommendations)
      webhooks.js            # APP_UNINSTALLED + GDPR webhooks
    services/
      billingService.js      # Tier definitions, Shopify billing mutations, subscription CRUD
      sizeTemplateService.js # Template CRUD, size notation conversions, measurement conversion
      sizeRecommendationService.js  # "Find My Size" algorithm
      webhookService.js      # Webhook registration + shopify instance holder
      cleanupService.js      # Scheduled analytics data retention cleanup (daily 3am UTC)
    utils/
      authHelpers.js         # Client-side JS injected into all admin pages (App Bridge init, authenticated fetch, toast, confirm modal, navigation)
      logger.js              # Structured logger with emoji prefixes
      templateLoader.js      # HTML template loader with {{variable}} replacement
      asyncHandler.js        # Express async error wrapper
    views/
      dashboard.html         # Home page with stats and onboarding
      templates.html         # Template list
      template-form.html     # Create/edit template (most complex page)
      products.html           # Product assignment
      analytics.html          # Analytics charts
      settings.html          # Billing & plan management
      exit-iframe.html       # OAuth bounce page (breaks out of Shopify iframe)
      privacy.html           # Public privacy policy
extensions/
  size-guide-widget/
    blocks/size-guide.liquid # Storefront widget (size chart + Find My Size questionnaire)
    shopify.extension.toml   # Extension config
    assets/                  # Clothing illustrations and body shape images
shopify.app.toml             # Shopify app config (client_id, scopes, URLs, webhooks)
```

## Authentication Architecture

The app uses two auth strategies depending on request type:

1. **API requests** (`/api/*`): `verifyShop` middleware validates JWT Bearer token from App Bridge, with a 3-step session recovery flow: session storage -> database -> token exchange. Returns 401 with `X-Shopify-Retry-Invalid-Session-Request` header on failure.

2. **Page requests** (`/templates`, `/settings`, etc.): `verifyShopDocument` middleware checks for `?shop=` param. If present, validates session and redirects to `/auth/exit-iframe` bounce flow if no session. If no shop param (internal App Bridge navigation), passes through.

3. **Root route** (`/`): Uses `shopify.ensureInstalledOnShop()` when `?shop=` param is present. This is the Shopify library's built-in installation check which redirects to `/exitiframe` (library default path) when the app needs OAuth.

**Gotcha:** The `ensureInstalledOnShop()` middleware redirects to `/exitiframe` (no hyphen, no /auth prefix) — this is hardcoded in `@shopify/shopify-app-express`. The custom bounce flow uses `/auth/exit-iframe`. Both paths must be handled.

## Billing System

Four tiers: FREE, GROWTH ($9/mo), PROFESSIONAL ($19/mo), ENTERPRISE ($49/mo). Annual billing at ~20% discount.

Key billing behaviours:
- **Test charges:** `test: true` when `NODE_ENV !== 'production'`. Test charges on dev stores are auto-confirmed (Shopify's approve button is greyed out for test charges).
- **Trial:** 7-day free trial on first paid plan. `trial_used_at` column prevents trial abuse on reinstall.
- **Legacy tiers:** STARTUP -> FREE, MICRO_ENTERPRISE -> GROWTH, SMALL_BUSINESS -> PROFESSIONAL (handled by `normalizeTierKey()`).

## Subscription Tier Limits

| Feature | FREE | GROWTH | PROFESSIONAL | ENTERPRISE |
|---|---|---|---|---|
| Size chart templates | 3 | 15 | 50 | Unlimited |
| Size Helper templates | 1 | 10 | 35 | Unlimited |
| Recommendations/month | 50 | 500 | Unlimited | Unlimited |
| Analytics retention | 30d | 90d | 1yr | Unlimited |
| Custom button colours | No | Yes | Yes | Yes |
| Per-product analytics | No | Yes | Yes | Yes |
| RMS branding | Shown | Hidden | Hidden | Hidden |

## Size Notation System

The app converts between letter sizes (XS, S, M, L...) and numeric sizes for 6 countries (US, UK, EU, AU, JP, CN), with separate tables for women's and men's clothing. The conversion tables exist in TWO places that must stay in sync:

1. `backend/src/services/sizeTemplateService.js` — `SIZE_NOTATION_CONVERSIONS` (backend, used for numeric size conversion in API)
2. `extensions/size-guide-widget/blocks/size-guide.liquid` — `SIZE_NOTATION_CONVERSIONS` (storefront widget, client-side)

EU sizes use the German/DACH standard (DE/AT/CH/SE), not French (FR/ES/NL) or Italian sizing.

## Database

PostgreSQL with auto-schema init on startup (CREATE TABLE IF NOT EXISTS). No migration runner — schema changes are added as conditional ALTER TABLE statements in `database.js`.

Tables: `shops`, `size_templates`, `product_assignments`, `size_recommendations`, `analytics`

There is also a `backend/db/migrations/` directory with numbered SQL migration files for manual execution.

## Storefront Widget

The widget is a Shopify Theme App Extension (`extensions/size-guide-widget/`). It:
- Checks if a product has a template assigned via `/api/public/has-size-guide`
- Lazy-loads size chart data only when the modal is opened
- Posts recommendation requests to `/api/public/recommend`
- Is fully self-contained (no external JS dependencies)
- Supports theme editor customisation (button text, colours, modal title/subtitle)

The recommendation algorithm considers: usual size, body shape (+/- size adjustment), fit preference (+/- 0.5 size), and optional body measurements.

## Common Gotchas

- **Two auth flows coexist:** The Shopify library's `ensureInstalledOnShop` (root route only) and the custom `verifyShopDocument` middleware (all other pages). They redirect to different exit-iframe paths (`/exitiframe` vs `/auth/exit-iframe`). Both must have route handlers.
- **Session storage vs database:** Sessions can be lost from PostgreSQL session storage but recovered from the `shops` table's `access_token` column, or via token exchange.
- **Uninstall/reinstall shop record gap:** On uninstall, the `APP_UNINSTALLED` webhook deletes the `shops` row, but session storage may retain the old session. On reinstall, `ensureInstalledOnShop` finds the stale session and skips OAuth, so no new `shops` row is created. The `verifyShop` middleware now checks for and auto-creates missing shop records to handle this. Any new route that queries the `shops` table should be aware of this edge case.
- **Billing callback:** The billing callback route is at `/billing/callback` (not under `/api`), registered before the auth middleware.
- **Template loader:** Uses simple `{{variable}}` replacement — no escaping. Variables in HTML templates must not conflict with JS template literals.
- **Content Security Policy:** Helmet CSP is configured to allow Shopify CDN scripts and inline scripts/styles (required for embedded app).
- **Date parsing:** PostgreSQL DATE type parser is overridden to return strings (`YYYY-MM-DD`) to avoid timezone shift issues.
- **Client-side 401 retry:** `authenticatedFetch` in authHelpers.js retries once with a fresh session token when the server returns 401 with `X-Shopify-Retry-Invalid-Session-Request` header. This handles expired/invalid JWT tokens that App Bridge's built-in fetch would normally auto-retry.
- **Stale access tokens:** If Shopify revokes an access token (e.g., scope change), the app still uses it because the JWT validates locally. Shopify API calls will fail silently. No proactive token validation is implemented — this is a known limitation.

## Environment Variables

- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES` — Shopify app credentials
- `SHOPIFY_APP_URL` — App base URL (e.g., `https://size-helper.reedmace.net`)
- `DATABASE_URL` — PostgreSQL connection string
- `NODE_ENV` — `production` for real billing charges, anything else for test charges
- `PORT` — Server port (default 3000)
- `TRIAL_DAYS` — Free trial duration (default 7)
- `ANALYTICS_RETENTION_DAYS` — Default retention for cleanup (default 30, overridden per tier)

## Dev Commands

```bash
cd backend && npm run dev    # Start with --watch
cd backend && npm start      # Production start
shopify app dev              # Full Shopify dev mode with ngrok
```

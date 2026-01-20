# Size Helper - Shopify App

A Shopify app that helps customers find the correct clothing/footwear size through an interactive questionnaire displayed via a "Size Guide" link on product pages.

## Features

### Merchant Admin Dashboard
- **Size Templates**: Create measurement templates for different product types (tops, bottoms, dresses, outerwear, footwear, or custom)
- **Flexible Measurements**: Support for both centimeters and inches with automatic conversion
- **Measurement Fields**: Configurable fields including chest, waist, hip, inseam, shoulder, length, and custom fields
- **Product Assignment**: Link products to size templates individually or in bulk
- **Analytics Dashboard**: Track size guide opens, recommendations made, and conversion rates
- **Subscription Management**: Three-tier pricing with usage limits

### Customer Storefront Widget
- **Interactive Size Guide**: Modal-based interface triggered by "Size Guide" button on product pages
- **Size Chart Display**: View all sizes with measurements in preferred unit (cm/inches)
- **Smart Questionnaire**:
  - Usual size selection
  - Body shape picker with visual illustrations (slim, regular, athletic, relaxed)
  - Fit preference (fitted, regular, relaxed)
  - Optional direct measurement input
- **Intelligent Recommendations**: Algorithm considers all inputs to suggest the best size with confidence indicator

## Pricing Tiers

| Tier | Price | Product Types |
|------|-------|---------------|
| Startup | Free | 2 |
| Micro Enterprise | $10/month | 10 |
| Small Business | $20/month | 30 |

## Tech Stack

- **Backend**: Node.js 18+ with Express.js
- **Database**: PostgreSQL 15+
- **Shopify Integration**:
  - Shopify API v2024-01
  - App Bridge v4
  - Theme App Extension
- **Session Storage**: @shopify/shopify-app-session-storage-postgresql
- **Frontend**: Vanilla JavaScript with Polaris CSS

## Project Structure

```
sizer-app/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js          # PostgreSQL connection & schema
│   │   ├── middleware/
│   │   │   ├── verifyShop.js        # JWT verification for App Bridge v4
│   │   │   ├── subscriptionCheck.js # Tier limit enforcement
│   │   │   └── errorHandler.js      # Global error handling
│   │   ├── routes/
│   │   │   ├── templates.js         # Size template CRUD
│   │   │   ├── products.js          # Product assignment
│   │   │   ├── billing.js           # Subscription management
│   │   │   ├── analytics.js         # Usage analytics
│   │   │   ├── public.js            # Storefront API (no auth)
│   │   │   └── webhooks.js          # Shopify webhooks
│   │   ├── services/
│   │   │   ├── billingService.js    # Subscription logic
│   │   │   ├── sizeTemplateService.js
│   │   │   └── sizeRecommendationService.js
│   │   ├── utils/
│   │   │   ├── logger.js            # Contextual logging
│   │   │   ├── authHelpers.js       # App Bridge client helpers
│   │   │   ├── asyncHandler.js      # Async route wrapper
│   │   │   └── templateLoader.js    # HTML template loading
│   │   ├── views/                   # Admin dashboard HTML pages
│   │   │   ├── dashboard.html
│   │   │   ├── templates.html
│   │   │   ├── template-form.html
│   │   │   ├── products.html
│   │   │   ├── analytics.html
│   │   │   └── settings.html
│   │   └── index.js                 # Express server entry point
│   ├── .env                         # Environment variables
│   ├── package.json
│   └── Dockerfile
├── extensions/
│   └── size-guide-widget/           # Theme App Extension
│       ├── blocks/
│       │   └── size-guide.liquid    # Storefront widget
│       └── shopify.extension.toml
├── docker-compose.yml               # Local PostgreSQL
├── shopify.app.toml                 # Shopify app configuration
├── railway.toml                     # Railway deployment config
└── README.md
```

## Local Development Setup

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL) or local PostgreSQL 15+
- [ngrok](https://ngrok.com/) account (for HTTPS tunnel)
- [Shopify Partner](https://partners.shopify.com/) account with a development store

### 1. Clone and Install Dependencies

```bash
cd sizer-app
cd backend && npm install
```

### 2. Start PostgreSQL

Using Docker Compose:

```bash
docker compose up -d postgres
```

This starts PostgreSQL on `localhost:5432` with:
- Database: `size_helper`
- User: `postgres`
- Password: `postgres`

### 3. Configure Environment Variables

Edit `backend/.env`:

```env
# Shopify App Credentials (from Partner Dashboard)
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_SCOPES=read_products,read_inventory,write_customers,read_orders
SHOPIFY_APP_URL=https://your-subdomain.ngrok-free.app
SHOPIFY_WEBHOOK_SECRET=your_api_secret

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/size_helper

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=DEBUG

# Session
SESSION_SECRET=generate_a_random_secret_here
```

### 4. Start ngrok Tunnel

```bash
ngrok http 3000
```

Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok-free.app`) and update:

1. `SHOPIFY_APP_URL` in `backend/.env`
2. `application_url` in `shopify.app.toml`
3. In Shopify Partner Dashboard → Your App → Configuration:
   - App URL: `https://your-subdomain.ngrok-free.app`
   - Allowed redirection URLs: `https://your-subdomain.ngrok-free.app/api/auth/callback`

### 5. Run the Backend

```bash
cd backend
npm run dev
```

The server starts on `http://localhost:3000`. The database schema is automatically created on first run.

### 6. Install on Development Store

1. Go to [Shopify Partner Dashboard](https://partners.shopify.com/)
2. Select your app
3. Click **Test on development store**
4. Choose your development store
5. Approve the installation

### 7. Deploy Theme Extension

Install the Shopify CLI if not already installed:

```bash
npm install -g @shopify/cli @shopify/theme
```

Deploy the extension:

```bash
shopify app deploy
```

After deployment, go to your development store's theme editor and add the "Size Guide" block to product pages.

## API Reference

### Protected Endpoints (require JWT authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/templates` | List all size templates |
| GET | `/api/templates/:id` | Get single template |
| POST | `/api/templates` | Create new template |
| PUT | `/api/templates/:id` | Update template |
| DELETE | `/api/templates/:id` | Delete template |
| GET | `/api/templates/categories` | Get predefined categories |
| GET | `/api/products/assignments` | List product assignments |
| POST | `/api/products/assign` | Assign product to template |
| POST | `/api/products/assign-bulk` | Bulk assign products |
| DELETE | `/api/products/unassign/:productId` | Remove assignment |
| GET | `/api/products/search` | Search Shopify products |
| GET | `/api/billing/tiers` | List subscription tiers |
| GET | `/api/billing/current` | Get current subscription |
| POST | `/api/billing/subscribe` | Change subscription |
| POST | `/api/billing/cancel` | Cancel (downgrade to free) |
| GET | `/api/analytics/dashboard` | Dashboard statistics |
| GET | `/api/analytics/timeline` | Timeline chart data |
| GET | `/api/analytics/top-products` | Top products by usage |
| GET | `/api/analytics/recommendations` | Recent recommendations |

### Public Endpoints (storefront, no auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public/size-chart?shop=&productId=&unit=` | Get size chart |
| POST | `/api/public/recommend` | Get size recommendation |
| GET | `/api/public/has-size-guide?shop=&productId=` | Check if product has guide |
| GET | `/api/public/body-shapes?shop=&productId=` | Get body shape options |

### Webhook Endpoints

| Endpoint | Topic |
|----------|-------|
| `/api/webhooks/app/uninstalled` | App uninstalled |
| `/api/webhooks/customers/data_request` | GDPR data request |
| `/api/webhooks/customers/redact` | GDPR customer erasure |
| `/api/webhooks/shop/redact` | GDPR shop erasure |

## Size Recommendation Algorithm

The algorithm considers multiple factors:

1. **Direct Measurements** (highest weight): If provided, finds closest size match
2. **Usual Size**: Starting point for recommendation
3. **Body Shape Adjustment**:
   - Slim: -1 (tends smaller)
   - Regular: 0
   - Athletic: +0.5
   - Relaxed: +1 (tends larger)
4. **Fit Preference**:
   - Fitted: -0.5
   - Regular: 0
   - Relaxed: +0.5

When between sizes, the algorithm recommends sizing up. Confidence levels:
- **High**: Measurements closely match (>80% fit score)
- **Medium**: Good match (60-80% fit score)
- **Low**: Best estimate, recommend trying on

## Production Deployment (Railway)

### 1. Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Create a new project
3. Add a PostgreSQL database service
4. Add a new service from your GitHub repository

### 2. Configure Environment Variables

In Railway dashboard, add these variables:

```
SHOPIFY_API_KEY=your_production_api_key
SHOPIFY_API_SECRET=your_production_api_secret
SHOPIFY_SCOPES=read_products,read_inventory,write_customers,read_orders
SHOPIFY_APP_URL=https://your-app.up.railway.app
SHOPIFY_WEBHOOK_SECRET=your_production_api_secret
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
SESSION_SECRET=generate_secure_random_string
LOG_LEVEL=INFO
```

### 3. Update Shopify App URLs

In Shopify Partner Dashboard, update:
- App URL
- Allowed redirection URLs
- Webhook URLs

### 4. Deploy

Push to your GitHub repository - Railway auto-deploys on push.

## Theme Extension Customization

The size guide widget is customizable via the Shopify theme editor:

| Setting | Description | Default |
|---------|-------------|---------|
| Button Text | Text shown on trigger button | "Size Guide" |
| Modal Title | Title in the modal | "Find Your Perfect Fit" |
| Modal Subtitle | Subtitle text | "Use our size guide..." |
| Accent Color | Primary color for buttons/highlights | #008060 |
| Button Background | Trigger button background | #ffffff |
| Button Text Color | Trigger button text | #333333 |
| Button Border Color | Trigger button border | #dddddd |
| Button Hover Background | Hover state background | #f5f5f5 |
| Button Border Radius | Corner rounding (0-20px) | 6px |

## Troubleshooting

### "DATABASE_URL environment variable is not set"
Ensure `.env` file is in the `backend/` directory (not `backend/src/`).

### "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"
The database connection string is malformed or missing. Check `DATABASE_URL` format.

### "App Bridge not available"
The app must be accessed through the Shopify admin (embedded). Direct URL access won't work.

### Theme extension not showing
1. Ensure extension is deployed (`shopify app deploy`)
2. Add the "Size Guide" block to product pages in theme editor
3. Verify the product has an assigned size template

### Webhooks not received
1. Check ngrok is running and URL matches `.env`
2. Verify webhook URLs in Partner Dashboard
3. Check `SHOPIFY_WEBHOOK_SECRET` matches `SHOPIFY_API_SECRET`

## License

Proprietary - All rights reserved.

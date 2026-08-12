import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root (one level up from src)
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { shopifyApp } from '@shopify/shopify-app-express';
import { PostgreSQLSessionStorage } from '@shopify/shopify-app-session-storage-postgresql';
import { ApiVersion } from '@shopify/shopify-api';

import { createLogger } from './utils/logger.js';
import { initializeDatabase, query } from './config/database.js';
import { verifyShop, verifyShopDocument } from './middleware/verifyShop.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authHelpersScript } from './utils/authHelpers.js';
import { loadTemplate } from './utils/templateLoader.js';

// Routes
import templatesRouter from './routes/templates.js';
import productsRouter from './routes/products.js';
import billingRouter, { billingCallbackHandler } from './routes/billing.js';
import analyticsRouter from './routes/analytics.js';
import publicRouter from './routes/public.js';
import webhooksRouter from './routes/webhooks.js';
import { setShopifyInstance, registerWebhooks } from './services/webhookService.js';
import { startCleanupScheduler } from './services/cleanupService.js';
import { readReferralCookie, reportPartnerEvent } from './services/partnerService.js';

const logger = createLogger('Server');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Session storage
const sessionStorage = new PostgreSQLSessionStorage(process.env.DATABASE_URL);

// Initialize Shopify app
const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SHOPIFY_SCOPES?.split(',') || ['read_products'],
    hostName: process.env.SHOPIFY_APP_URL?.replace(/^https?:\/\//, '') || 'localhost',
    apiVersion: ApiVersion.January25,
    isEmbeddedApp: true,
  },
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
  },
  sessionStorage,
  useOnlineTokens: false,
  future: {
    unstable_managedPricingSupport: true,
  },
});

// Store raw body for webhook verification
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks')) {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      req.rawBody = data;
      try {
        req.body = JSON.parse(data);
      } catch (e) {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
});

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.shopify.com', 'https://*.shopify.com'],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.shopify.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: ["'self'", 'https://*.myshopify.com', 'https://*.shopify.com'],
        frameSrc: ["'self'", 'https://*.myshopify.com', 'https://*.shopify.com'],
        frameAncestors: ["'self'", 'https://*.myshopify.com', 'https://admin.shopify.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(compression());

// CORS for public API endpoints
app.use(
  '/api/public',
  cors({
    origin: true,
    credentials: true,
  })
);

// Parse JSON for non-webhook routes
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/webhooks')) {
    express.json()(req, res, next);
  } else {
    next();
  }
});

app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Shopify auth routes
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res, next) => {
    try {
      const session = res.locals.shopify.session;
      logger.info('Auth callback - session obtained:', session.shop);

      // Create or update shop record
      const cycleStart = new Date();
      const cycleEnd = new Date();
      cycleEnd.setDate(cycleEnd.getDate() + 30);

      await query(
        `INSERT INTO shops (shop_domain, access_token, scope, billing_cycle_start, billing_cycle_end)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (shop_domain)
         DO UPDATE SET access_token = $2, scope = $3, updated_at = CURRENT_TIMESTAMP`,
        [session.shop, session.accessToken, session.scope, cycleStart, cycleEnd]
      );

      logger.info('Shop record created/updated:', session.shop);

      // RMS Partner Programme — sticky, first-touch. Only writes partner_id
      // if it isn't already set, so a reinstall without a fresh referral
      // link never overwrites the original attribution.
      const referralPartnerId = readReferralCookie(req);
      if (referralPartnerId) {
        try {
          const attribution = await query(
            `UPDATE shops SET partner_id = $1 WHERE shop_domain = $2 AND partner_id IS NULL`,
            [referralPartnerId, session.shop]
          );
          if (attribution.rowCount > 0) {
            await reportPartnerEvent({ partnerId: referralPartnerId, eventType: 'install', shopDomain: session.shop });
          }
        } catch (partnerError) {
          logger.warn('Partner attribution failed:', partnerError.message);
        }
      }

      // Redirect to embedded app in Shopify Admin
      const redirectUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;

      logger.info('Redirecting to:', redirectUrl);
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('Auth callback error:', error);
      next(error);
    }
  }
);

// Pass shopify instance to webhook service (for use by webhooks.js routes)
setShopifyInstance(shopify);

// Billing callback (not under /api - direct page load)
app.get('/billing/callback', billingCallbackHandler);

/**
 * Session Bounce Flow Endpoints
 * Used when token exchange fails and we need to redirect through OAuth
 */

// Exit iframe endpoint - breaks out of Shopify Admin iframe to start OAuth
app.get('/auth/exit-iframe', (req, res) => {
  const { shop, host } = req.query;

  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  // Build the OAuth start URL
  const authUrl = `${shopify.config.auth.path}?shop=${encodeURIComponent(shop)}`;

  try {
    const html = loadTemplate('exit-iframe', {
      redirectUrl: authUrl,
    });
    res.send(html);
  } catch (error) {
    logger.error('Error loading exit-iframe page:', error);
    // Fallback: redirect directly
    res.redirect(authUrl);
  }
});

// Session token endpoint - receives bounce from App Bridge and initiates OAuth
app.get('/auth/session-token', (req, res) => {
  const { shop, host, redirectUri } = req.query;

  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  // Redirect to exit-iframe which will break out and start OAuth
  const exitIframeUrl = `/auth/exit-iframe?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host || '')}`;
  res.redirect(exitIframeUrl);
});

// Exit iframe endpoint used by shopify.ensureInstalledOnShop() (default library path)
// This is separate from /auth/exit-iframe used by the custom bounce flow
app.get('/exitiframe', (req, res) => {
  const { shop, host } = req.query;

  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  const authUrl = `${shopify.config.auth.path}?shop=${encodeURIComponent(shop)}`;

  try {
    const html = loadTemplate('exit-iframe', {
      redirectUrl: authUrl,
    });
    res.send(html);
  } catch (error) {
    logger.error('Error loading exit-iframe page:', error);
    res.redirect(authUrl);
  }
});

// Webhook routes (before auth middleware)
app.use('/api/webhooks', webhooksRouter);

// Public API routes (no auth required)
app.use('/api/public', publicRouter);

// Protected API routes
const verifyShopMiddleware = verifyShop(sessionStorage);
const verifyShopDocumentMiddleware = verifyShopDocument(sessionStorage);

app.use('/api/templates', verifyShopMiddleware, templatesRouter);
app.use('/api/products', verifyShopMiddleware, productsRouter);
app.use('/api/billing', verifyShopMiddleware, billingRouter);
app.use('/api/analytics', verifyShopMiddleware, analyticsRouter);

// Helper to serve admin pages
// ensureInstalledOnShop is only used on the root route when accessed with ?shop= param
// Internal navigation via App Bridge doesn't need it since the session is maintained
const serveAdminPage = (templateName, extras = {}) => async (req, res) => {
  try {
    const html = loadTemplate(templateName, {
      authHelpers: authHelpersScript,
      apiKey: process.env.SHOPIFY_API_KEY,
      ...extras,
    });
    // Prevent caching to ensure fresh content
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(html);
  } catch (error) {
    logger.error(`Error loading ${templateName} page:`, error);
    res.status(500).send(`Error loading ${templateName} page`);
  }
};

// Root route - check for shop param and validate installation
// If shop param is present, use ensureInstalledOnShop
// If not (internal navigation), just serve the page
app.get('/', (req, res, next) => {
  if (req.query.shop) {
    // External access with shop param - validate installation
    return shopify.ensureInstalledOnShop()(req, res, next);
  }
  // Internal navigation - serve page directly
  next();
}, serveAdminPage('dashboard'));

// Other admin pages - verify session when shop param is present, redirect to bounce flow if needed
app.get('/templates', verifyShopDocumentMiddleware, serveAdminPage('templates'));
app.get('/templates/new', verifyShopDocumentMiddleware, serveAdminPage('template-form', { mode: 'create', templateId: '' }));
app.get('/templates/:id/edit', verifyShopDocumentMiddleware, (req, res) => {
  serveAdminPage('template-form', { mode: 'edit', templateId: req.params.id })(req, res);
});
app.get('/products', verifyShopDocumentMiddleware, serveAdminPage('products'));
app.get('/analytics', verifyShopDocumentMiddleware, serveAdminPage('analytics'));
app.get('/settings', verifyShopDocumentMiddleware, serveAdminPage('settings'));

// Public pages (no auth required)
app.get('/privacy', (req, res) => {
  try {
    const html = loadTemplate('privacy', {});
    res.send(html);
  } catch (error) {
    logger.error('Error loading privacy page:', error);
    res.status(500).send('Error loading privacy policy');
  }
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
async function start() {
  try {
    // Initialize database
    await initializeDatabase();

    // Start cleanup scheduler for analytics data retention
    startCleanupScheduler();

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error.message || error);
    console.error('Full error:', error);
    process.exit(1);
  }
}

start();

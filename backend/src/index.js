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
import { verifyShop } from './middleware/verifyShop.js';
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
    apiVersion: ApiVersion.January24,
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
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.shopify.com'],
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

// Billing callback (not under /api - direct page load)
app.get('/billing/callback', billingCallbackHandler);

// Webhook routes (before auth middleware)
app.use('/api/webhooks', webhooksRouter);

// Public API routes (no auth required)
app.use('/api/public', publicRouter);

// Protected API routes
const verifyShopMiddleware = verifyShop(sessionStorage);

app.use('/api/templates', verifyShopMiddleware, templatesRouter);
app.use('/api/products', verifyShopMiddleware, productsRouter);
app.use('/api/billing', verifyShopMiddleware, billingRouter);
app.use('/api/analytics', verifyShopMiddleware, analyticsRouter);

// Admin pages
app.get('/', shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const html = loadTemplate('dashboard', {
      authHelpers: authHelpersScript,
      apiKey: process.env.SHOPIFY_API_KEY,
    });
    res.send(html);
  } catch (error) {
    logger.error('Error loading dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

app.get('/templates', shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const html = loadTemplate('templates', {
      authHelpers: authHelpersScript,
      apiKey: process.env.SHOPIFY_API_KEY,
    });
    res.send(html);
  } catch (error) {
    logger.error('Error loading templates page:', error);
    res.status(500).send('Error loading templates page');
  }
});

app.get('/templates/new', shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const html = loadTemplate('template-form', {
      authHelpers: authHelpersScript,
      apiKey: process.env.SHOPIFY_API_KEY,
      mode: 'create',
      templateId: '',
    });
    res.send(html);
  } catch (error) {
    logger.error('Error loading template form:', error);
    res.status(500).send('Error loading template form');
  }
});

app.get('/templates/:id/edit', shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const html = loadTemplate('template-form', {
      authHelpers: authHelpersScript,
      apiKey: process.env.SHOPIFY_API_KEY,
      mode: 'edit',
      templateId: req.params.id,
    });
    res.send(html);
  } catch (error) {
    logger.error('Error loading template form:', error);
    res.status(500).send('Error loading template form');
  }
});

app.get('/products', shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const html = loadTemplate('products', {
      authHelpers: authHelpersScript,
      apiKey: process.env.SHOPIFY_API_KEY,
    });
    res.send(html);
  } catch (error) {
    logger.error('Error loading products page:', error);
    res.status(500).send('Error loading products page');
  }
});

app.get('/analytics', shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const html = loadTemplate('analytics', {
      authHelpers: authHelpersScript,
      apiKey: process.env.SHOPIFY_API_KEY,
    });
    res.send(html);
  } catch (error) {
    logger.error('Error loading analytics page:', error);
    res.status(500).send('Error loading analytics page');
  }
});

app.get('/settings', shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const html = loadTemplate('settings', {
      authHelpers: authHelpersScript,
      apiKey: process.env.SHOPIFY_API_KEY,
    });
    res.send(html);
  } catch (error) {
    logger.error('Error loading settings page:', error);
    res.status(500).send('Error loading settings page');
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

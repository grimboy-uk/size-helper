import { createLogger } from '../utils/logger.js';

const logger = createLogger('Partner');
const APP_SLUG = 'sizer-app';
const REF_COOKIE_PATTERN = /^[a-f0-9]{10}$/;

function getPartnerApiConfig() {
  const baseUrl = process.env.PARTNER_API_URL;
  const apiKey = process.env.PARTNER_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

/**
 * Reads the rms_ref cookie set by reedmace.net (shared parent-domain cookie).
 * No cookie-parser dependency in this app — a plain header regex is enough
 * for reading one specific cookie name.
 */
export function readReferralCookie(req) {
  const cookieHeader = req.headers?.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)rms_ref=([^;]+)/);
  const ref = match?.[1];
  if (!ref || !REF_COOKIE_PATTERN.test(ref)) return null;
  return ref;
}

/**
 * Reports an attribution/billing event to reedmace's internal partner API.
 * Always best-effort — must never throw into OAuth/billing/webhook flows.
 */
export async function reportPartnerEvent({ partnerId, eventType, shopDomain, plan, amount, occurredAt }) {
  if (!partnerId) return;

  const config = getPartnerApiConfig();
  if (!config) return;

  try {
    const res = await fetch(`${config.baseUrl}/api/partners/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-partner-api-key': config.apiKey,
      },
      body: JSON.stringify({
        partnershipId: partnerId,
        app: APP_SLUG,
        shopDomain,
        eventType,
        plan,
        amount,
        occurredAt: occurredAt || new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      logger.warn(`Partner event report failed (${res.status}): ${eventType} for ${shopDomain}`);
    }
  } catch (error) {
    logger.warn('Partner event report error:', error.message);
  }
}

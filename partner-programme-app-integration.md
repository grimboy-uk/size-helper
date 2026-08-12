# RMS Partner Programme — App Integration Plan

**Audience:** whoever is implementing this in `bis-app`, `sizer-app`, `shop-assistant`, `returns-manager`. Drop this file into each of those repos and work through it — the shared sections apply to all four; the archetype sections apply to your app specifically (Express/vanilla for `bis-app`/`sizer-app`, Remix/TS for `shop-assistant`/`returns-manager`).

**Reedmace already ships:** partner signup, partnershipId issuance, the `rms_ref` cookie, and the internal API described below. None of that needs building here — this document is only about what each app consumes.

No app has real merchant installs yet (test stores only), so there's no backward-compatibility concern — build this against the current OAuth/billing code directly.

---

## 1. The mechanism, in one paragraph

A prospect visits `reedmace.net` (or `reedmace.net/partners`) with `?ref=<partnershipId>` in the URL. Reedmace sets a cookie — `rms_ref`, domain `.reedmace.net`, 30-day expiry — which is a **parent domain** cookie, so it's automatically sent to every RMS app's own subdomain (`bis-notifier.`, `size-helper.`, `shop-assistant.`, `returns.` — all `*.reedmace.net`). When that merchant later installs your app — via a direct link *or* the Shopify App Store listing, doesn't matter which — their browser ends up back on your app's own domain to begin OAuth (Shopify always redirects "Add app" back to the app's configured App URL). The `rms_ref` cookie is present on that request. Your app reads it, stores the partnershipId against the shop, and reports install/billing events back to reedmace so commission accrues.

**You do not need to change any install links or CTAs.** The cookie rides along regardless of entry path. The only work is: read the cookie, persist it, report events.

---

## 2. Shared across all four apps

### Env vars (add to each app)

```
PARTNER_API_URL=https://reedmace.net
PARTNER_API_KEY=<shared secret — must match reedmace's PARTNER_API_KEY exactly>
```

Get the current value of `PARTNER_API_KEY` from the reedmace repo's `.env` / Railway config — it's one shared secret across all 5 services, not per-app.

### Read the cookie, not the OAuth `state` param

Threading `ref` through the OAuth `state` param is unnecessary complexity here — the `rms_ref` cookie is a first-party cookie on the same browser session and survives the round trip to Shopify's authorize page and back untouched (it's a top-level `SameSite=Lax`-safe navigation). Just re-read `req.cookies.rms_ref` (or the Remix equivalent) at the point where OAuth completes and you have a confirmed shop domain — that's `afterAuth` in the Express apps, or the `afterAuth` hook / post-`authenticate.admin` point in the Remix apps.

Validate the cookie value before trusting it: `/^[a-f0-9]{10}$/`.

### Shop-level column

Add a nullable `partner_id` (text) column to whatever table represents an installed shop. First-touch and sticky:

- Only write it if the shop row doesn't already have one set.
- **Never clear it on uninstall.** The uninstall/reinstall gap already documented in the workspace `CLAUDE.md` (stale session, `afterAuth` must upsert) applies directly here — if `partner_id` gets wiped on uninstall, a reinstalling merchant loses their partner's attribution. Upsert the shop row without touching `partner_id` if it's already set.

### Event reporting helper

Write one small helper (`reportPartnerEvent()` or similar) that every call site below uses:

```js
async function reportPartnerEvent({ partnerId, eventType, shopDomain, plan, amount, occurredAt }) {
  if (!partnerId) return; // no attribution on this shop, nothing to report
  try {
    const res = await fetch(`${process.env.PARTNER_API_URL}/api/partners/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-partner-api-key': process.env.PARTNER_API_KEY
      },
      body: JSON.stringify({
        partnershipId: partnerId,
        app: '<this-app-slug>', // 'bis-app' | 'sizer-app' | 'shop-assistant' | 'returns-manager'
        shopDomain,
        eventType,               // 'install' | 'charge' | 'cancel' | 'plan_change'
        plan,
        amount,
        occurredAt: occurredAt || new Date().toISOString()
      })
    });
    if (!res.ok) {
      logger.warn(`Partner event report failed (${res.status}): ${eventType} for ${shopDomain}`);
    }
  } catch (err) {
    // Never let reedmace being down break an install, billing sync, or webhook.
    logger.warn(`Partner event report error: ${err.message}`);
  }
}
```

**This must always be fire-and-forget / best-effort.** Do not `await` it in a way that blocks the response, and never let it throw into the caller. OAuth install and billing webhooks are the most fragile, highest-stakes flows in each app — an outage on reedmace's side must never break an install or a billing sync.

### The four event types

| `eventType` | When to send it | Required fields |
|---|---|---|
| `install` | Once, at the end of OAuth (`afterAuth`), if `rms_ref` cookie present and shop had no prior `partner_id` | `plan` optional |
| `charge` | Every time a subscription charge is confirmed (trial→paid conversion, and each renewal your billing sync detects) | `amount` (the actual charge amount), `plan` |
| `cancel` | On `APP_UNINSTALLED`, or when a merchant cancels/downgrades to Free | none extra |
| `plan_change` | On upgrade/downgrade between paid tiers (not to/from Free — that's `cancel`) | `plan` (new plan name) |

Reedmace's ledger requires an `install` event to exist before it will accept `charge`/`cancel`/`plan_change` for a shop — so if you're backfilling or testing, always send `install` first.

### Exclude manual/comp subscriptions

Per the workspace `CLAUDE.md`, `shop-assistant` and `returns-manager` support manually-granted subscriptions where `shopifyChargeId` is prefixed `manual:<plan>` — these bypass real Shopify billing entirely. **Never send a `charge` event for these.** There's no real revenue behind them; reporting one would pay a partner out of pocket for a comp you granted. Guard the call site: `if (subscription.shopifyChargeId?.startsWith('manual:')) return;` before reporting.

`bis-app` and `sizer-app` don't currently have this pattern — no action needed there, just don't introduce the gap if a similar comp mechanism gets added later.

---

## 3. Express apps (`bis-app`, `sizer-app`)

1. Add `cookie-parser` if not already present (check `package.json` first — `verifyShop`/session middleware may already parse cookies for other reasons).
2. In `afterAuth` (wherever OAuth token exchange completes and the shop row is upserted — see the uninstall/reinstall gotcha above): read `req.cookies.rms_ref`, validate it, and if the shop row's `partner_id` is currently null, set it. Then call `reportPartnerEvent({ eventType: 'install', ... })`.
3. Billing: hook into the `appSubscriptionCreate` confirmation path (the `/billing/callback` route per the `rms-billing` skill) — on a confirmed charge, look up the shop's `partner_id` and report `charge` with the plan's price.
4. `APP_UNINSTALLED` webhook handler: report `cancel`.
5. Wherever plan upgrade/downgrade is handled within the app (not via reinstall): report `plan_change`.
6. Schema: add the column via the existing `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern in `config/database.js` — no migration runner in these apps, so this has to be idempotent and additive, matching how existing columns were added.

---

## 4. Remix apps (`shop-assistant`, `returns-manager`)

1. Add `partnerId String?` to the Shop model in `prisma/schema.prisma`, run `prisma migrate dev` for a new migration.
2. Parse the `rms_ref` cookie from `request.headers.get('cookie')` (a small regex or the `cookie` npm package — Remix doesn't parse cookies for you outside of its session-storage abstraction). Do this in the `afterAuth` hook (`shopify.authenticate.admin` config) or immediately after `authenticate.admin(request)` resolves on first login, wherever the shop row is upserted.
3. Sticky, first-touch: only set `partnerId` if not already set on the Shop row — same reinstall caveat as the Express apps.
4. Billing: hook into `syncSubscriptionStatus` (or wherever a confirmed `appSubscriptionCreate` charge updates the DB) — report `charge`, but **skip if `shopifyChargeId` starts with `manual:`** (see exclusion above).
5. `APP_UNINSTALLED` handler (GDPR/webhook routes): report `cancel`.
6. Plan change within the app (upgrade/downgrade actions): report `plan_change`.
7. Remember `Infinity` plan-limit serialization quirk doesn't apply here — this is just reporting a plan name string, not a limit value.

---

## 5. Testing checklist (per app)

- [ ] Visit `https://reedmace.net/rms?ref=<a real partnershipId from reedmace's admin panel>` in a browser, confirm the `rms_ref` cookie is set (devtools → Application → Cookies, domain `.reedmace.net`).
- [ ] From that same browser, install the app on a test store via its normal path (direct link or App Store listing — both should work identically per the mechanism above).
- [ ] Confirm the shop's `partner_id` / `partnerId` column is populated after install.
- [ ] Check reedmace's `/admin/partners` (session-protected admin) — the partner's shop count should increment.
- [ ] Confirm a test charge (`test: true`, dev store) triggers a `charge` event and the partner's commission total updates in `/admin/partners`.
- [ ] Uninstall the test app, confirm a `cancel` event fires and the shop's attribution status flips to cancelled (visible via reedmace admin, not currently exposed per-row in the UI beyond the aggregate — check the DB directly if needed).
- [ ] Reinstall the same test store without a `?ref=` cookie present, confirm `partner_id` is **not** cleared and is **not** reassigned to null — it should still show the original partner.
- [ ] Confirm nothing in the OAuth or billing flow breaks if `PARTNER_API_KEY` is temporarily wrong or reedmace is unreachable (this should degrade silently — event reporting fails, logs a warning, install/billing still succeeds).

---

## 6. Reedmace API reference (for exact request/response shapes)

**`GET /api/partners/:partnershipId/validate`**
Header: `x-partner-api-key: <PARTNER_API_KEY>`
Response: `{ "valid": true, "tier": "referral" | "implementation" }` or `{ "valid": false }`

Not required for the core flow (reedmace already validated the partnershipId when it set the cookie), but useful if you want to display partner tier/status somewhere in-app.

**`POST /api/partners/events`**
Headers: `x-partner-api-key: <PARTNER_API_KEY>`, `Content-Type: application/json`
Body:
```json
{
  "partnershipId": "a3f9c1e082",
  "app": "returns-manager",
  "shopDomain": "example.myshopify.com",
  "eventType": "charge",
  "plan": "Professional",
  "amount": 49.99,
  "occurredAt": "2026-08-12T10:00:00.000Z"
}
```
`amount` required for `eventType: "charge"` only. `occurredAt` optional, defaults to server time.

Responses:
- `install` → `{ "ok": true, "attributed": true|false }` (`false` means another partner already owns this shop — first-touch, expected and not an error)
- `cancel` / `plan_change` → `{ "ok": true }`
- `charge` → `{ "ok": true, "commissionPct": 20, "commissionAmount": 10.00 }`
- Errors: `400` (`missing_fields` / `invalid_app` / `invalid_event_type` / `invalid_amount` / `invalid_occurred_at`), `401` (`unauthorized` — bad/missing API key), `404` (`unknown_partner` / `not_attributed` — trying to report `charge`/`cancel`/`plan_change` before an `install` event exists for that shop), `500` (`server_error`)

Valid `app` values: `bis-app`, `sizer-app`, `shop-assistant`, `returns-manager`.

---

## 7. Open questions this plan deliberately leaves to reedmace, not you

- Commission rate (20%/30%) is looked up server-side on reedmace from the partner's tier — you never calculate or send a commission amount, only the gross `amount` charged.
- Payout timing, clawback rules, and dormant-partner handling are reedmace-side bookkeeping — nothing in your app needs to know about them.
- If reedmace's `/admin/partners` view doesn't show something you need for support/debugging (e.g. per-shop cancellation reasons), that's a reedmace-side follow-up, not something to work around here.

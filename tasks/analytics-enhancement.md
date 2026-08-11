# Analytics Enhancement: Full Purchase Funnel Tracking

**Goal:** Extend the analytics dashboard from 3 metrics (Opens, Recommendations, Conversion Rate) to a full purchase funnel: **Opens → Recommendations → Add to Cart → Purchase → Revenue**

**Plan source:** `~/.claude/plans/dazzling-watching-penguin.md`

---

## Task Index

| # | Task | File(s) | Depends on | Status |
|---|------|---------|------------|--------|
| T1 | Add `value` column to analytics table | `database.js` | — | [x] |
| T2 | Add `POST /api/public/track` endpoint | `public.js` | T1 | [x] |
| T3 | Register `orders/paid` webhook | `webhookService.js` | — | [x] |
| T4 | Implement `orders/paid` webhook handler | `webhooks.js` | T1, T3 | [x] |
| T5 | Update analytics API — dashboard route | `analytics.js` | T1 | [x] |
| T6 | Update analytics API — timeline + top-products routes | `analytics.js` | T1 | [x] |
| T7 | Add add-to-cart tracking to storefront widget | `size-guide.liquid` | T2 | [x] |
| T8 | Redesign analytics dashboard UI | `analytics.html` | T5, T6 | [x] |

---

## T1 — Add `value` column to analytics table

**File:** `backend/src/config/database.js`

**What to do:**
Find the schema init block (the `CREATE TABLE IF NOT EXISTS analytics` statement and any existing `ALTER TABLE analytics` calls that follow it). Add this line after the existing `ALTER TABLE` statements:

```sql
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS value DECIMAL(12,2);
```

The file already uses conditional `ALTER TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` for previous schema additions — follow that exact pattern.

**Verify:** On dev server start, check the logs confirm no SQL error. Run `\d analytics` in psql to confirm the column exists.

---

## T2 — Add `POST /api/public/track` endpoint

**File:** `backend/src/routes/public.js`

**What to do:**
Add an unauthenticated `POST /api/public/track` route. The widget calls this to record client-side events. The route must:

1. Accept body `{ shop, productId, event }`
2. Validate `event` is in an allowlist — currently only `'add_to_cart_after_rec'`. Reject unknown values with 400 to prevent arbitrary writes.
3. Upsert into `analytics` using the same `INSERT ... ON CONFLICT (shop_domain, product_id, event_type, date) DO UPDATE SET count = analytics.count + 1` pattern already used in the file.
4. Return `{ ok: true }` on success.

**Notes:**
- No auth required — this is called from the storefront widget via the app proxy.
- `shop` in the body maps to `shop_domain` in the DB.
- `date` is `CURRENT_DATE` (server-side, not client-supplied).
- The app proxy routes `/apps/size-helper/*` → backend, so no CORS config needed.

**Verify:** `curl -X POST https://<tunnel>/apps/size-helper/api/public/track -d '{"shop":"test.myshopify.com","productId":"123","event":"add_to_cart_after_rec"}'` → `{"ok":true}`. Check `analytics` table for the new row.

---

## T3 — Register `orders/paid` webhook

**File:** `backend/src/services/webhookService.js`

**What to do:**
Find where other webhooks are registered (e.g. `APP_UNINSTALLED`, GDPR webhooks). Add `orders/paid` pointing to `/api/webhooks/orders/paid`:

```js
shopify.webhooks.addHandlers({
  ORDERS_PAID: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: '/api/webhooks/orders/paid',
    callback: handleOrderPaid,
  },
  // ...existing handlers
});
```

The handler function `handleOrderPaid` will be implemented in T4 and imported here.

**Verify:** After server start, check Shopify Partner Dashboard → App → Webhooks to confirm `orders/paid` is subscribed on the dev store.

---

## T4 — Implement `orders/paid` webhook handler

**File:** `backend/src/routes/webhooks.js`

**What to do:**
Add a `handleOrderPaid` function (exported so `webhookService.js` can import it). On each `orders/paid` payload:

1. Extract `shop_domain` from the `X-Shopify-Shop-Domain` header.
2. For each line item in `order.line_items`:
   a. Check if the product has an assigned template: `SELECT 1 FROM product_assignments WHERE shop_domain = $1 AND product_id = $2`
   b. If assigned, check for a recent recommendation: `SELECT id FROM size_recommendations WHERE shop_domain = $1 AND product_id = $2 AND created_at > NOW() - INTERVAL '2 hours'`
   c. If a recommendation exists within 2 hours, upsert into `analytics`:
      ```sql
      INSERT INTO analytics (shop_domain, product_id, event_type, date, count, value)
      VALUES ($1, $2, 'purchase_attributed', CURRENT_DATE, 1, $3)
      ON CONFLICT (shop_domain, product_id, event_type, date)
      DO UPDATE SET count = analytics.count + 1, value = analytics.value + EXCLUDED.value
      ```
      where `$3` is `line_item.price * line_item.quantity`.

**Notes:**
- HMAC verification for this webhook uses the standard `verifyHmac` middleware already in `webhooks.js` — apply the same middleware used on other webhook routes.
- `line_item.price` is a string in Shopify's payload — parse with `parseFloat()`.
- Process line items in parallel (`Promise.all`) rather than sequentially.

**Verify:** Place a test order on dev store for a product that has a size guide assigned and a recent recommendation in the DB. Check analytics table for a `purchase_attributed` row with correct value.

---

## T5 — Update analytics API: dashboard route

**File:** `backend/src/routes/analytics.js`

**What to do:**
Update the `/dashboard` route to:

1. **Add new event totals** — query `count` for `add_to_cart_after_rec` and `purchase_attributed` events alongside existing `size_guide_opened` and `recommendation_made`.

2. **Add revenue** — `SUM(value) WHERE event_type = 'purchase_attributed'` for the period.

3. **Add comparison period** — for the same `days` window ending one period ago (i.e. `date BETWEEN NOW() - (2 * days) AND NOW() - days`), return a `previous` object with the same metrics.

4. **Compute trend percentages** — for each metric: `((current - previous) / previous * 100).toFixed(1)`. If `previous === 0`, set trend to `null` (the UI shows "No prior data").

**Response shape** (extend the existing shape, don't break it):
```json
{
  "opens": 1234,
  "recommendations": 456,
  "addToCart": 89,
  "purchases": 23,
  "revenue": 2340.50,
  "trends": {
    "opens": 12.5,
    "recommendations": 8.1,
    "addToCart": null,
    "purchases": null,
    "revenue": null
  }
}
```

**Verify:** Hit `/api/analytics/dashboard?days=30` with test data in DB. Confirm all 5 metrics and `trends` object present. Insert some prior-period rows and confirm trend percentages are correct.

---

## T6 — Update analytics API: timeline + top-products routes

**File:** `backend/src/routes/analytics.js`

**What to do:**

**`/timeline` route:**
Add `addToCartAfterRec` and `purchaseAttributed` fields to each day's object (alongside existing `opens`, `recommendations`):
```json
{ "date": "2026-06-01", "opens": 45, "recommendations": 12, "addToCart": 3, "purchases": 1 }
```

**`/top-products` route:**
Add three columns to the per-product aggregation query:
- `addToCart` — sum of count where event_type = `add_to_cart_after_rec`
- `purchases` — sum of count where event_type = `purchase_attributed`
- `revenue` — sum of value where event_type = `purchase_attributed`

Use `LEFT JOIN` or conditional aggregation (`SUM(CASE WHEN event_type = 'purchase_attributed' THEN value ELSE 0 END)`) so products with no purchase events still appear in the list.

**Verify:** Hit `/api/analytics/timeline?days=30` — each day object has all 4 fields. Hit `/api/analytics/top-products?days=30` — each product row has `addToCart`, `purchases`, `revenue`.

---

## T7 — Add add-to-cart tracking to storefront widget

**File:** `extensions/size-guide-widget/blocks/size-guide.liquid`

**What to do:**
In the `showRecommendation()` JavaScript function (search for `function showRecommendation`), after the UI update logic:

1. Store the recommendation in `sessionStorage`:
   ```js
   sessionStorage.setItem(`rms_rec_${productId}`, Date.now().toString());
   ```

2. Attach a **one-time** add-to-cart listener (if not already attached — guard with a boolean flag on the window object):
   ```js
   if (!window._rmsCartListenerAttached) {
     window._rmsCartListenerAttached = true;
     document.addEventListener('submit', function rmsCartSubmit(e) {
       const form = e.target;
       if (!form.action || !form.action.includes('/cart/add')) return;
       const pid = form.querySelector('[name="id"]')?.value
                || new URLSearchParams(new FormData(form)).get('id');
       if (!pid) return;
       // productId here refers to the Shopify product (not variant) — extract from page context
       const pageProductId = window.ShopifyAnalytics?.meta?.product?.id?.toString();
       if (pageProductId && sessionStorage.getItem(`rms_rec_${pageProductId}`)) {
         sessionStorage.removeItem(`rms_rec_${pageProductId}`);
         fetch('/apps/size-helper/api/public/track', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             shop: window.Shopify?.shop,
             productId: pageProductId,
             event: 'add_to_cart_after_rec'
           })
         }).catch(() => {}); // fire and forget
       }
     });
   }
   ```

**Notes:**
- `window.ShopifyAnalytics.meta.product.id` is the product GID-free numeric ID, available on all product pages in standard themes.
- The `_rmsCartListenerAttached` guard prevents attaching multiple listeners if `showRecommendation` is called more than once.
- `sessionStorage` scope is per-tab, per-origin — correct for this use case.
- Do not `await` the fetch; it must not block the add-to-cart action.

**Verify:** On dev store, open product page → open size guide → complete "Find My Size" → add to cart → check `analytics` table for `add_to_cart_after_rec` row.

---

## T8 — Redesign analytics dashboard UI

**File:** `backend/src/views/analytics.html`

**What to do:**
Replace the existing 3-stat cards section with a 4-card funnel layout. Each card shows: primary value, funnel sub-line ("X% of opens" / "X% of recommendations"), and a trend badge.

**Funnel cards (in order):**
1. **Size Guide Opens** — value: `opens`, sub-line: baseline, trend badge
2. **Recommendations** — value: `recommendations`, sub-line: `(opens > 0 ? ((recommendations/opens)*100).toFixed(0) : '—')% of opens`, trend badge
3. **Added to Cart** — value: `addToCart`, sub-line: `% of recommendations`, trend badge (or "NEW" if no prior data)
4. **Revenue** — value: `£{revenue.toFixed(2)}`, sub-line: `% of add to cart`, trend badge (or "NEW")

**Trend badge logic:**
```js
function trendBadge(pct) {
  if (pct === null) return '<span class="trend-badge neutral">No prior data</span>';
  const sign = pct >= 0 ? '↑' : '↓';
  const cls = pct >= 0 ? 'positive' : 'negative';
  return `<span class="trend-badge ${cls}">${sign}${Math.abs(pct)}%</span>`;
}
```

**Chart updates:**
- Add `addToCart` and `purchases` series to the existing timeline chart.
- Chart colours: opens = `#3b82f6`, recommendations = `#22c55e`, add-to-cart = `#f59e0b`, purchases = `#8b5cf6`.
- Chart legend gets 4 items.

**Top products table:**
- Add 3 new columns after the existing columns: `Add to Cart`, `Purchases`, `Revenue`.

**CSS additions** (append to existing `<style>` block):
```css
.funnel-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
.funnel-card { background: #fff; border: 1px solid #dedad4; border-radius: 10px; padding: 20px; }
.funnel-card .value { font-size: 2rem; font-weight: 700; color: #252c30; }
.funnel-card .label { font-size: 0.8rem; color: #4b5563; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.funnel-card .sub-line { font-size: 0.82rem; color: #4b5563; margin-top: 6px; }
.trend-badge { font-size: 0.78rem; font-weight: 600; padding: 2px 8px; border-radius: 12px; }
.trend-badge.positive { background: #d1fae5; color: #065f46; }
.trend-badge.negative { background: #fee2e2; color: #991b1b; }
.trend-badge.neutral { background: #f3f4f6; color: #6b7280; }
@media (max-width: 768px) { .funnel-cards { grid-template-columns: repeat(2, 1fr); } }
```

**Verify:** Navigate to Analytics tab → see 4 stat cards in a row → trend badges show for shops with prior-period data and "No prior data" for new ones → chart shows 4 series → top products table has 3 new columns.

---

## Dependency Graph

```
T1 (DB column)
├── T2 (track endpoint)     ← T7 (widget) depends on T2
├── T4 (webhook handler)    ← T3 (webhook registration) must precede
├── T5 (dashboard API)      ← T8 (UI) depends on T5 + T6
└── T6 (timeline/products API)
```

**Suggested order for parallel work:**
- **Stream A (backend):** T1 → T2, T3 → T4 → T5 → T6
- **Stream B (frontend/widget):** T7 (after T2 is done) → T8 (after T5+T6 done)

---

## Acceptance Criteria (end-to-end)

- [ ] Open a size guide modal, get a recommendation, add to cart → analytics table row `add_to_cart_after_rec` inserted
- [ ] Place a paid test order within 2 hours of recommendation → analytics table row `purchase_attributed` inserted with correct monetary value
- [ ] Analytics dashboard shows 4 funnel cards: Opens, Recommendations, Added to Cart, Revenue
- [ ] Trend badges show ↑/↓% when prior-period data exists; "No prior data" otherwise
- [ ] Timeline chart shows all 4 series with correct colours
- [ ] Top products table shows Add to Cart, Purchases, Revenue columns
- [ ] A shop with no add-to-cart or purchase data still loads the dashboard without errors (all new fields default to 0)

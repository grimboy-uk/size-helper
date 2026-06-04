# RMS Size Helper — Store Manager's Manual

Help customers find their perfect fit. **RMS Size Helper** adds interactive size charts and a guided "Find My Size" questionnaire to your product pages, reducing returns and increasing buyer confidence.

---

## Table of Contents

- [1. Getting Started](#1-getting-started)
  - [1.1 Installing the App](#11-installing-the-app)
  - [1.2 Adding the Size Guide to Your Theme](#12-adding-the-size-guide-to-your-theme)
  - [1.3 How It Works — Overview](#13-how-it-works--overview)
- [2. Dashboard](#2-dashboard)
  - [2.1 Quick Stats](#21-quick-stats)
  - [2.2 Getting Started Steps](#22-getting-started-steps)
- [3. Size Templates](#3-size-templates)
  - [3.1 Viewing Your Templates](#31-viewing-your-templates)
  - [3.2 Creating a Template](#32-creating-a-template)
  - [3.3 Basic Information](#33-basic-information)
  - [3.4 Measurement Settings](#34-measurement-settings)
  - [3.5 Button Appearance](#35-button-appearance)
  - [3.6 Size Chart Data](#36-size-chart-data)
  - [3.7 Editing and Deleting Templates](#37-editing-and-deleting-templates)
- [4. Products](#4-products)
  - [4.1 Assigning Products to Templates](#41-assigning-products-to-templates)
  - [4.2 Changing or Removing Assignments](#42-changing-or-removing-assignments)
- [5. The Storefront Widget](#5-the-storefront-widget)
  - [5.1 Size Chart View](#51-size-chart-view)
  - [5.2 Size Helper Questionnaire](#52-size-helper-questionnaire)
  - [5.3 Size Recommendation](#53-size-recommendation)
  - [5.4 International Size Notations](#54-international-size-notations)
  - [5.5 Theme Editor Customization](#55-theme-editor-customization)
- [6. Analytics](#6-analytics)
  - [6.1 Overview Stats](#61-overview-stats)
  - [6.2 Daily Activity Chart](#62-daily-activity-chart)
  - [6.3 Top Products](#63-top-products)
  - [6.4 Recommendation History](#64-recommendation-history)
- [7. Subscription Plans and Billing](#7-subscription-plans-and-billing)
  - [7.1 Plan Comparison](#71-plan-comparison)
  - [7.2 Free Plan](#72-free-plan)
  - [7.3 Growth Plan](#73-growth-plan)
  - [7.4 Professional Plan](#74-professional-plan)
  - [7.5 Enterprise Plan](#75-enterprise-plan)
  - [7.6 Annual Billing Discount](#76-annual-billing-discount)
  - [7.7 Free Trial](#77-free-trial)
  - [7.8 Upgrading, Downgrading, and Cancelling](#78-upgrading-downgrading-and-cancelling)
- [8. Privacy and Data Handling](#8-privacy-and-data-handling)
- [9. Frequently Asked Questions](#9-frequently-asked-questions)
- [10. Troubleshooting](#10-troubleshooting)
- [11. Support](#11-support)

---

## 1. Getting Started

### 1.1 Installing the App

1. Visit the **RMS Size Helper** listing on the Shopify App Store.
2. Click **Add app** and authorize the requested permissions.
3. The app installs automatically and you are redirected to the Dashboard inside your Shopify admin.

The app requires the following permissions:

| Permission | Purpose |
|---|---|
| `read_products` | Display product titles and images in the app admin |

### 1.2 Adding the Size Guide to Your Theme

After installation the size guide button does **not** appear on your store automatically. You need to add the app block to your theme:

1. From your Shopify admin, go to **Online Store > Themes**.
2. Click **Customize** on your active theme.
3. Select **Products > Default product** from the top-centre dropdown.
4. In the left sidebar, find the **Product information** section and click **Add block**.
5. Under **Apps**, select **Size Guide**.
6. Drag the block to your desired position (e.g., below the size selector or Add to Cart button).
7. Click **Save**.

The size guide button only appears on product pages that have a template assigned. Products without an assigned template will not show the button.

### 1.3 How It Works — Overview

RMS Size Helper operates in four simple steps:

1. **Create a size template** — Define the product category, measurement fields, and size data for a group of products (e.g., "Men's T-Shirts").
2. **Assign products** — Link products from your store to the appropriate template.
3. **Customer opens the guide** — A "Size Guide" button appears on assigned product pages. Customers click it to view the size chart.
4. **Customer finds their size** — If the Size Helper is enabled, customers answer a short questionnaire about their body shape, usual size, and fit preference to receive a personalised size recommendation.

---

## 2. Dashboard

The Dashboard is your home screen. It provides an at-a-glance overview of your size guide activity.

### 2.1 Quick Stats

Four key metrics are displayed at the top of the Dashboard:

| Metric | Description |
|---|---|
| **Size Templates** | The number of active size templates you have created |
| **Products Assigned** | The number of products currently linked to a template |
| **Guide Opens** | Total number of times customers opened a size guide |
| **Conversion Rate** | Percentage of guide opens that resulted in a size recommendation |

Below the stats, a usage bar shows your current plan and template usage (e.g., "Growth Plan — Using 5 of 15 size templates").

### 2.2 Getting Started Steps

A 4-step onboarding guide is shown on the Dashboard:

1. **Create a Size Template** — Choose a product category, enter measurements, and customise the appearance.
2. **Assign Products to Templates** — Link products individually or by searching your catalogue.
3. **Add the Size Guide Block to Your Theme** — Follow the theme editor steps described in [1.2](#12-adding-the-size-guide-to-your-theme).
4. **Track Performance** — Visit the Analytics page to monitor how customers use your size guides.

---

## 3. Size Templates

Templates are the core of the app. Each template defines a size chart for a group of similar products.

### 3.1 Viewing Your Templates

Navigate to the **Size Templates** tab to see all your templates. Each entry shows:

- Template name
- Category (e.g., Tops, Bottoms)
- Number of sizes defined
- Measurement unit (cm or inches)
- Active/Inactive status

A usage bar at the top shows how many templates you have used out of your plan's limit.

### 3.2 Creating a Template

Click **+ Create Template** to open the template form. If you have reached your plan's template limit, the button will be disabled and you will be prompted to upgrade.

### 3.3 Basic Information

| Field | Description |
|---|---|
| **Template Name** | A descriptive name for the template (e.g., "Men's T-Shirts", "Women's Jeans") |
| **Category** | The product type — **Tops** (T-shirts, shirts, blouses) or **Bottoms** (trousers, jeans, skirts) |
| **Clothing Illustration** | The image shown in the size guide modal alongside the size chart. Options depend on the category and your plan |
| **Template Type** | Choose between **Size Chart + Size Helper** (includes the "Find My Size" questionnaire) or **Size Chart Only** |

**Clothing illustrations** available per category:

| Category | Free Plan | Paid Plans |
|---|---|---|
| **Tops** | Jumper/Sweater | Polo/T-Shirt, Long Sleeve Shirt, Blouse |
| **Bottoms** | Trousers/Jeans | — |

**Template type** determines whether customers see only the size chart or also have access to the guided "Find My Size" questionnaire. Both template types and Size Helper templates have separate quotas per plan.

### 3.4 Measurement Settings

| Setting | Description |
|---|---|
| **Measurement Unit** | Centimetres (cm) or Inches (in). Customers can toggle between units in the storefront widget regardless of your choice here. |
| **Measurement Gender** | Women or Men. Affects the body shape illustrations shown to customers and the size notation conversion tables used. |
| **Size Notation Country** | The primary country notation for your sizes — UK, US, AU, EU, JP, or CN. Customers can switch country in the storefront widget. |
| **Size Notation Type** (Bottoms only) | **Standard** (S, M, L, XL), **Waist + Length** (32S, 32R, 32L), or **Waist Only** (28, 30, 32, 34) |

When using **Waist + Length** notation, you can enable or disable Short (S), Regular (R), and Long (L) variants using checkboxes.

### 3.5 Button Appearance

Customise how the "Find My Size" / "Size Guide" button looks on your product pages:

| Setting | Description | Default |
|---|---|---|
| **Button Colour** | The background colour of action buttons in the size guide modal | `#008060` (green) |
| **Corner Radius** | How rounded the button corners are. 0 = square, 24 = pill-shaped. | 8 px |

A live preview of the button is shown as you adjust these settings.

**Note:** Custom button colours require a paid plan. Free plan users use the default green.

### 3.6 Size Chart Data

The size chart section is where you enter the actual measurements for each size.

**Measurement fields** are pre-populated based on your selected category:

| Category | Default Fields |
|---|---|
| **Tops** | Chest (required), Waist (required), Length (required), Shoulder, Sleeve |
| **Bottoms** | Waist (required), Hips (required), Inseam, Length (required) |

You can rename any field label, mark fields as required or optional, remove fields, or add custom fields using the **+ Add Custom Field** button.

**Size rows** are pre-populated based on your size notation type:

- **Letter sizes** (Standard): 3XS through 6XL. By default, XS through XL are shown. Click "Show smaller sizes" or "Show larger sizes" to expand the range.
- **Waist sizes**: 26 through 44. By default, 30 through 36 are shown, with options to expand.

Each size row has a toggle to enable or disable it. Disabled sizes are excluded from the storefront widget. For each enabled size, enter the measurement value in every required field.

### 3.7 Editing and Deleting Templates

- Click **Edit** on any template to modify its settings and size data.
- Click **Delete** to permanently remove a template. You will be asked to confirm, as deleting a template also removes all its product assignments.

---

## 4. Products

The Products page is where you connect your store's products to your size templates.

### 4.1 Assigning Products to Templates

1. Navigate to the **Products** tab.
2. Click the **Find Products** tab.
3. Search for a product by name.
4. Click **Assign Template** on the product card.
5. Select a template from the dropdown and confirm.

Only products with an assigned template will display the size guide button on your storefront.

### 4.2 Changing or Removing Assignments

On the **Assigned Products** tab:

- Click **Change** to switch a product to a different template.
- Click **Remove** to unlink a product from its template. The size guide button will no longer appear on that product's page.

---

## 5. The Storefront Widget

This is what your customers see when they click the size guide button on a product page.

### 5.1 Size Chart View

The size guide opens as a modal with two panels:

- **Left panel** — A clothing illustration showing where each measurement is taken, with colour-coded labels (e.g., Chest in red, Waist in blue).
- **Right panel** — The full size chart table with all enabled sizes and their measurements.

Customers can:

- **Toggle units** between cm and inches. Measurements are converted automatically.
- **Switch country** using a dropdown (US, UK, EU, AU, JP, CN) to see the equivalent numeric sizes for their region (e.g., "M" displays as "M (38)" for EU women's sizing).

If the template has the Size Helper enabled, a **"Find My Size"** button appears at the bottom of the size chart.

### 5.2 Size Helper Questionnaire

When a customer clicks "Find My Size", they are guided through a short questionnaire:

**Question 1 — "What size do you usually wear?"**
Radio buttons showing all available sizes with the country-specific numeric equivalent. For Waist + Length templates, a separate question asks for their preferred length (Short, Regular, or Long).

**Question 2 — "How would you describe your body shape?"**
Four illustrated options:

| Option | Description |
|---|---|
| **Lean** | Small frame, low muscle/fat |
| **Balanced** | Moderate proportions |
| **Toned** | Muscle definition, straight/broad shoulders |
| **Curvy** | Fuller, softer body frame |

The illustrations shown are gender-specific based on the template's measurement gender setting.

**Question 3 — "What fit do you prefer?"**
Three options: **Fitted** (tight), **Regular**, or **Relaxed** (loose).

**Optional — "I know my measurements"**
A collapsible section where customers can enter their body measurements directly for a more precise recommendation.

### 5.3 Size Recommendation

After completing the questionnaire, the customer receives:

- **Recommended size** — displayed prominently (e.g., "M" or "32R").
- **Confidence level** — one of three badges:
  - **Great match!** (green) — high confidence based on measurements or strong alignment.
  - **Good match** (amber) — moderate confidence.
  - **Best estimate** (pink) — low confidence; the customer may want to check the size chart.
- **Reasoning** — a brief explanation of how the recommendation was determined (e.g., "Sized up based on body shape and fit preference").

The customer can click **Try Again** to redo the questionnaire or **Continue Shopping** to close the modal.

### 5.4 International Size Notations

The app includes built-in conversion tables for six countries (US, UK, EU, AU, JP, CN) for both women's and men's clothing. When a customer selects their country, the equivalent numeric size is displayed alongside the letter size in both the size chart and the questionnaire.

Example for Women's clothing:

| Letter | US | UK | EU | AU | JP | CN |
|---|---|---|---|---|---|---|
| XS | 4 | 8 | 34 | 8 | 7 | 165 |
| S | 6 | 10 | 36 | 10 | 9 | 170 |
| M | 8 | 12 | 38 | 12 | 11 | 175 |
| L | 10 | 14 | 40 | 14 | 13 | 180 |
| XL | 12 | 16 | 42 | 16 | 15 | 185 |

### 5.5 Theme Editor Customization

In addition to the template-level button colour and corner radius, you can customise the size guide button's appearance directly in the Shopify theme editor:

| Setting | Default |
|---|---|
| **Button Text** | "Size Guide" |
| **Modal Title** | "Find Your Perfect Fit" |
| **Modal Subtitle** | "Use our size guide to find the best size for you" |
| **Button Background** | White (#ffffff) |
| **Button Text Color** | Dark grey (#333333) |
| **Button Border Color** | Light grey (#dddddd) |
| **Button Hover Background** | Light grey (#f5f5f5) |
| **Button Hover Text Color** | Black (#000000) |

To access these settings: **Online Store > Themes > Customize**, then select the Size Guide block in the product template.

---

## 6. Analytics

The **Analytics** tab provides insights into how customers interact with your size guides.

### 6.1 Overview Stats

Three key metrics are displayed:

| Metric | Description |
|---|---|
| **Size Guide Opens** | Total number of times customers opened a size guide |
| **Recommendations Made** | Total number of "Find My Size" recommendations generated |
| **Conversion Rate** | Percentage of guide opens that resulted in a recommendation |

Use the period selector to view data for the **Last 7 days**, **Last 30 days**, or **Last 90 days**.

### 6.2 Daily Activity Chart

A bar chart showing daily size guide opens and recommendations over the selected period. Hover over any bar to see the exact count.

### 6.3 Top Products

A ranked table of your products by number of size guide opens, including recommendations and conversion rate per product.

**Note:** Per-product analytics require a paid plan.

### 6.4 Recommendation History

A table of recent size recommendations showing the date, product, template used, and recommended size.

**Note:** Detailed recommendation history requires a paid plan.

---

## 7. Subscription Plans and Billing

### 7.1 Plan Comparison

| Feature | Free | Growth | Professional | Enterprise |
|---|---|---|---|---|
| **Monthly Price** | $0 | $9 | $19 | $49 |
| **Annual Price** | $0 | $86/yr | $182/yr | $470/yr |
| **Size Charts (total templates)** | 3 | 15 | 50 | Unlimited |
| **Templates with Size Helper** | 1 | 10 | 35 | Unlimited |
| **Monthly Recommendations** | 50 | 500 | Unlimited | Unlimited |
| **Analytics Retention** | 30 days | 90 days | 1 year | Unlimited |
| **Per-Product Analytics** | No | Yes | Yes | Yes |
| **Custom Button Colours** | No | Yes | Yes | Yes |
| **Additional Illustrations** | No | Yes | Yes | Yes |
| **RMS Branding** | Shown | Removed | Removed | Removed |
| **Priority Support** | No | No | Yes | Yes |
| **API Access** | No | No | No | Yes |

### 7.2 Free Plan

The Free plan is ideal for getting started and evaluating the app. It includes:

- **3 size chart templates** — enough to cover a few product categories.
- **1 template with Size Helper** — try the guided "Find My Size" questionnaire on one template.
- **50 recommendations per month** — sufficient for low-traffic stores.
- **30-day analytics retention** — view the last 30 days of activity data.
- **Default button colour** — the green default (`#008060`). Custom colours are not available.
- **Default clothing illustration** — one illustration per category (Jumper for Tops, Trousers for Bottoms).
- **"Powered by RMS" branding** — a small attribution link is shown at the bottom of the size guide modal.

### 7.3 Growth Plan

The Growth plan unlocks customisation and higher limits for growing stores:

- **15 size chart templates** — cover more product categories.
- **10 templates with Size Helper** — enable guided recommendations on more products.
- **500 recommendations per month** — 10x the free plan's limit.
- **90-day analytics** — three months of performance insights.
- **Per-product analytics** — see which products get the most size guide engagement.
- **Custom button colours** — match the size guide to your brand.
- **All clothing illustrations** — choose the best illustration for each template.
- **No branding** — the "Powered by RMS" attribution is removed.

### 7.4 Professional Plan

For established stores with larger catalogues and higher traffic:

- **50 size chart templates** — comprehensive coverage for large inventories.
- **35 templates with Size Helper** — guided recommendations across most of your catalogue.
- **Unlimited recommendations** — no monthly cap.
- **1-year analytics retention** — a full year of historical data for trend analysis.
- **Priority support** — faster response times and dedicated assistance.
- All Growth plan features included.

### 7.5 Enterprise Plan

For high-volume stores that need unlimited capacity:

- **Unlimited templates** — no restrictions on size charts or Size Helper templates.
- **Unlimited analytics retention** — complete historical data.
- **API access** — integrate size guide data with external systems.
- All Professional plan features included.

### 7.6 Annual Billing Discount

Save approximately **20%** by choosing annual billing:

| Plan | Monthly Cost | Annual Cost | You Save |
|---|---|---|---|
| Growth | $9/month ($108/yr) | $86/year | $22/year |
| Professional | $19/month ($228/yr) | $182/year | $46/year |
| Enterprise | $49/month ($588/yr) | $470/year | $118/year |

Toggle between Monthly and Annual billing on the **Settings** page using the billing interval switch.

### 7.7 Free Trial

Every paid plan includes a **7-day free trial**. During the trial:

- You have full access to all features of the selected plan.
- You will not be charged until the trial period ends.
- You can downgrade to Free at any time before the trial ends to avoid charges.

Each store gets **one free trial**. If you have already used a trial on a previous plan, future plan changes will not include a trial period.

### 7.8 Upgrading, Downgrading, and Cancelling

**To upgrade:** Go to **Settings**, select a higher plan, and confirm. You will be redirected to Shopify's charge approval page. Once approved, the new plan takes effect immediately.

**To downgrade:** Select a lower plan (including Free). Your features adjust to the new plan's limits immediately. If you have more templates than the new plan allows, existing templates are preserved but you will not be able to create new ones until you are within the limit.

**To cancel:** Click the **Cancel Subscription** button in the Danger Zone at the bottom of the Settings page. Your subscription is cancelled immediately and you are moved to the Free plan. Your templates and product assignments are preserved.

All billing is handled through Shopify's built-in billing system. Charges appear on your regular Shopify invoice — no separate payment method is needed.

---

## 8. Privacy and Data Handling

RMS Size Helper is designed with privacy in mind.

**Data collected from customers:**

- Body measurements (voluntary, only if the customer chooses to enter them)
- Size preferences and questionnaire responses
- Aggregated usage analytics (no personal identifiers)

Customer data is **not** linked to customer accounts, **not** used for marketing, and **not** shared with third parties.

**Data retention:**

- Analytics data is automatically deleted based on your plan's retention period.
- All shop data (templates, assignments, analytics) is permanently deleted within 30 days of app uninstallation.

A full **Privacy Policy** is accessible from within the app.

---

## 9. Frequently Asked Questions

**Q: Does the size guide button appear on all product pages?**

A: No. The button only appears on product pages where the product has been assigned to a size template. Unassigned products do not show the button.

**Q: Can customers switch between centimetres and inches?**

A: Yes. The storefront widget includes a unit toggle that lets customers switch between cm and inches regardless of the unit you chose when creating the template. Measurements are converted automatically.

**Q: Can customers see sizes for their country?**

A: Yes. The widget includes a country selector (US, UK, EU, AU, JP, CN). When a customer selects their country, the equivalent numeric size is displayed alongside each letter size.

**Q: What happens when I reach my monthly recommendation limit?**

A: The size chart remains fully functional. Only the "Find My Size" questionnaire is affected — customers will see a message indicating the service is temporarily unavailable. Upgrading your plan or waiting for the next billing cycle restores access.

**Q: Can I use the same template for multiple products?**

A: Yes. Templates are designed to be shared across products with similar sizing. For example, a single "Men's T-Shirts" template can be assigned to all your men's t-shirt products.

**Q: What happens to my templates if I downgrade?**

A: Your existing templates and product assignments are preserved. However, if you exceed the new plan's template limit, you will not be able to create new templates until you are within the limit.

**Q: Does the widget work on mobile?**

A: Yes. The size guide modal is fully responsive and adapts to mobile screen sizes automatically.

**Q: What does the "Find My Size" confidence level mean?**

A: The confidence badge indicates how closely the recommendation matches the customer's inputs. "Great match" means the measurements and preferences align closely with a specific size. "Best estimate" means the recommendation is less certain and the customer should review the size chart for confirmation.

---

## 10. Troubleshooting

**The size guide button does not appear on my product pages**

1. Verify the app block is added to your theme: Go to **Online Store > Themes > Customize**, select the product template, and confirm the **Size Guide** block is present and visible.
2. Check that the product has been assigned to a template on the **Products** page.
3. Clear your browser cache and reload the product page.
4. Check the browser developer console (F12) for any JavaScript errors.

**The "Find My Size" button does not appear in the size guide modal**

1. Verify the template type is set to **Size Chart + Size Helper** (not "Size Chart Only").
2. Check your Size Helper template quota on the Settings page — you may have reached the limit for your plan.

**Customers report that recommendations are unavailable**

1. Check your monthly recommendation usage on the Settings page. You may have reached your plan's limit.
2. Upgrade to a higher plan for more (or unlimited) monthly recommendations.

**My custom button colour is not showing**

1. Custom button colours require a paid plan. Verify your current plan on the Settings page.
2. After saving a template, refresh the product page on your storefront to see the updated colour.

**I changed my plan but the features have not updated**

1. Refresh the Settings page.
2. If the billing approval page did not load, try clicking the plan button again.
3. Verify the plan change in your Shopify admin under **Settings > Billing**.

---

## 11. Support

Need help? Here is how to reach us:

- **Email:** info@reedmace.net
- **Support:** [Contact us](https://reedmace.net/contact)
- **Priority support:** Available on Professional and Enterprise plans for faster response times.

We are committed to helping your store reduce returns and increase customer confidence. If you have feature requests, questions, or need help with setup, do not hesitate to reach out.

---

*RMS Size Helper is developed by [RMS](https://reedmace.net). All billing is processed securely through Shopify's built-in billing system.*

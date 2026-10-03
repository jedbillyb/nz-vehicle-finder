/**
 * Create or update everything the paid plans need on the Stripe side:
 * one monthly price per paid tier, the customer billing portal, and the
 * webhook that tells the server when a subscription changes.
 *
 * Safe to run again. Prices are found by lookup key (nzvf_<tier>_monthly);
 * when a tier's price in shared/apiTiers.ts changes, a new price takes over
 * the lookup key and existing subscribers keep their old price until moved.
 *
 *   STRIPE_SECRET_KEY=... npx tsx scripts/stripe-setup.ts
 *   STRIPE_SECRET_KEY=... npx tsx scripts/stripe-setup.ts --webhook-url=https://vehiclefinder.co.nz/api/billing/webhook
 *
 * Run it once with the test key and once with the live key: test and live
 * mode have separate products, prices and webhooks.
 */
import Stripe from "stripe";
import { TIERS, TIER_ORDER } from "../shared/apiTiers.js";
import { WEBHOOK_EVENTS, lookupKeyFor } from "../server/billing.js";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY");
const stripe = new Stripe(key);
const webhookUrl = process.argv.find((a) => a.startsWith("--webhook-url="))?.slice("--webhook-url=".length);

const paidTiers = TIER_ORDER.map((id) => TIERS[id]).filter((t) => t.priceNzd > 0);
const priceIds: Record<string, { product: string; price: string }> = {};

for (const tier of paidTiers) {
  const lookupKey = lookupKeyFor(tier.id);
  const amount = Math.round(tier.priceNzd * 100);
  const existing = (await stripe.prices.list({ lookup_keys: [lookupKey], expand: ["data.product"] })).data[0];

  if (existing && existing.unit_amount === amount && existing.currency === "nzd" && existing.active) {
    console.log(`${tier.name}: price ${existing.id} already NZ$${tier.priceNzd}/month`);
    priceIds[tier.id] = { product: (existing.product as Stripe.Product).id, price: existing.id };
    continue;
  }

  const productId = existing
    ? (existing.product as Stripe.Product).id
    : (await stripe.products.create({
        name: `NZ Vehicle Finder API: ${tier.name}`,
        description: `${tier.monthlyRequests.toLocaleString("en-NZ")} API requests a month`,
        metadata: { tier: tier.id },
      })).id;

  const price = await stripe.prices.create({
    product: productId,
    currency: "nzd",
    unit_amount: amount,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { tier: tier.id },
  });
  console.log(`${tier.name}: created price ${price.id} at NZ$${tier.priceNzd}/month`);
  priceIds[tier.id] = { product: productId, price: price.id };
}

// The portal lets customers switch between paid plans, update their card and cancel.
const portalFeatures: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end" },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    proration_behavior: "create_prorations",
    products: Object.values(priceIds).map(({ product, price }) => ({ product, prices: [price] })),
  },
};
const portalDefaults = {
  business_profile: { headline: "NZ Vehicle Finder API" },
  features: portalFeatures,
};
const configs = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
if (configs.data[0]) {
  await stripe.billingPortal.configurations.update(configs.data[0].id, portalDefaults);
  console.log(`Billing portal: updated ${configs.data[0].id}`);
} else {
  const created = await stripe.billingPortal.configurations.create(portalDefaults);
  console.log(`Billing portal: created ${created.id}`);
}

if (webhookUrl) {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const found = endpoints.data.find((e) => e.url === webhookUrl);
  if (found) {
    await stripe.webhookEndpoints.update(found.id, { enabled_events: [...WEBHOOK_EVENTS] });
    console.log(`Webhook: ${found.id} already exists for ${webhookUrl}; events updated.`);
    console.log("Its signing secret is shown in the Stripe dashboard (Developers > Webhooks).");
  } else {
    const created = await stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: [...WEBHOOK_EVENTS] });
    console.log(`Webhook: created ${created.id} for ${webhookUrl}`);
    console.log(`STRIPE_WEBHOOK_SECRET=${created.secret}`);
    console.log("Put that line in the server's .env. Stripe will not show it again via the API.");
  }
}

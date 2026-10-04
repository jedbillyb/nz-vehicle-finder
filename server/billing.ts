/**
 * Stripe billing for the paid API plans.
 *
 * Stripe is the source of truth for who pays for what. Rather than trusting the
 * contents of any single webhook event (they can arrive late or out of order),
 * every event just triggers a re-read of the customer's subscriptions from
 * Stripe, and the account's tier is set from whatever is active right now.
 */
import Stripe from "stripe";
import express, { type Request, type Response } from "express";
import { TIERS, TIER_ORDER, type TierId } from "../shared/apiTiers.js";
import type { AccountStore, User } from "./accounts.js";
import { analyticsId, track } from "./analytics.js";

export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export const lookupKeyFor = (tier: TierId) => `nzvf_${tier}_monthly`;

/** Subscription states that still entitle the customer to their plan. past_due is kept while Stripe retries the card. */
const ENTITLED = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

function tierOfPrice(price: Stripe.Price): TierId | null {
  const fromMeta = price.metadata?.tier;
  if (fromMeta && fromMeta in TIERS) return fromMeta as TierId;
  const match = price.lookup_key?.match(/^nzvf_(\w+)_monthly$/);
  return match && match[1] in TIERS ? (match[1] as TierId) : null;
}

/** The best plan any entitled subscription gives. A customer with nothing active is on free. */
export function tierFromSubscriptions(subs: Stripe.Subscription[]): { tier: TierId; subscription: Stripe.Subscription | null } {
  let best: { tier: TierId; subscription: Stripe.Subscription | null } = { tier: "free", subscription: null };
  for (const sub of subs) {
    if (!ENTITLED.has(sub.status)) continue;
    for (const item of sub.items.data) {
      const tier = tierOfPrice(item.price);
      if (tier && TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(best.tier)) best = { tier, subscription: sub };
    }
  }
  return best;
}

export interface BillingOptions {
  secretKey: string | undefined;
  webhookSecret: string | undefined;
  publicUrl: string;
  sessionUser: (req: Request) => User | null;
}

export function createBilling(store: AccountStore, opts: BillingOptions) {
  const stripe = opts.secretKey ? new Stripe(opts.secretKey) : null;
  const router = express.Router();
  const priceCache = new Map<TierId, string>();

  async function priceIdFor(tier: TierId): Promise<string> {
    const cached = priceCache.get(tier);
    if (cached) return cached;
    const price = (await stripe!.prices.list({ lookup_keys: [lookupKeyFor(tier)], active: true, limit: 1 })).data[0];
    if (!price) throw new Error(`No Stripe price with lookup key ${lookupKeyFor(tier)}; run scripts/stripe-setup.ts`);
    priceCache.set(tier, price.id);
    return price.id;
  }

  /** Re-read a customer's subscriptions from Stripe and set their account's tier to match. */
  async function syncCustomer(customerId: string) {
    const user = store.userByStripeCustomer(customerId);
    if (!user) {
      console.warn(`Stripe customer ${customerId} has no matching account`);
      return;
    }
    const subs = await stripe!.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    const { tier, subscription } = tierFromSubscriptions(subs.data);
    store.setBilling(user.id, {
      tier,
      subscriptionId: subscription?.id ?? null,
      subscriptionStatus: subscription?.status ?? null,
    });
    if (user.tier !== tier) {
      console.log(`Account ${user.id} moved from ${user.tier} to ${tier}`);
      track("plan_changed", analyticsId(user.id), { from: user.tier, to: tier, status: subscription?.status ?? null, $set: { tier } });
    }
  }

  async function customerFor(user: User): Promise<string> {
    const existing = store.billingFor(user.id).stripeCustomerId;
    if (existing) return existing;
    const customer = await stripe!.customers.create({ email: user.email, metadata: { user_id: String(user.id) } });
    store.setStripeCustomer(user.id, customer.id);
    return customer.id;
  }

  const notConfigured = (res: Response) => res.status(503).json({ error: "Billing is not set up yet" });

  router.post("/billing/checkout", async (req, res) => {
    if (!stripe) return notConfigured(res);
    const user = opts.sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const tier = req.body?.tier as TierId;
    if (!TIERS[tier] || TIERS[tier].priceNzd === 0) return res.status(400).json({ error: "Choose a paid plan" });
    if (store.billingFor(user.id).subscriptionId) {
      return res.status(409).json({ error: "You already have a subscription. Use Manage billing to change plan." });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: await customerFor(user),
      line_items: [{ price: await priceIdFor(tier), quantity: 1 }],
      client_reference_id: String(user.id),
      subscription_data: { metadata: { user_id: String(user.id) } },
      allow_promotion_codes: true,
      success_url: `${opts.publicUrl}/account?billing=success`,
      cancel_url: `${opts.publicUrl}/account`,
    });
    res.json({ url: session.url });
  });

  router.post("/billing/portal", async (req, res) => {
    if (!stripe) return notConfigured(res);
    const user = opts.sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const customerId = store.billingFor(user.id).stripeCustomerId;
    if (!customerId) return res.status(400).json({ error: "No billing account yet. Choose a paid plan first." });
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${opts.publicUrl}/account` });
    res.json({ url: session.url });
  });

  /**
   * Called by the account page after returning from checkout, so the new plan
   * shows straight away even if the webhook is a few seconds behind.
   */
  router.post("/billing/sync", async (req, res) => {
    if (!stripe) return notConfigured(res);
    const user = opts.sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const customerId = store.billingFor(user.id).stripeCustomerId;
    if (customerId) await syncCustomer(customerId);
    res.json({ ok: true });
  });

  /** Mounted with a raw body parser: the signature covers the exact bytes Stripe sent. */
  async function webhook(req: Request, res: Response) {
    if (!stripe || !opts.webhookSecret) return notConfigured(res);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, req.headers["stripe-signature"] as string, opts.webhookSecret);
    } catch (err) {
      return res.status(400).json({ error: `Bad signature: ${(err as Error).message}` });
    }

    const obj = event.data.object as { customer?: string | { id: string } | null };
    const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
    if (customerId) await syncCustomer(customerId);
    res.json({ received: true });
  }

  return { router, webhook, enabled: !!stripe };
}

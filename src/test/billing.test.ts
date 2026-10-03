// @vitest-environment node
import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { tierFromSubscriptions } from "../../server/billing";
import { AccountStore } from "../../server/accounts";

function sub(status: Stripe.Subscription.Status, lookupKey: string, id = "sub_1"): Stripe.Subscription {
  return { id, status, items: { data: [{ price: { lookup_key: lookupKey, metadata: {} } }] } } as unknown as Stripe.Subscription;
}

describe("tierFromSubscriptions", () => {
  it("is free with no subscriptions", () => {
    expect(tierFromSubscriptions([]).tier).toBe("free");
  });

  it("reads the plan from the price lookup key", () => {
    expect(tierFromSubscriptions([sub("active", "nzvf_starter_monthly")]).tier).toBe("starter");
  });

  it("keeps the plan while a failed payment is retried", () => {
    expect(tierFromSubscriptions([sub("past_due", "nzvf_pro_monthly")]).tier).toBe("pro");
  });

  it("drops to free once cancelled or unpaid", () => {
    expect(tierFromSubscriptions([sub("canceled", "nzvf_pro_monthly")]).tier).toBe("free");
    expect(tierFromSubscriptions([sub("unpaid", "nzvf_pro_monthly")]).tier).toBe("free");
  });

  it("ignores an old cancelled subscription next to a live one, in either order", () => {
    const old = sub("canceled", "nzvf_pro_monthly", "sub_old");
    const live = sub("active", "nzvf_starter_monthly", "sub_live");
    expect(tierFromSubscriptions([old, live])).toMatchObject({ tier: "starter", subscription: { id: "sub_live" } });
    expect(tierFromSubscriptions([live, old])).toMatchObject({ tier: "starter", subscription: { id: "sub_live" } });
  });

  it("ignores prices that are not ours", () => {
    expect(tierFromSubscriptions([sub("active", "someone_else")]).tier).toBe("free");
  });
});

describe("AccountStore billing", () => {
  it("links a Stripe customer and applies the plan to the quota", () => {
    const store = new AccountStore(":memory:");
    const { user } = store.redeemLoginToken(store.createLoginToken("a@b.nz"))!;
    store.setStripeCustomer(user.id, "cus_123");
    expect(store.userByStripeCustomer("cus_123")?.id).toBe(user.id);

    store.setBilling(user.id, { tier: "pro", subscriptionId: "sub_1", subscriptionStatus: "active" });
    const { key } = store.createKey(user.id, null)!;
    const check = store.useKey(key);
    expect(check.ok && check.tier.id).toBe("pro");
    expect(store.billingFor(user.id)).toEqual({ stripeCustomerId: "cus_123", subscriptionId: "sub_1", subscriptionStatus: "active" });
  });
});

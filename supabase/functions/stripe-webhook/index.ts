// Stripe webhook for the single haaylo membership (plus legacy scheduler subs).
//
// Handles: checkout.session.completed, customer.subscription.created/updated/deleted,
// invoice.payment_succeeded, invoice.payment_failed.
//
// Runs with verify_jwt = false — Stripe does not send a Supabase JWT; the
// Stripe signature is verified instead.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const FOUNDING_EARLY = Deno.env.get("STRIPE_FOUNDING_EARLY_PRICE_ID") || "";
const FOUNDING_LAUNCH = Deno.env.get("STRIPE_FOUNDING_LAUNCH_PRICE_ID") || "";
const STANDARD_MONTHLY = Deno.env.get("STRIPE_STANDARD_MONTHLY_PRICE_ID") || "";

function membershipTypeForPrice(priceId?: string | null) {
  if (priceId && priceId === FOUNDING_EARLY) return "founding_early";
  if (priceId && priceId === FOUNDING_LAUNCH) return "founding_launch";
  return "standard";
}

function isMembershipPrice(priceId?: string | null) {
  return (
    !!priceId &&
    (priceId === FOUNDING_EARLY || priceId === FOUNDING_LAUNCH || priceId === STANDARD_MONTHLY)
  );
}

function priceOf(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

function periodOf(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0] as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const s = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const start = s.current_period_start ?? item?.current_period_start ?? null;
  const end = s.current_period_end ?? item?.current_period_end ?? null;
  return {
    start: start ? new Date(start * 1000).toISOString() : null,
    end: end ? new Date(end * 1000).toISOString() : null,
  };
}

const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://haaylo.com";

function planLabelFor(type: string) {
  if (type === "founding_early") return "Founding Member (early)";
  if (type === "founding_launch") return "Founding Member";
  return "haaylo membership";
}

function priceLabelFor(type: string) {
  if (type === "founding_early") return "£49 for your first year, then £49/month";
  if (type === "founding_launch") return "£99 for your first year, then £49/month";
  return "£49/month";
}

function formatDate(iso: string | null) {
  if (!iso) return undefined;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAmount(amount?: number, currency?: string) {
  if (typeof amount !== "number") return undefined;
  const symbol = (currency || "gbp").toLowerCase() === "gbp" ? "£" : "";
  return `${symbol}${(amount / 100).toFixed(2)}`;
}

/** Ask the app to render + enqueue a membership lifecycle email. Never throws. */
async function sendMembershipEmail(
  kind: "membership-welcome" | "payment-failed",
  userId: string,
  idempotencyKey: string,
  data: Record<string, unknown>,
) {
  try {
    const apikey =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!apikey) return;
    await fetch(`${APP_BASE_URL}/api/public/membership-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ kind, userId, idempotencyKey, data }),
    });
  } catch (e) {
    console.error("membership email dispatch failed", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !secret) return new Response("Missing signature or secret", { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
  } catch (e) {
    console.error("Webhook signature verification failed:", (e as Error).message);
    return new Response(`Webhook Error: ${(e as Error).message}`, { status: 400 });
  }

  // Idempotency — never process the same event twice.
  const { error: dupErr } = await admin
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, type: event.type });
  if (dupErr) {
    if ((dupErr as { code?: string }).code === "23505") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("webhook idempotency insert failed", dupErr.message);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subscriptionId) break;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const userId =
          session.client_reference_id ||
          (session.metadata?.user_id as string | undefined) ||
          (sub.metadata?.user_id as string | undefined) ||
          (await resolveUserId(sub));
        if (!userId) break;
        await handleMembership(userId, sub);
        {
          const type = membershipTypeForPrice(priceOf(sub));
          await sendMembershipEmail(
            "membership-welcome",
            userId,
            `membership-welcome-${userId}`,
            {
              planLabel: planLabelFor(type),
              priceLabel: priceLabelFor(type),
              renewalDate: formatDate(periodOf(sub).end),
              startUrl: `${APP_BASE_URL}/brain`,
            },
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(sub);
        if (!userId) break;
        await handleMembership(userId, sub);
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const subId =
          typeof (inv as unknown as { subscription?: string | { id: string } }).subscription ===
          "string"
            ? ((inv as unknown as { subscription: string }).subscription)
            : (inv as unknown as { subscription?: { id: string } }).subscription?.id;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        const userId = await resolveUserId(sub);
        if (!userId) break;
        await handleMembership(
          userId,
          sub,
          event.type === "invoice.payment_failed" ? "past_due" : undefined,
        );
        if (event.type === "invoice.payment_failed") {
          const due = inv as unknown as { amount_due?: number; currency?: string };
          await sendMembershipEmail("payment-failed", userId, `payment-failed-${inv.id}`, {
            amountLabel: formatAmount(due.amount_due, due.currency),
            billingUrl: `${APP_BASE_URL}/account`,
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
    return new Response("handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.user_id) return sub.metadata.user_id;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const { data: bySub } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (bySub?.user_id) return bySub.user_id;
  if (!customerId) return null;
  const { data: byCustomer } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return byCustomer?.user_id ?? null;
}

/**
 * Writes the membership row and, for a founding subscription, ensures a Stripe
 * Subscription Schedule exists that rolls the member onto £49/month after the
 * discounted founding year.
 */
async function handleMembership(
  userId: string,
  sub: Stripe.Subscription,
  forcedStatus?: string,
) {
  const priceId = priceOf(sub);

  // Legacy (scheduler / old engine) subscriptions keep the old behaviour.
  if (!isMembershipPrice(priceId) && sub.metadata?.product !== "haaylo_membership") {
    await upsertLegacy(userId, sub, forcedStatus);
    return;
  }

  const membershipType = membershipTypeForPrice(priceId);
  const isFounding = membershipType !== "standard";
  const { start, end } = periodOf(sub);
  const status = forcedStatus ?? sub.status;

  let scheduleId =
    typeof sub.schedule === "string" ? sub.schedule : (sub.schedule?.id ?? null);

  if (
    isFounding &&
    !scheduleId &&
    STANDARD_MONTHLY &&
    (sub.status === "active" || sub.status === "trialing")
  ) {
    try {
      const schedule = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
      const phase = schedule.phases?.[0];
      const updated = await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: "release",
        phases: [
          {
            items: [{ price: priceId!, quantity: 1 }],
            start_date: phase?.start_date,
            end_date: phase?.end_date,
          },
          {
            items: [{ price: STANDARD_MONTHLY, quantity: 1 }],
            iterations: 1,
          },
        ],
      });
      scheduleId = updated.id;
    } catch (e) {
      console.error("subscription schedule setup failed", (e as Error).message);
    }
  }

  const foundingPeriodEnd = isFounding ? end : null;

  const { data: existing } = await admin
    .from("subscriptions")
    .select("founding_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_schedule_id: scheduleId,
      stripe_price_id: priceId,
      membership_type: membershipType,
      status,
      current_period_start: start,
      current_period_end: end,
      founding_period_end: foundingPeriodEnd ?? existing?.founding_period_end ?? null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    },
    { onConflict: "user_id" },
  );
}

async function upsertLegacy(userId: string, sub: Stripe.Subscription, forcedStatus?: string) {
  const { start, end } = periodOf(sub);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: forcedStatus ?? sub.status,
      current_period_start: start,
      current_period_end: end,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    },
    { onConflict: "user_id" },
  );
}

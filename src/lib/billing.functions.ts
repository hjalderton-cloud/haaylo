import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stageForDate, type MembershipType } from "./pricing";

export interface MembershipState {
  active: boolean;
  status: string | null;
  membershipType: MembershipType | null;
  currentPeriodEnd: string | null;
  foundingPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  /** true when the member is inside their discounted founding year. */
  founding: boolean;
}

const EMPTY: MembershipState = {
  active: false,
  status: null,
  membershipType: null,
  currentPeriodEnd: null,
  foundingPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasCustomer: false,
  founding: false,
};

/** Reads the caller's membership. Returns an empty state when signed out. */
export const getMyMembership = createServerFn({ method: "GET" }).handler(
  async (): Promise<MembershipState> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const authHeader = getRequest()?.headers?.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token || token.split(".").length !== 3) return EMPTY;

    const supabaseUrl = process.env["SUPABASE_URL"];
    const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!supabaseUrl || !supabaseKey) return EMPTY;

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claims } = await supabase.auth.getClaims(token);
    const userId = claims?.claims?.sub;
    if (!userId) return EMPTY;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select(
        "status, membership_type, current_period_end, founding_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id",
      )
      .eq("user_id", userId)
      .maybeSingle();

    // Legacy grants (comped access / earlier plans) still count as members.
    const { data: legacy } = await supabase
      .from("engine_access")
      .select("comp_access, status, founding_member, founding_until")
      .eq("user_id", userId)
      .maybeSingle();

    const legacyActive =
      legacy?.comp_access === true ||
      legacy?.status === "active" ||
      legacy?.status === "trialing" ||
      (legacy?.founding_member === true &&
        (!legacy?.founding_until || new Date(legacy.founding_until) > new Date()));

    const periodEnd = sub?.current_period_end ?? null;
    const active =
      sub?.status === "active" ||
      sub?.status === "trialing" ||
      sub?.status === "past_due" ||
      (sub?.status === "canceled" && !!periodEnd && new Date(periodEnd) > new Date()) ||
      legacyActive;

    const foundingEnd = sub?.founding_period_end ?? null;

    return {
      active,
      status: sub?.status ?? (legacyActive ? "active" : null),
      membershipType: (sub?.membership_type as MembershipType | null) ?? null,
      currentPeriodEnd: periodEnd,
      foundingPeriodEnd: foundingEnd,
      cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
      hasCustomer: !!sub?.stripe_subscription_id,
      founding: !!foundingEnd && new Date(foundingEnd) > new Date(),
    };
  },
);

/** Creates a Stripe Checkout session for the single membership. */
export const createMembershipCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin?: string } | undefined) => ({ origin: data?.origin ?? "" }))
  .handler(async ({ data, context }): Promise<{ url?: string; error?: string }> => {
    const { stripeRequest, serverPriceId } = await import("./billing.server");
    const stage = stageForDate();
    const priceId = serverPriceId(stage.membershipType);
    if (!priceId) return { error: "Membership pricing is not configured yet." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id, status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.status === "active" || existing?.status === "trialing") {
      return { error: "You already have an active haaylo membership." };
    }

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userRes?.user?.email ?? undefined;

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId && email) {
      const found = await stripeRequest<{ data: Array<{ id: string }> }>("/customers", {
        method: "GET",
        body: { email, limit: 1 },
      });
      customerId = found.data[0]?.id ?? null;
    }
    if (!customerId) {
      const created = await stripeRequest<{ id: string }>("/customers", {
        body: { email, metadata: { supabase_user_id: userId } },
      });
      customerId = created.id;
    }

    await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        status: existing?.status ?? "incomplete",
      },
      { onConflict: "user_id" },
    );

    const origin = data.origin || "https://haaylo.com";
    const session = await stripeRequest<{ url: string }>("/checkout/sessions", {
      body: {
        mode: "subscription",
        customer: customerId,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": 1,
        client_reference_id: userId,
        allow_promotion_codes: true,
        success_url: `${origin}/engine?checkout=success`,
        cancel_url: `${origin}/pricing?canceled=1`,
        metadata: {
          product: "haaylo_membership",
          user_id: userId,
          membership_type: stage.membershipType,
        },
        subscription_data: {
          metadata: {
            product: "haaylo_membership",
            user_id: userId,
            membership_type: stage.membershipType,
          },
        },
      },
    });

    return { url: session.url };
  });

/** Opens the Stripe billing portal for the signed-in member. */
export const createBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin?: string } | undefined) => ({ origin: data?.origin ?? "" }))
  .handler(async ({ data, context }): Promise<{ url?: string; error?: string }> => {
    const { stripeRequest } = await import("./billing.server");
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) return { error: "No billing account on file yet." };

    const origin = data.origin || "https://haaylo.com";
    const portal = await stripeRequest<{ url: string }>("/billing_portal/sessions", {
      body: { customer: sub.stripe_customer_id, return_url: `${origin}/account` },
    });
    return { url: portal.url };
  });

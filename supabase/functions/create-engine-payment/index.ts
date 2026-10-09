// Creates a Stripe Checkout session for the £49/month Engine subscription.
// Requires an authenticated Supabase user; the user_id is stored in metadata
// so verify-engine-payment can grant access after success.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRO_PRICE_ID = Deno.env.get("STRIPE_ENGINE_PRICE_ID"); // £49/mo Pro
const STARTER_PRICE_ID = Deno.env.get("STRIPE_STARTER_PRICE_ID"); // £19/mo Starter
const EXPERT_PRICE_ID = Deno.env.get("STRIPE_EXPERT_PRICE_ID"); // £99/mo Expert
const FOUNDING_PRICE_ID = Deno.env.get("STRIPE_FOUNDING_YEARLY_PRICE_ID"); // £49/year founding Pro

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    let tier: "starter" | "pro" | "expert" | "founding" = "pro";
    try {
      const body = await req.json();
      if (body?.tier === "starter" || body?.tier === "expert" || body?.tier === "founding") {
        tier = body.tier;
      }
    } catch { /* no body → default pro */ }

    const priceMap: Record<typeof tier, string | undefined> = {
      starter: STARTER_PRICE_ID,
      pro: PRO_PRICE_ID,
      expert: EXPERT_PRICE_ID,
      founding: FOUNDING_PRICE_ID,
    };
    const priceId = priceMap[tier];
    const priceData: Record<typeof tier, Stripe.Checkout.SessionCreateParams.LineItem.PriceData> = {
      starter: {
        currency: "gbp",
        unit_amount: 1900,
        recurring: { interval: "month" },
        product_data: { name: "haaylo Starter" },
      },
      pro: {
        currency: "gbp",
        unit_amount: 4900,
        recurring: { interval: "month" },
        product_data: { name: "haaylo Pro" },
      },
      expert: {
        currency: "gbp",
        unit_amount: 9900,
        recurring: { interval: "month" },
        product_data: { name: "haaylo Expert" },
      },
      founding: {
        currency: "gbp",
        unit_amount: 4900,
        recurring: { interval: "year" },
        product_data: { name: "haaylo Founding Member" },
      },
    };

    const origin = req.headers.get("origin") || "";

    const session = await stripe.checkout.sessions.create({
      customer_email: user.email ?? undefined,
      line_items: [{ ...(priceId ? { price: priceId } : { price_data: priceData[tier] }), quantity: 1 }],
      mode: "subscription",
      client_reference_id: user.id,
      success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`, 
      cancel_url: `${origin}/?canceled=1`,
      subscription_data: {
        metadata: { product: "engine", tier, user_id: user.id },
      },
      metadata: {
        product: "engine",
        tier,
        user_id: user.id,
        email: user.email ?? "",
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("create-engine-payment error", error instanceof Error ? error.message : String(error));
    return new Response(JSON.stringify({ error: "Unable to start checkout" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

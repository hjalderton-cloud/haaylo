// Verifies a Stripe Checkout session and, on success, upserts an engine_access
// row for the signed-in user so the Engine unlocks for their account.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ paid: false, error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    );
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ paid: false, error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const { session_id } = await req.json();
    if (!session_id) throw new Error("Missing session_id");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    const paid = session.payment_status === "paid";
    const sessionUserId = (session.metadata?.user_id as string | undefined) || session.client_reference_id;
    const rawTier = String(session.metadata?.tier ?? "pro");
    // Founding checkout tags itself in metadata but stores as Pro tier.
    const isFounding = rawTier === "founding";
    const tier: "starter" | "pro" | "expert" =
      rawTier === "starter" || rawTier === "expert"
        ? rawTier
        : "pro";

    if (paid && sessionUserId && sessionUserId === user.id) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const foundingUntil = isFounding
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const creditsLimit = tier === "starter" ? 150 : tier === "expert" ? 999999 : 500;
      // Preserve any existing credits window; upsert only what the checkout knows.
      await supabaseAdmin.from("engine_access").upsert({
        user_id: user.id,
        stripe_session_id: session.id,
        amount_cents: session.amount_total ?? null,
        currency: session.currency ?? "gbp",
        email: session.customer_details?.email ?? user.email ?? null,
        paid_at: new Date().toISOString(),
        tier,
        plan: tier,
        credits_limit: creditsLimit,
        credits_used: 0,
        credits_period_start: new Date().toISOString(),
        status: "active",
        founding_member: isFounding,
        founding_until: foundingUntil,
      }, { onConflict: "user_id" });
    }

    return new Response(
      JSON.stringify({ paid, email: session.customer_details?.email ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("verify-engine-payment error", error instanceof Error ? error.message : String(error));
    return new Response(JSON.stringify({ paid: false, error: "Unable to verify payment" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

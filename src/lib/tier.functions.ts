import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TIER_GENERATION_LIMIT, type Tier } from "./tier";

/**
 * Returns the current user's active pricing tier.
 * - "expert" | "pro" | "starter" — active paid subscription
 * - "none" — no paid plan (still eligible for the one-time free trial per feature)
 *
 * Founding members are surfaced as "pro" during their founding window, plus
 * a `foundingMember` flag so UI can show a badge.
 */
export const getMyTier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    tier: Tier;
    foundingMember: boolean;
    foundingUntil: string | null;
  }> => {
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("status, current_period_end, founding_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();
    const subActive =
      sub?.status === "active" ||
      sub?.status === "trialing" ||
      sub?.status === "past_due" ||
      (sub?.status === "canceled" &&
        !!sub?.current_period_end &&
        new Date(sub.current_period_end) > new Date());
    if (subActive) {
      const fEnd = sub?.founding_period_end ?? null;
      return {
        tier: "pro" as Tier,
        foundingMember: !!fEnd && new Date(fEnd) > new Date(),
        foundingUntil: fEnd,
      };
    }

    const { data: row } = await context.supabase
      .from("engine_access")
      .select("tier, status, founding_member, founding_until, comp_access, comp_tier")
      .eq("user_id", context.userId)
      .maybeSingle();

    const foundingMember = row?.founding_member === true;
    const foundingUntil = row?.founding_until ?? null;
    const foundingActive =
      foundingMember && (!foundingUntil || new Date(foundingUntil) > new Date());
    const paidActive = row?.status === "active" || row?.status === "trialing";


    let tier: Tier = "none";
    if (row?.comp_access === true && row?.comp_tier) tier = row.comp_tier as Tier;
    else if (foundingActive) tier = "pro";
    else if (paidActive && row?.tier) tier = row.tier as Tier;

    return { tier, foundingMember, foundingUntil };
  });

/**
 * Returns tier + generation counter data for the Home dashboard.
 * Used to render the visible generation counter and warning states.
 */
export const getMyPlanUsage = createServerFn({ method: "GET" })
  .handler(async (): Promise<{

    tier: Tier;
    foundingMember: boolean;
    limit: number | null;         // null = unlimited
    used: number;
    periodStart: string | null;
    trial: { competitors: boolean; voice: boolean; posts: boolean };
    freeGenerationUsed: boolean;
  }> => {
    const EMPTY = {
      tier: "none" as Tier,
      foundingMember: false,
      limit: TIER_GENERATION_LIMIT["none" as Tier],
      used: 0,
      periodStart: null,
      trial: { competitors: false, voice: false, posts: false },
      freeGenerationUsed: false,
    };

    try {
    // Resolve the caller without a throwing middleware: an unauthenticated
    // request should return an empty plan, not a 500.
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

    const context = { supabase, userId };

    // Single haaylo membership: an active subscription unlocks everything with
    // unlimited generations, so no tier maths is needed.
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();
    const subActive =
      sub?.status === "active" ||
      sub?.status === "trialing" ||
      sub?.status === "past_due" ||
      (sub?.status === "canceled" &&
        !!sub?.current_period_end &&
        new Date(sub.current_period_end) > new Date());
    if (subActive) {
      return {
        tier: "pro" as Tier,
        foundingMember: false,
        limit: null,
        used: 0,
        periodStart: null,
        trial: { competitors: true, voice: true, posts: true },
        freeGenerationUsed: false,
      };
    }

    const [{ data: access }, { data: usage }] = await Promise.all([
      context.supabase
        .from("engine_access")
        .select("tier, status, founding_member, founding_until, comp_access, comp_tier, credits_used, credits_limit, credits_period_start")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("engine_usage")
        .select("free_generation_used, free_generations_used, free_starter_used, free_voice_used, free_posts_used")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    const foundingMember = access?.founding_member === true;
    const foundingUntil = access?.founding_until ?? null;
    const foundingActive =
      foundingMember && (!foundingUntil || new Date(foundingUntil) > new Date());
    const paidActive = access?.status === "active" || access?.status === "trialing";

    let tier: Tier = "none";
    const compAccess = access?.comp_access === true;
    if (compAccess && access?.comp_tier) tier = access.comp_tier as Tier;
    else if (foundingActive) tier = "pro";
    else if (paidActive && access?.tier) tier = access.tier as Tier;

    const dbLimit = access?.credits_limit ?? null;
    // Comped accounts carry their own credit allowance; a very large allowance
    // is treated as unlimited so the counter reads "∞" instead of a frozen number.
    let limit = TIER_GENERATION_LIMIT[tier];
    if (compAccess) limit = dbLimit != null && dbLimit < 100000 ? dbLimit : null;


    const trial = {
      competitors: usage?.free_starter_used === true,
      voice: usage?.free_voice_used === true,
      posts: usage?.free_posts_used === true,
    };
    const freeLimit = TIER_GENERATION_LIMIT["none"] ?? 1;
    const freeUsed =
      (usage as { free_generations_used?: number } | null)?.free_generations_used ??
      (usage?.free_generation_used === true ? freeLimit : 0);
    const freeGenerationUsed = freeUsed >= freeLimit;
    // For tier "none" (no plan), "used" reflects the account-level free generation.
    const used = tier === "none" ? freeUsed : (access?.credits_used ?? 0);


    return {
      tier,
      foundingMember,
      limit,
      used,
      periodStart: access?.credits_period_start ?? null,
      trial,
      freeGenerationUsed,
    };
    } catch {
      // Never 500 the whole page over a usage lookup — fall back to no plan.
      return EMPTY;
    }
  });

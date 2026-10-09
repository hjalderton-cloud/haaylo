import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignRecord = {
  id: string;
  project_id: string;
  campaign_title: string;
  campaign_theme: string;
  campaign_duration: string;
  has_social_posts: boolean;
  has_landing_page: boolean;
  has_lead_magnet: boolean;
  has_email_sequence: boolean;
  has_image_pack: boolean;
  has_blog: boolean;
  status: string;
  created_at: string;
  asset_status: Record<string, string>;
  current_phase: number;
  phase_override: boolean;
  phase_started_at: string | null;
  checkout_url: string | null;
  cart_closes_at: string | null;
  landing_page_headline: string | null;
  landing_page_subheadline: string | null;
  plan_week_start: number | null;
  plan_week_end: number | null;
  /** The approved Briefing Room recommendation, when Haaylo built this campaign. */
  agent_brief: {
    brief?: string;
    goal?: string;
    audience?: string;
    channels?: string[];
    assetSummary?: string[];
    grounding?: string;
  } | null;
};


export const ASSET_KEYS = [
  "social_posts",
  "landing_page",
  "lead_magnet",
  "email_sequence",
  "image_pack",
  "blog",
] as const;
export type AssetKey = (typeof ASSET_KEYS)[number];
export type AssetState = "generating" | "ready" | "complete";

const COLUMNS =
  "id, project_id, campaign_title, campaign_theme, campaign_duration, has_social_posts, has_landing_page, has_lead_magnet, has_email_sequence, has_image_pack, has_blog, status, created_at, asset_status, current_phase, phase_override, phase_started_at, checkout_url, cart_closes_at, landing_page_headline, landing_page_subheadline, plan_week_start, plan_week_end, agent_brief";



type Ctx = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

async function requireOwnedProject(context: Ctx, projectId: string): Promise<string> {
  const { data: project, error } = await context.supabase
    .from("projects")
    .select("id")
    .eq("user_id", context.userId)
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project?.id) throw new Error("That workspace is not available.");
  return project.id as string;
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Give the campaign a title.").max(200),
  theme: z.string().trim().min(1, "Add a campaign theme.").max(600),
  duration: z.enum(["90-day", "30-day"]),
  assets: z.object({
    socialPosts: z.boolean().default(false),
    landingPage: z.boolean().default(false),
    leadMagnet: z.boolean().default(false),
    emailSequence: z.boolean().default(false),
    imagePack: z.boolean().default(false),
    blog: z.boolean().default(false),
  }),
  projectId: z.string().uuid(),
  planWeekStart: z.number().int().min(1).max(13).nullable().optional(),
  planWeekEnd: z.number().int().min(1).max(13).nullable().optional(),
});

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    if (
      data.planWeekStart != null &&
      data.planWeekEnd != null &&
      data.planWeekStart > data.planWeekEnd
    ) {
      throw new Error("The first week of the campaign can't come after the last.");
    }
    const chosen = Object.values(data.assets).some(Boolean);
    if (!chosen) throw new Error("Pick at least one thing to generate.");

    const projectId = await requireOwnedProject(ctx, data.projectId);

    const { data: row, error } = await ctx.supabase
      .from("campaigns")
      .insert({
        user_id: ctx.userId,
        project_id: projectId,
        campaign_title: data.title,
        campaign_theme: data.theme,
        campaign_duration: data.duration,
        plan_week_start: data.planWeekStart ?? null,
        plan_week_end: data.planWeekEnd ?? null,
        has_social_posts: data.assets.socialPosts,
        has_landing_page: data.assets.landingPage,
        has_lead_magnet: data.assets.leadMagnet,
        has_email_sequence: data.assets.emailSequence,
        has_image_pack: data.assets.imagePack,
        has_blog: data.assets.blog,
        status: "active",
        asset_status: {
          ...(data.assets.socialPosts ? { social_posts: "generating" } : {}),
          ...(data.assets.landingPage ? { landing_page: "generating" } : {}),
          ...(data.assets.leadMagnet ? { lead_magnet: "generating" } : {}),
          ...(data.assets.emailSequence ? { email_sequence: "generating" } : {}),
          ...(data.assets.imagePack ? { image_pack: "generating" } : {}),
          ...(data.assets.blog ? { blog: "generating" } : {}),
        },
      })
      .select(COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    const { fileCampaign } = await import("./packages.server");
    await fileCampaign(ctx, projectId, row as CampaignRecord);
    return row as CampaignRecord;
  });

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const projectId = await requireOwnedProject(ctx, data.projectId);
    const q = ctx.supabase.from("campaigns").select(COLUMNS).eq("user_id", ctx.userId).eq("project_id", projectId);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as CampaignRecord[];
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const projectId = await requireOwnedProject(ctx, data.projectId);
    const { data: row, error } = await ctx.supabase
      .from("campaigns")
      .select(COLUMNS)
      .eq("user_id", ctx.userId)
      .eq("project_id", projectId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as CampaignRecord | null;
  });

export const getLatestCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const projectId = await requireOwnedProject(ctx, data.projectId);
    const q = ctx.supabase.from("campaigns").select(COLUMNS).eq("user_id", ctx.userId).eq("project_id", projectId);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return ((rows ?? [])[0] ?? null) as CampaignRecord | null;
  });

export const setCampaignAssetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        key: z.enum(ASSET_KEYS),
        state: z.enum(["generating", "ready", "complete"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: row, error } = await ctx.supabase
      .from("campaigns")
      .select("asset_status")
      .eq("user_id", ctx.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That campaign isn't here any more.");
    const next = { ...((row.asset_status ?? {}) as Record<string, string>), [data.key]: data.state };
    const { data: updated, error: upErr } = await ctx.supabase
      .from("campaigns")
      .update({ asset_status: next })
      .eq("user_id", ctx.userId)
      .eq("id", data.id)
      .select(COLUMNS)
      .single();
    if (upErr) throw new Error(upErr.message);
    return updated as CampaignRecord;
  });

/** Set a 30-day campaign's phase by hand, or hand control back to the calendar. */
export const setCampaignPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        phase: z.number().int().min(1).max(4),
        override: z.boolean(),
        startedAt: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: row, error } = await ctx.supabase
      .from("campaigns")
      .update({
        current_phase: data.phase,
        phase_override: data.override,
        ...(data.startedAt === undefined ? {} : { phase_started_at: data.startedAt }),
      })
      .eq("user_id", ctx.userId)
      .eq("id", data.id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row as CampaignRecord;
  });

/** Checkout link and cart close time used by the phase 3 and phase 4 landing layouts. */
export const updateCampaignLaunchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        checkoutUrl: z
          .string()
          .trim()
          .max(600)
          .refine((v) => v === "" || /^https?:\/\//i.test(v), "Use a full link starting with https://")
          .nullable()
          .optional(),
        cartClosesAt: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const patch: Record<string, unknown> = {};
    if (data.checkoutUrl !== undefined) patch["checkout_url"] = data.checkoutUrl?.trim() || null;
    if (data.cartClosesAt !== undefined) patch["cart_closes_at"] = data.cartClosesAt;
    const { data: row, error } = await ctx.supabase
      .from("campaigns")
      .update(patch)
      .eq("user_id", ctx.userId)
      .eq("id", data.id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row as CampaignRecord;
  });

/** Which stretch of the 90-day plan this campaign covers. */
export const setCampaignPlanWeeks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        planWeekStart: z.number().int().min(1).max(13).nullable(),
        planWeekEnd: z.number().int().min(1).max(13).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    if (data.planWeekStart != null && data.planWeekEnd != null && data.planWeekStart > data.planWeekEnd) {
      throw new Error("The first week of the campaign can't come after the last.");
    }
    const { data: row, error } = await ctx.supabase
      .from("campaigns")
      .update({ plan_week_start: data.planWeekStart, plan_week_end: data.planWeekEnd })
      .eq("user_id", ctx.userId)
      .eq("id", data.id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row as CampaignRecord;
  });

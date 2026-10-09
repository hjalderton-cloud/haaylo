/**
 * Server-only tool runners.
 *
 * Every registry tool that can actually execute has one plain async function
 * here. They are never imported from client-reachable modules directly — the
 * server functions in `adapters.ts` and `approvals.functions.ts` pull this
 * module in with a dynamic import inside their handlers.
 *
 * Each runner assumes workspace ownership has already been verified by the
 * caller via `assertOwnedWorkspace`.
 */
import { assertOwnedWorkspace, assertCampaignInWorkspace } from "./guards";
import { generateNinetyDayPlan } from "@/lib/strategy.server";
import { loadBrandContext } from "@/lib/brand-context.server";
import { generateLeadMagnet, generateEmailSequence } from "@/lib/funnel.server";
import {
  listLiveConnections,
  bookedSlots,
  slotFor,
  queueToLiveAccounts,
} from "@/lib/agent-publish.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ctx = { userId: string; supabase: any };

export const POST_COLUMNS =
  "id, project_id, caption, title, platform, pillar, status, scheduled_at, published_at, media_url, media_path, plan_slot, hashtags, meta, scheduled_post_id, campaign_id, paired_landing_page_id, paired_guide_campaign_id, created_at, updated_at";

export const CAMPAIGN_COLUMNS =
  "id, project_id, campaign_title, campaign_theme, campaign_duration, has_social_posts, has_landing_page, has_lead_magnet, has_email_sequence, has_image_pack, has_blog, status, created_at, asset_status, current_phase, phase_override, phase_started_at, checkout_url, cart_closes_at, landing_page_headline, landing_page_subheadline, plan_week_start, plan_week_end, agent_brief";

const ANALYTICS_COLUMNS =
  "id, title, caption, platform, pillar, status, published_at, scheduled_at, created_at, campaign_id, meta";


// ── LOW: reads ──────────────────────────────────────────────────────────────

export async function runFetchBrandContext(ctx: Ctx, input: { workspaceId: string }) {
  const { data: row, error } = await ctx.supabase
    .from("business_brains")
    .select("data, updated_at")
    .eq("project_id", input.workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    workspaceId: input.workspaceId,
    data: (row?.data ?? {}) as Record<string, unknown>,
    updated_at: (row?.updated_at as string | null) ?? null,
  };
}

export async function runFetchStrategy(ctx: Ctx, input: { workspaceId: string }) {
  const { data: row, error } = await ctx.supabase
    .from("strategy_plans")
    .select("plan, updated_at")
    .eq("user_id", ctx.userId)
    .eq("project_id", input.workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    plan: (row?.plan ?? null) as unknown,
    updatedAt: (row?.updated_at as string | null) ?? null,
  };
}

export async function runFetchPreviousContent(
  ctx: Ctx,
  input: { workspaceId: string; status?: string; campaignId?: string; limit?: number },
) {
  let q = ctx.supabase
    .from("content_posts")
    .select(POST_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("project_id", input.workspaceId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);
  if (input.status) q = q.eq("status", input.status);
  if (input.campaignId) q = q.eq("campaign_id", input.campaignId);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  return rows ?? [];
}

export async function runFetchCampaign(
  ctx: Ctx,
  input: { workspaceId: string; campaignId: string },
) {
  const { data: row, error } = await ctx.supabase
    .from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("project_id", input.workspaceId)
    .eq("id", input.campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return row ?? null;
}

export async function runFetchAnalytics(ctx: Ctx, input: { workspaceId: string }) {
  const { data: rows, error } = await ctx.supabase
    .from("content_posts")
    .select(ANALYTICS_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("project_id", input.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const posts = (rows ?? []).map((r: Record<string, unknown>) => {
    const meta = (r["meta"] ?? {}) as Record<string, unknown>;
    return {
      id: String(r["id"]),
      title:
        ((r["title"] as string | null) || "").trim() ||
        ((r["caption"] as string | null) || "").trim().slice(0, 60) ||
        "Untitled post",
      caption: (r["caption"] as string | null) ?? "",
      platform: (r["platform"] as string | null) ?? null,
      pillar: (r["pillar"] as string | null) ?? null,
      status: (r["status"] as string | null) ?? "draft",
      publishedAt:
        (r["published_at"] as string | null) ?? (r["scheduled_at"] as string | null) ?? null,
      externalId: typeof meta["external_post_id"] === "string" ? meta["external_post_id"] : null,
      campaignId: (r["campaign_id"] as string | null) ?? null,
    };
  });
  return { posts };
}

// ── LOW: draft creation ─────────────────────────────────────────────────────

export async function runCreateSocialContent(
  ctx: Ctx,
  input: {
    workspaceId: string;
    caption: string;
    title?: string | null;
    platform: string;
    pillar?: string | null;
    campaignId?: string | null;
  },
) {
  if (input.campaignId) {
    await assertCampaignInWorkspace(ctx, input.workspaceId, input.campaignId);
  }
  const { data: saved, error } = await ctx.supabase
    .from("content_posts")
    .insert({
      user_id: ctx.userId,
      project_id: input.workspaceId,
      caption: input.caption,
      title: input.title ?? null,
      platform: input.platform,
      pillar: input.pillar ?? null,
      status: "draft",
      campaign_id: input.campaignId ?? null,
      hashtags: [],
      meta: {},
    })
    .select(POST_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return saved;
}

// ── MEDIUM: writes and generation (approval required) ───────────────────────

export async function runCreateCampaign(
  ctx: Ctx,
  input: {
    workspaceId: string;
    title: string;
    theme: string;
    duration: "90-day" | "30-day";
    assets: Record<string, boolean>;
    planWeekStart?: number | null;
    planWeekEnd?: number | null;
    brief?: unknown;
  },
) {
  if (
    input.planWeekStart != null &&
    input.planWeekEnd != null &&
    input.planWeekStart > input.planWeekEnd
  ) {
    throw new Error("The first week of the campaign can't come after the last.");
  }
  if (!Object.values(input.assets).some(Boolean)) {
    throw new Error("Pick at least one thing to generate.");
  }
  const a = input.assets;
  const { data: row, error } = await ctx.supabase
    .from("campaigns")
    .insert({
      user_id: ctx.userId,
      project_id: input.workspaceId,
      campaign_title: input.title,
      campaign_theme: input.theme,
      campaign_duration: input.duration,
      plan_week_start: input.planWeekStart ?? null,
      plan_week_end: input.planWeekEnd ?? null,
      agent_brief: input.brief ?? null,
      has_social_posts: !!a["socialPosts"],
      has_landing_page: !!a["landingPage"],
      has_lead_magnet: !!a["leadMagnet"],
      has_email_sequence: !!a["emailSequence"],
      has_image_pack: !!a["imagePack"],
      has_blog: !!a["blog"],
      status: "active",
      asset_status: {
        ...(a["socialPosts"] ? { social_posts: "generating" } : {}),
        ...(a["landingPage"] ? { landing_page: "generating" } : {}),
        ...(a["leadMagnet"] ? { lead_magnet: "generating" } : {}),
        ...(a["emailSequence"] ? { email_sequence: "generating" } : {}),
        ...(a["imagePack"] ? { image_pack: "generating" } : {}),
        ...(a["blog"] ? { blog: "generating" } : {}),
      },
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const { fileCampaign } = await import("../packages.server");
  await fileCampaign(ctx, input.workspaceId, row);
  return row;
}

export async function runUpdateCampaign(
  ctx: Ctx,
  input: {
    workspaceId: string;
    campaignId: string;
    planWeekStart: number | null;
    planWeekEnd: number | null;
  },
) {
  await assertCampaignInWorkspace(ctx, input.workspaceId, input.campaignId);
  if (
    input.planWeekStart != null &&
    input.planWeekEnd != null &&
    input.planWeekStart > input.planWeekEnd
  ) {
    throw new Error("The first week of the campaign can't come after the last.");
  }
  const { data: row, error } = await ctx.supabase
    .from("campaigns")
    .update({ plan_week_start: input.planWeekStart, plan_week_end: input.planWeekEnd })
    .eq("user_id", ctx.userId)
    .eq("project_id", input.workspaceId)
    .eq("id", input.campaignId)
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return row;
}

export async function runCreateStrategy(
  ctx: Ctx,
  input: { workspaceId: string; goal: string; name?: string; postsPerWeek: number },
) {
  const { prompt: grounding } = await loadBrandContext(ctx, input.workspaceId);
  const plan = await generateNinetyDayPlan(grounding, {
    goal: input.goal,
    postsPerWeek: input.postsPerWeek,
    ...(input.name ? { name: input.name } : {}),
  });
  const stamp = new Date().toISOString();
  const { data: existing } = await ctx.supabase
    .from("strategy_plans")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("project_id", input.workspaceId)
    .maybeSingle();
  const { error } = existing?.id
    ? await ctx.supabase
        .from("strategy_plans")
        .update({ plan, updated_at: stamp })
        .eq("id", existing.id)
    : await ctx.supabase
        .from("strategy_plans")
        .insert({ user_id: ctx.userId, project_id: input.workspaceId, plan, updated_at: stamp });
  if (error) throw new Error(error.message);
  const { fileStrategy } = await import("../packages.server");
  await fileStrategy(ctx, input.workspaceId, plan as never);
  return { plan, updatedAt: stamp };
}

async function saveFunnelOutput(
  ctx: Ctx,
  workspaceId: string,
  inputs: { problem: string; offer: string; magnetType: string; price: string },
  kind: "magnet" | "emails",
  output: string,
) {
  const patch = {
    problem: inputs.problem,
    offer: inputs.offer,
    magnet_type: inputs.magnetType,
    price: inputs.price,
    ...(kind === "magnet" ? { magnet_output: output } : { email_output: output }),
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await ctx.supabase
    .from("funnels")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("project_id", workspaceId)
    .maybeSingle();
  const { error } = existing?.id
    ? await ctx.supabase.from("funnels").update(patch).eq("id", existing.id)
    : await ctx.supabase
        .from("funnels")
        .insert({ user_id: ctx.userId, project_id: workspaceId, ...patch });
  if (error) throw new Error(error.message);
}

export async function runCreateLeadMagnet(
  ctx: Ctx,
  input: {
    workspaceId: string;
    problem: string;
    offer: string;
    magnetType: string;
    price: string;
  },
) {
  const { prompt: grounding } = await loadBrandContext(ctx, input.workspaceId);
  const output = await generateLeadMagnet(grounding, input);
  await saveFunnelOutput(ctx, input.workspaceId, input, "magnet", output);
  return { output };
}

export async function runCreateEmailDraft(
  ctx: Ctx,
  input: {
    workspaceId: string;
    problem: string;
    offer: string;
    magnetType: string;
    price: string;
  },
) {
  const { prompt: grounding } = await loadBrandContext(ctx, input.workspaceId);
  const output = await generateEmailSequence(grounding, input);
  await saveFunnelOutput(ctx, input.workspaceId, input, "emails", output);
  return { output };
}

export async function runCreateLandingPage(ctx: Ctx, input: { workspaceId: string }) {
  const root = "untitled-page";
  let slug = root;
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const { data } = await ctx.supabase
      .from("landing_pages")
      .select("id")
      .eq("slug", candidate)
      .limit(1);
    if (!data || data.length === 0) {
      slug = candidate;
      break;
    }
    slug = `${root}-${Math.random().toString(36).slice(2, 7)}`;
  }
  const { data, error } = await ctx.supabase
    .from("landing_pages")
    .insert({
      user_id: ctx.userId,
      project_id: input.workspaceId,
      title: "Untitled page",
      slug,
      status: "draft",
      content: {},
    })
    .select("id, slug")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, slug: data.slug as string };
}

export async function runSaveAsset(
  ctx: Ctx,
  input: {
    workspaceId: string;
    kind: string;
    title?: string;
    body?: string;
    tags?: string[];
    collection?: string;
  },
) {
  const { data: row, error } = await ctx.supabase
    .from("content_bank_items")
    .insert({
      project_id: input.workspaceId,
      user_id: ctx.userId,
      kind: input.kind,
      title: input.title ?? null,
      body: input.body ?? null,
      tags: input.tags ?? [],
      collection: input.collection ?? null,
      meta: { source: "agent" },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string };
}

// ── HIGH: scheduling and publishing (always approval) ───────────────────────

async function requirePostInWorkspace(ctx: Ctx, workspaceId: string, postId: string) {
  const { data, error } = await ctx.supabase
    .from("content_posts")
    .select(POST_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("project_id", workspaceId)
    .eq("id", postId)
    .maybeSingle();
  if (error || !data?.id) throw new Error("That post is not in this workspace.");
  return data as Record<string, unknown>;
}

export async function runScheduleContent(
  ctx: Ctx,
  input: { workspaceId: string; postId: string; scheduledAt: string | null },
) {
  await requirePostInWorkspace(ctx, input.workspaceId, input.postId);
  if (input.scheduledAt && Number.isNaN(Date.parse(input.scheduledAt))) {
    throw new Error("That schedule time is not a real date.");
  }
  const { data, error } = await ctx.supabase
    .from("content_posts")
    .update({
      scheduled_at: input.scheduledAt,
      status: input.scheduledAt ? "scheduled" : "draft",
    })
    .eq("user_id", ctx.userId)
    .eq("project_id", input.workspaceId)
    .eq("id", input.postId)
    .select(POST_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function runPublishContent(
  ctx: Ctx,
  input: { workspaceId: string; postId: string },
) {
  const post = await requirePostInWorkspace(ctx, input.workspaceId, input.postId);
  if (post["scheduled_post_id"]) {
    throw new Error("That post is already in the publishing queue.");
  }
  const connections = await listLiveConnections(ctx.supabase, ctx.userId);
  const taken = await bookedSlots(ctx.supabase, ctx.userId);
  const scheduledAt =
    typeof post["scheduled_at"] === "string" && post["scheduled_at"]
      ? new Date(post["scheduled_at"] as string).toISOString()
      : slotFor(0, taken);
  const result = await queueToLiveAccounts(ctx.supabase, {
    userId: ctx.userId,
    contentPostId: input.postId,
    caption: (post["caption"] as string) ?? "",
    platform: (post["platform"] as string) ?? "linkedin",
    pillar: (post["pillar"] as string | null) ?? null,
    mediaUrl: (post["media_url"] as string | null) ?? null,
    mediaPath: (post["media_path"] as string | null) ?? null,
    scheduledAt,
    connections,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** HIGH: push one email into Mailchimp and book its send time. */
async function runSendEmailCampaign(
  ctx: Ctx,
  input: {
    workspaceId: string;
    subject: string;
    body: string;
    campaignTitle: string;
    scheduledAt: string | null;
  },
) {
  const { getMailchimpCreds, getPrimaryAudienceId } = await import("@/lib/mailchimp-leads.server");
  const { createAndScheduleCampaign } = await import("@/lib/mailchimp-campaign.server");

  const creds = await getMailchimpCreds(ctx.supabase, ctx.userId);
  if (!creds) {
    throw new Error("No Mailchimp account is connected yet. Add your key on the Account page first.");
  }
  const audienceId = await getPrimaryAudienceId(creds);

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  const replyTo = (profile?.email as string | null) ?? "";
  if (!replyTo) throw new Error("Your account has no email address for Mailchimp to reply to.");

  return await createAndScheduleCampaign(creds, {
    audienceId,
    subject: input.subject,
    body: input.body,
    title: input.campaignTitle,
    fromName: (profile?.full_name as string | null) || "Haaylo",
    replyTo,
    scheduledAt: input.scheduledAt,
  });
}

// ── dispatch ────────────────────────────────────────────────────────────────

const RUNNERS: Record<string, (ctx: Ctx, input: never) => Promise<unknown>> = {
  fetch_brand_context: runFetchBrandContext as never,
  fetch_strategy: runFetchStrategy as never,
  fetch_previous_content: runFetchPreviousContent as never,
  fetch_campaign: runFetchCampaign as never,
  fetch_analytics: runFetchAnalytics as never,
  create_social_content: runCreateSocialContent as never,
  create_campaign: runCreateCampaign as never,
  update_campaign: runUpdateCampaign as never,
  create_strategy: runCreateStrategy as never,
  create_lead_magnet: runCreateLeadMagnet as never,
  create_email_draft: runCreateEmailDraft as never,
  create_landing_page: runCreateLandingPage as never,
  save_asset: runSaveAsset as never,
  schedule_content: runScheduleContent as never,
  publish_content: runPublishContent as never,
  send_email_campaign: runSendEmailCampaign as never,
};

/** Names of every tool with a working runner. Must match `available` in the catalogue. */
export const RUNNABLE_TOOLS = Object.keys(RUNNERS);

/**
 * Execute a tool by name. The caller must already have validated the input
 * against the tool's schema, checked approval, and verified workspace ownership.
 */
export async function executeTool(
  ctx: Ctx,
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const runner = RUNNERS[toolName];
  if (!runner) throw new Error(`No runner for tool "${toolName}".`);
  await assertOwnedWorkspace(ctx, String(input["workspaceId"] ?? ""));
  return runner(ctx, input as never);
}

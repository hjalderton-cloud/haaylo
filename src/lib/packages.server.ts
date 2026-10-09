/**
 * Filing helpers: every generator calls one of these after saving its assets,
 * so each creation session lands as one package. Filing is best-effort — a
 * packaging hiccup is logged and never costs the user their generated work.
 */
import { addItemsCore, createPackageCore, type AssetType } from "./packages.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[packages] ${label} failed`, err);
    return null;
  }
}

/** The package that already holds this asset, if any (oldest first). */
async function packageHolding(ctx: Ctx, assetType: AssetType, assetId: string): Promise<{ id: string; project_id: string } | null> {
  const { data } = await ctx.supabase
    .from("work_package_items")
    .select("package_id, project_id, created_at")
    .eq("user_id", ctx.userId)
    .eq("asset_type", assetType)
    .eq("asset_id", assetId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.package_id, project_id: data.project_id } : null;
}

function dateLabel() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** A new campaign becomes its own package. */
export function fileCampaign(ctx: Ctx, projectId: string | null | undefined, campaign: { id: string; campaign_title?: string; title?: string }) {
  if (!projectId) return Promise.resolve(null);
  return safe("campaign", () =>
    createPackageCore(ctx, {
      projectId,
      type: "campaign",
      title: campaign.campaign_title ?? campaign.title ?? "Campaign",
      items: [{ assetType: "campaign", assetId: campaign.id }],
    }),
  );
}

/** A newly generated 90-day strategy, with a snapshot of exactly what was generated. */
export function fileStrategy(ctx: Ctx, projectId: string, plan: { name?: string; goal?: string } & Record<string, unknown>) {
  return safe("strategy", async () => {
    const { data: row } = await ctx.supabase
      .from("strategy_plans")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("project_id", projectId)
      .maybeSingle();
    return createPackageCore(ctx, {
      projectId,
      type: "strategy",
      title: plan.name?.trim() || `90-day strategy, ${dateLabel()}`,
      meta: { goal: plan.goal ?? "", snapshot: plan as never },
      items: row?.id ? [{ assetType: "strategy_plan", assetId: row.id }] : [],
    });
  });
}

/** The latest strategy package for a workspace — the parent when a plan is built from it. */
async function latestStrategyPackage(ctx: Ctx, projectId: string): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("work_packages")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("project_id", projectId)
    .eq("package_type", "strategy")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Posts from one generation run. Campaign posts join their campaign's package;
 * posts drawn from 90-day plan weeks become a content plan linked to that strategy;
 * anything else is a standalone post batch.
 */
export function filePostBatch(
  ctx: Ctx,
  input: {
    projectId: string;
    postIds: string[];
    title: string;
    campaignId?: string | null;
    fromPlanWeeks?: { from: number | null; to: number | null };
    meta?: Record<string, unknown>;
  },
) {
  if (!input.postIds.length) return Promise.resolve(null);
  const items = input.postIds.map((id) => ({ assetType: "content_post" as const, assetId: id }));
  return safe("post batch", async () => {
    if (input.campaignId) {
      const holder = await packageHolding(ctx, "campaign", input.campaignId);
      if (holder) {
        await addItemsCore(ctx, holder.id, holder.project_id, items.map((i) => ({ ...i, section: "Social posts" })));
        return holder;
      }
      const { data: c } = await ctx.supabase.from("campaigns").select("id, campaign_title").eq("id", input.campaignId).maybeSingle();
      if (c) {
        const pkg = await fileCampaign(ctx, input.projectId, c);
        if (pkg) await addItemsCore(ctx, pkg.id, input.projectId, items.map((i) => ({ ...i, section: "Social posts" })));
        return pkg;
      }
    }
    const fromPlan = input.fromPlanWeeks && (input.fromPlanWeeks.from != null || input.fromPlanWeeks.to != null);
    return createPackageCore(ctx, {
      projectId: input.projectId,
      type: fromPlan ? "content_plan" : "post_batch",
      title: input.title.trim() || `${input.postIds.length} social posts, ${dateLabel()}`,
      parentPackageId: fromPlan ? await latestStrategyPackage(ctx, input.projectId) : null,
      meta: { ...(input.meta ?? {}), ...(fromPlan ? { weeks: input.fromPlanWeeks } : {}) } as never,
      items,
    });
  });
}

/** A landing page: joins its campaign's package when it has one, otherwise stands alone. */
export function fileLandingPage(
  ctx: Ctx,
  input: { projectId: string | null | undefined; pageId: string; title: string; campaignId?: string | null; source?: string },
) {
  const projectId = input.projectId;
  if (!projectId) return Promise.resolve(null);
  const item = { assetType: "landing_page" as const, assetId: input.pageId, section: "Landing page" };
  return safe("landing page", async () => {
    if (input.campaignId) {
      const holder = await packageHolding(ctx, "campaign", input.campaignId);
      if (holder) {
        await addItemsCore(ctx, holder.id, holder.project_id, [item]);
        return holder;
      }
    }
    return createPackageCore(ctx, {
      projectId,
      type: "landing_page",
      title: input.title,
      source: input.source ?? "generated",
      items: [item],
    });
  });
}

/**
 * Emails, images or lead-magnet assets from one generation run. With a campaign they
 * join that campaign's package under a named section; otherwise they form their own package.
 */
export function fileAssets(
  ctx: Ctx,
  input: {
    projectId: string | null | undefined;
    assetType: AssetType;
    ids: string[];
    section: string;
    fallbackType: "email_sequence" | "image_pack" | "lead_magnet";
    title: string;
    campaignId?: string | null;
  },
) {
  if (!input.ids.length) return Promise.resolve(null);
  const items = input.ids.map((id) => ({ assetType: input.assetType, assetId: id, section: input.section }));
  return safe(input.fallbackType, async () => {
    if (input.campaignId) {
      let holder = await packageHolding(ctx, "campaign", input.campaignId);
      if (!holder) {
        const { data: c } = await ctx.supabase
          .from("campaigns")
          .select("id, campaign_title, project_id")
          .eq("id", input.campaignId)
          .maybeSingle();
        const pid = input.projectId ?? c?.project_id;
        if (c && pid) {
          const pkg = await fileCampaign(ctx, pid, c);
          if (pkg) holder = { id: pkg.id, project_id: pid };
        }
      }
      if (holder) {
        await addItemsCore(ctx, holder.id, holder.project_id, items);
        return holder;
      }
    }
    if (!input.projectId) return null;
    return createPackageCore(ctx, {
      projectId: input.projectId,
      type: input.fallbackType,
      title: input.title.trim() || `${input.section}, ${dateLabel()}`,
      items,
    });
  });
}

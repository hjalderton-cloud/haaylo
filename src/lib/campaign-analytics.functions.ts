import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AnalyticsCampaign = {
  id: string;
  title: string;
  theme: string | null;
  duration: string | null;
  createdAt: string;
};

export type AnalyticsPost = {
  id: string;
  title: string;
  caption: string;
  platform: string | null;
  pillar: string | null;
  status: string;
  publishedAt: string | null;
  /** Id of the matching post on the connected channel, when it went out live. */
  externalId: string | null;
};


export type AnalyticsPage = {
  id: string;
  title: string;
  slug: string;
};

export type AnalyticsLead = {
  date: string;
  pageId: string | null;
};

export type CampaignAnalytics = {
  campaigns: AnalyticsCampaign[];
  campaignId: string | null;
  posts: AnalyticsPost[];
  pages: AnalyticsPage[];
  leads: AnalyticsLead[];
};

type Ctx = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

async function resolveProjectId(ctx: Ctx, projectId?: string | null): Promise<string | null> {
  if (projectId) return projectId;
  const { data: def } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("is_default", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (def?.id) return def.id as string;
  const { data: first } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (first?.id as string | undefined) ?? null;
}

const schema = z.object({
  projectId: z.string().uuid().nullish(),
  campaignId: z.string().uuid().nullish(),
});

/** Everything the Campaign Analytics screen needs for one campaign. */
export const getCampaignAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<CampaignAnalytics> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);

    let campaignQuery = ctx.supabase
      .from("campaigns")
      .select("id, campaign_title, campaign_theme, campaign_duration, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (projectId) campaignQuery = campaignQuery.eq("project_id", projectId);
    const { data: campaignRows } = await campaignQuery;

    const campaigns: AnalyticsCampaign[] = (campaignRows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r["id"]),
      title: (r["campaign_title"] as string | null) || "Untitled campaign",
      theme: (r["campaign_theme"] as string | null) ?? null,
      duration: (r["campaign_duration"] as string | null) ?? null,
      createdAt: String(r["created_at"]),
    }));

    const campaignId =
      (data.campaignId && campaigns.some((c) => c.id === data.campaignId)
        ? data.campaignId
        : campaigns[0]?.id) ?? null;

    if (!campaignId) {
      return { campaigns, campaignId: null, posts: [], pages: [], leads: [] };
    }

    const { data: postRows } = await ctx.supabase
      .from("content_posts")
      .select("id, title, caption, platform, pillar, status, published_at, scheduled_at, created_at, meta")
      .eq("user_id", ctx.userId)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(500);

    const posts: AnalyticsPost[] = (postRows ?? []).map((r: Record<string, unknown>) => {
      const meta = (r["meta"] ?? {}) as Record<string, unknown>;
      const external = meta["external_post_id"];
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
          (r["published_at"] as string | null) ??
          (r["scheduled_at"] as string | null) ??
          null,
        externalId: typeof external === "string" && external ? external : null,
      };
    });


    const { data: pageRows } = await ctx.supabase
      .from("landing_pages")
      .select("id, title, slug")
      .eq("user_id", ctx.userId)
      .eq("campaign_id", campaignId)
      .limit(50);

    const pages: AnalyticsPage[] = (pageRows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r["id"]),
      title: (r["title"] as string | null) || "Landing page",
      slug: (r["slug"] as string | null) || "",
    }));

    const { data: leadRows } = await ctx.supabase
      .from("landing_page_leads")
      .select("created_at, page_id")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(2000);

    const leads: AnalyticsLead[] = (leadRows ?? []).map((r: Record<string, unknown>) => ({
      date: String(r["created_at"]).slice(0, 10),
      pageId: (r["page_id"] as string | null) ?? null,
    }));

    return { campaigns, campaignId, posts, pages, leads };
  });

/**
 * Campaign Launch Run.
 *
 * Once a campaign has been built, these functions answer the only question the
 * owner actually has: what do I do now, and what has already been handled for
 * me? Everything is workspace-scoped and read through the signed-in user's own
 * session, so a campaign in another workspace is never visible.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

/** Published site, never the preview address: these links get pasted elsewhere. */
export const PUBLIC_ORIGIN = "https://haaylo.com";

export type LaunchStatus = {
  campaignId: string;
  /** The opt-in page, if this campaign has one. */
  landing: {
    id: string;
    slug: string;
    live: boolean;
    url: string;
    embedInline: string;
    embedPopup: string;
  } | null;
  /** The downloadable guide, if this campaign has one. */
  guide: { title: string; ready: boolean; url: string } | null;
  posts: {
    total: number;
    drafts: number;
    scheduled: number;
    published: number;
    nextAt: string | null;
  };
  emails: number;
  blog: boolean;
  images: number;
};

async function ownedCampaign(ctx: Ctx, campaignId: string, projectId?: string | null) {
  let q = ctx.supabase
    .from("campaigns")
    .select(
      "id, project_id, campaign_title, guide_title, guide_sections, has_landing_page, has_lead_magnet, has_email_sequence, has_blog, has_image_pack, has_social_posts",
    )
    .eq("id", campaignId)
    .eq("user_id", ctx.userId);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That campaign isn't in this workspace.");
  return data as Record<string, unknown>;
}

const scoped = z.object({
  campaignId: z.string().uuid(),
  projectId: z.string().uuid().nullish(),
});

/** Everything the launch checklist needs, in one round trip. */
export const getLaunchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scoped.parse(input))
  .handler(async ({ data, context }): Promise<LaunchStatus> => {
    const ctx = context as unknown as Ctx;
    const campaign = await ownedCampaign(ctx, data.campaignId, data.projectId);

    const [pageRes, postsRes, bankRes, seqRes] = await Promise.all([
      ctx.supabase
        .from("landing_pages")
        .select("id, slug, status")
        .eq("user_id", ctx.userId)
        .eq("campaign_id", data.campaignId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      ctx.supabase
        .from("content_posts")
        .select("id, status, scheduled_at")
        .eq("user_id", ctx.userId)
        .contains("meta", { campaign_id: data.campaignId }),
      ctx.supabase
        .from("content_bank_items")
        .select("id, kind")
        .eq("user_id", ctx.userId)
        .contains("meta", { campaign_id: data.campaignId }),
      ctx.supabase
        .from("email_sequences")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("campaign_id", data.campaignId),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts = ((postsRes?.data ?? []) as any[]).map((p) => ({
      status: String(p.status ?? "draft"),
      scheduledAt: typeof p.scheduled_at === "string" ? p.scheduled_at : null,
    }));
    const now = Date.now();
    const upcoming = posts
      .map((p) => p.scheduledAt)
      .filter((s): s is string => !!s && new Date(s).getTime() > now)
      .sort();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bank = (bankRes?.data ?? []) as any[];
    const page = pageRes?.data as { id: string; slug: string; status: string } | null;

    const guideSections = Array.isArray(campaign["guide_sections"]) ? campaign["guide_sections"] : [];
    const guideTitle = typeof campaign["guide_title"] === "string" ? campaign["guide_title"] : "";

    return {
      campaignId: data.campaignId,
      landing:
        campaign["has_landing_page"] === true && page
          ? {
              id: page.id,
              slug: page.slug,
              live: page.status === "live",
              url: `${PUBLIC_ORIGIN}/p/${page.slug}`,
              embedInline: `<div id="haaylo-form"></div>\n<script src="${PUBLIC_ORIGIN}/api/public/embed.js?p=${page.slug}&mode=inline" async></script>`,
              embedPopup: `<script src="${PUBLIC_ORIGIN}/api/public/embed.js?p=${page.slug}&mode=popup" async></script>`,
            }
          : null,
      guide:
        campaign["has_lead_magnet"] === true
          ? {
              title: guideTitle || "Your guide",
              ready: guideSections.length > 0,
              url: `${PUBLIC_ORIGIN}/guide/${data.campaignId}`,
            }
          : null,
      posts: {
        total: posts.length,
        drafts: posts.filter((p) => p.status === "draft").length,
        scheduled: posts.filter((p) => p.status === "scheduled").length,
        published: posts.filter((p) => p.status === "published").length,
        nextAt: upcoming[0] ?? null,
      },
      emails:
        (seqRes?.data?.length ?? 0) || bank.filter((b) => b.kind === "email").length,
      blog: bank.some((b) => b.kind === "blog"),
      images: bank.filter((b) => b.kind === "image" || b.kind === "image_prompt").length,
    };
  });

/** Puts this campaign's opt-in page live so it can take sign-ups. */
export const publishCampaignLanding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scoped.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await ownedCampaign(ctx, data.campaignId, data.projectId);

    const { data: page, error: readError } = await ctx.supabase
      .from("landing_pages")
      .select("id, slug")
      .eq("user_id", ctx.userId)
      .eq("campaign_id", data.campaignId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!page) throw new Error("This campaign doesn't have an opt-in page yet.");

    const { error } = await ctx.supabase
      .from("landing_pages")
      .update({ status: "live" })
      .eq("id", page.id)
      .eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);

    return { slug: page.slug as string, url: `${PUBLIC_ORIGIN}/p/${page.slug}` };
  });

const scheduleInput = scoped.extend({
  /** How many unscheduled posts to put in the diary. */
  howMany: z.number().int().min(1).max(30).default(3),
  /** First send is this many days from today. */
  startInDays: z.number().int().min(0).max(30).default(1),
  /** Local hour of day to send at. */
  hour: z.number().int().min(0).max(23).default(9),
});

/**
 * Puts the next few unscheduled posts in the diary: one per weekday, at the
 * same time each day, starting tomorrow. Anything already scheduled or
 * published is left exactly as it is.
 */
export const scheduleCampaignPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await ownedCampaign(ctx, data.campaignId, data.projectId);

    const { data: rows, error } = await ctx.supabase
      .from("content_posts")
      .select("id, created_at")
      .eq("user_id", ctx.userId)
      .eq("status", "draft")
      .is("scheduled_at", null)
      .contains("meta", { campaign_id: data.campaignId })
      .order("created_at", { ascending: true })
      .limit(data.howMany);
    if (error) throw new Error(error.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts = (rows ?? []) as any[];
    if (posts.length === 0) return { scheduled: 0, firstAt: null as string | null };

    const slots: string[] = [];
    const cursor = new Date();
    cursor.setUTCHours(data.hour, 0, 0, 0);
    cursor.setUTCDate(cursor.getUTCDate() + data.startInDays);
    while (slots.length < posts.length) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) slots.push(new Date(cursor).toISOString());
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    await Promise.all(
      posts.map((p, i) =>
        ctx.supabase
          .from("content_posts")
          .update({ scheduled_at: slots[i], status: "scheduled" })
          .eq("id", p.id)
          .eq("user_id", ctx.userId),
      ),
    );

    return { scheduled: posts.length, firstAt: slots[0] ?? null };
  });

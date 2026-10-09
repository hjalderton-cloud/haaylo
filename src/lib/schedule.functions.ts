import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ContentPost } from "@/lib/content.functions";

const SELECT =
  "id, project_id, caption, title, platform, pillar, status, scheduled_at, published_at, media_url, media_path, plan_slot, hashtags, meta, scheduled_post_id, campaign_id, paired_landing_page_id, paired_guide_campaign_id, created_at, updated_at";

export type ScheduleLink = {
  id: string;
  title: string;
  slug: string;
  status: string;
  campaign_id: string | null;
  url: string;
};

export type ScheduleWorkspace = {
  posts: ContentPost[];
  campaigns: Array<{ id: string; title: string }>;
  links: ScheduleLink[];
  brand: { name: string; logoUrl: string | null };
};

const workspaceInput = z
  .object({ projectId: z.string().uuid().nullish() })
  .default({});

/** Everything the Schedule & Publish workspace needs in one round trip. */
export const getScheduleWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string | null } | undefined) => workspaceInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ScheduleWorkspace> => {
    const { supabase, userId } = context;

    let postsQuery = supabase
      .from("content_posts")
      .select(SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(800);
    if (data.projectId) postsQuery = postsQuery.eq("project_id", data.projectId);

    let campaignQuery = supabase
      .from("campaigns")
      .select("id, campaign_title, project_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (data.projectId) campaignQuery = campaignQuery.or(`project_id.eq.${data.projectId},project_id.is.null`);

    let pageQuery = supabase
      .from("landing_pages")
      .select("id, title, slug, status, campaign_id, project_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (data.projectId) pageQuery = pageQuery.or(`project_id.eq.${data.projectId},project_id.is.null`);

    const [posts, campaigns, pages, brainRow, brandRow] = await Promise.all([
      postsQuery,
      campaignQuery,
      pageQuery,
      data.projectId
        ? supabase.from("business_brains").select("data").eq("project_id", data.projectId).maybeSingle()
        : Promise.resolve({ data: null, error: null } as { data: { data: unknown } | null; error: null }),
      supabase.from("brand_brain").select("brand_name, logo_url").eq("user_id", userId).maybeSingle(),
    ]);

    if (posts.error) throw new Error(posts.error.message);

    const brainData = (brainRow.data?.data ?? {}) as Record<string, unknown>;
    const business = (brainData["business"] ?? {}) as Record<string, unknown>;
    const brandBlock = (brainData["brand"] ?? {}) as Record<string, unknown>;
    const name =
      (typeof business["name"] === "string" && business["name"]) ||
      (typeof brandBlock["name"] === "string" && brandBlock["name"]) ||
      brandRow.data?.brand_name ||
      "Your business";

    return {
      posts: (posts.data ?? []) as unknown as ContentPost[],
      campaigns: (campaigns.data ?? []).map((c) => ({ id: c.id, title: c.campaign_title })),
      links: (pages.data ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        campaign_id: p.campaign_id,
        url: `https://haaylo.com/p/${p.slug}`,
      })),
      brand: { name: String(name), logoUrl: brandRow.data?.logo_url ?? null },
    };
  });

const scheduleInput = z.object({
  id: z.string().uuid(),
  scheduled_at: z.string().nullable(),
});

/** Sets or clears the schedule on a post and moves its status accordingly. */
export const setPostSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scheduleInput.parse(d))
  .handler(async ({ data, context }): Promise<ContentPost> => {
    const { data: current, error: readError } = await context.supabase
      .from("content_posts")
      .select("status")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (readError) throw new Error(readError.message);

    const published = current?.status === "published";
    const patch: Record<string, unknown> = {
      scheduled_at: data.scheduled_at,
      status: published ? "published" : data.scheduled_at ? "scheduled" : "draft",
    };

    const { data: saved, error } = await context.supabase
      .from("content_posts")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return saved as unknown as ContentPost;
  });

const queueNoteInput = z.object({
  id: z.string().uuid(),
  queued: z.boolean(),
  note: z.string().max(400).nullable(),
  externalId: z.string().max(120).nullish(),
});

/** Records whether the live queue accepted the post, without blocking the schedule. */
export const setPostQueueNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => queueNoteInput.parse(d))
  .handler(async ({ data, context }): Promise<ContentPost> => {
    const { data: current, error: readError } = await context.supabase
      .from("content_posts")
      .select("meta")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (readError) throw new Error(readError.message);

    const meta = { ...((current?.meta ?? {}) as Record<string, unknown>) };
    meta["live_queued"] = data.queued;
    meta["live_note"] = data.note;
    meta["live_checked_at"] = new Date().toISOString();
    // Keeps the exact link back to the published post so its real impressions,
    // clicks and engagement can be read later instead of guessed from wording.
    if (data.externalId) meta["external_post_id"] = data.externalId;


    const { data: saved, error } = await context.supabase
      .from("content_posts")
      .update({ meta } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return saved as unknown as ContentPost;
  });

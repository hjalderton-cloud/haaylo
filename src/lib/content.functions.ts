import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const CONTENT_STATUSES = ["draft", "approved", "scheduled", "published"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export type ContentPost = {
  id: string;
  project_id: string | null;
  caption: string;
  title: string | null;
  platform: string;
  pillar: string | null;
  status: ContentStatus;
  scheduled_at: string | null;
  published_at: string | null;
  media_url: string | null;
  media_path: string | null;
  plan_slot: string | null;
  hashtags: string[];
  meta: Record<string, string | number | boolean | null>;
  scheduled_post_id: string | null;
  campaign_id: string | null;
  paired_landing_page_id: string | null;
  paired_guide_campaign_id: string | null;
  created_at: string;
  updated_at: string;
};

const postInput = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid().nullish(),
  caption: z.string().max(20000).default(""),
  title: z.string().max(300).nullish(),
  platform: z.string().max(40).default("linkedin"),
  pillar: z.string().max(120).nullish(),
  status: z.enum(CONTENT_STATUSES).default("draft"),
  scheduled_at: z.string().nullish(),
  media_url: z.string().max(2000).nullish(),
  media_path: z.string().max(500).nullish(),
  plan_slot: z.string().max(200).nullish(),
  hashtags: z.array(z.string().max(80)).max(40).default([]),
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  campaign_id: z.string().uuid().nullish(),
  paired_landing_page_id: z.string().uuid().nullish(),
  paired_guide_campaign_id: z.string().uuid().nullish(),
});

const SELECT =
  "id, project_id, caption, title, platform, pillar, status, scheduled_at, published_at, media_url, media_path, plan_slot, hashtags, meta, scheduled_post_id, campaign_id, paired_landing_page_id, paired_guide_campaign_id, created_at, updated_at";

export const listContentPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId?: string | null; status?: ContentStatus | null; campaignId?: string | null } | undefined) =>
    z
      .object({
        projectId: z.string().uuid().nullish(),
        status: z.enum(CONTENT_STATUSES).nullish(),
        campaignId: z.string().uuid().nullish(),
      })
      .default({})
      .parse(data ?? {})
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("content_posts")
      .select(SELECT)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    if (data.status) q = q.eq("status", data.status);
    if (data.campaignId) q = q.eq("campaign_id", data.campaignId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ContentPost[];
  });

export const getContentPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("content_posts")
      .select(SELECT)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as ContentPost;
  });

export const saveContentPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => postInput.parse(data))
  .handler(async ({ data, context }) => {
    const row = {
      ...data,
      user_id: context.userId,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    };
    const { data: saved, error } = await context.supabase
      .from("content_posts")
      .upsert(row as never, { onConflict: "id" })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return saved as unknown as ContentPost;
  });

export const setContentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(CONTENT_STATUSES),
        scheduled_at: z.string().nullish(),
        scheduled_post_id: z.string().uuid().nullish(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { status: data.status };
    if (data.scheduled_at !== undefined) patch['scheduled_at'] = data.scheduled_at ?? null;
    if (data.scheduled_post_id !== undefined) patch['scheduled_post_id'] = data.scheduled_post_id ?? null;
    if (data.status === "published") patch['published_at'] = new Date().toISOString();
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

export const deleteContentPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_posts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** One-time import of posts that only ever lived in the browser. */
export const importContentPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ posts: z.array(postInput.omit({ id: true })).max(200) }).parse(data)
  )
  .handler(async ({ data, context }) => {
    if (!data.posts.length) return { imported: 0 };
    const rows = data.posts.map((p) => ({ ...p, user_id: context.userId }));
    const { error, count } = await context.supabase
      .from("content_posts")
      .insert(rows as never, { count: "exact" });
    if (error) throw new Error(error.message);
    return { imported: count ?? rows.length };
  });

/**
 * Files a finished month's scheduled posts into the Content Bank as a
 * collection (e.g. "September 2026"). Idempotent: existing bank items with the
 * same meta.source_post_id are skipped.
 */
export const archiveMonthToBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ year: z.number().int().min(2000).max(2200), month: z.number().int().min(0).max(11) }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const start = new Date(Date.UTC(data.year, data.month, 1));
    const end = new Date(Date.UTC(data.year, data.month + 1, 1));
    const collection = `${start.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${data.year}`;

    const { data: rows, error } = await context.supabase
      .from("content_posts")
      .select("id, project_id, caption, title, platform, pillar, status, scheduled_at, hashtags")
      .eq("user_id", context.userId)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", start.toISOString())
      .lt("scheduled_at", end.toISOString())
      .limit(500);
    if (error) throw new Error(error.message);
    const posts = rows ?? [];
    if (!posts.length) return { archived: 0, collection };

    const { data: existing } = await context.supabase
      .from("content_bank_items")
      .select("meta")
      .eq("user_id", context.userId)
      .eq("collection", collection)
      .limit(500);
    const seen = new Set(
      (existing ?? [])
        .map((r) => (r.meta as Record<string, unknown> | null)?.["source_post_id"])
        .filter((v): v is string => typeof v === "string")
    );

    // Default project for bank items that have no project on the post.
    const { data: proj } = await context.supabase
      .from("projects")
      .select("id, is_default")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fallbackProject = proj?.id ?? null;

    const toInsert = posts
      .filter((p) => !seen.has(p.id) && (p.project_id || fallbackProject))
      .map((p) => ({
        project_id: (p.project_id ?? fallbackProject)!,
        user_id: context.userId,
        kind: "post" as const,
        title: p.title ?? (p.caption ?? "").slice(0, 80),
        body: p.caption ?? "",
        tags: [p.platform, p.pillar].filter(Boolean) as string[],
        collection,
        meta: {
          source_post_id: p.id,
          platform: p.platform,
          pillar: p.pillar,
          scheduled_at: p.scheduled_at,
        },
      }));

    if (toInsert.length) {
      const { error: insErr } = await context.supabase
        .from("content_bank_items")
        .insert(toInsert as never);
      if (insErr) throw new Error(insErr.message);
    }

    // Mark past scheduled posts as published so the lifecycle stays accurate.
    const nowIso = new Date().toISOString();
    const donePast = posts.filter((p) => p.status === "scheduled" && String(p.scheduled_at) < nowIso).map((p) => p.id);
    if (donePast.length) {
      await context.supabase
        .from("content_posts")
        .update({ status: "published", published_at: nowIso } as never)
        .in("id", donePast)
        .eq("user_id", context.userId);
    }

    return { archived: toInsert.length, collection };
  });

/** Lists the distinct month collections already filed in the Content Bank. */
export const listBankCollections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("content_bank_items")
      .select("collection")
      .eq("user_id", context.userId)
      .not("collection", "is", null)
      .limit(500);
    if (error) throw new Error(error.message);
    return Array.from(new Set((data ?? []).map((r) => r.collection).filter((c): c is string => !!c))).sort();
  });

/** Copies a post back into the vault as a fresh draft. */
export const duplicateContentPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("content_posts")
      .select(SELECT)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    const row = src as unknown as ContentPost;
    const { data: copy, error: insErr } = await context.supabase
      .from("content_posts")
      .insert({
        user_id: context.userId,
        project_id: row.project_id,
        caption: row.caption,
        title: row.title ? `${row.title} (copy)` : null,
        platform: row.platform,
        pillar: row.pillar,
        status: "draft",
        hashtags: row.hashtags,
        meta: row.meta,
        media_url: row.media_url,
        media_path: row.media_path,
        campaign_id: row.campaign_id,
        paired_landing_page_id: row.paired_landing_page_id,
        paired_guide_campaign_id: row.paired_guide_campaign_id,
      } as never)
      .select(SELECT)
      .single();
    if (insErr) throw new Error(insErr.message);
    return copy as unknown as ContentPost;
  });

/** Files a post under a different campaign (or none). */
export const moveContentPostToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), campaignId: z.string().uuid().nullable() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_posts")
      .update({ campaign_id: data.campaignId } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Attach or detach an image on a post. Saves straight away so it survives a refresh. */
export const setPostImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        media_url: z.string().max(2000).nullable(),
        media_path: z.string().max(500).nullable(),
        meta: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      media_url: data.media_url,
      media_path: data.media_path,
    };
    if (data.meta !== undefined) patch["meta"] = data.meta;
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

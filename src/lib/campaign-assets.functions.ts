import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

export type CampaignPost = { id: string; title: string; caption: string; platform: string | null; phase: number | null };
export type CampaignBankItem = { id: string; kind: string; title: string; body: string; url: string | null; path: string | null; imageStatus?: string; imageError?: string | null };
export type CampaignLanding = {
  id: string;
  slug: string;
  title: string;
  headline: string;
  subheadline: string;
  status: string;
  buttonLabel: string;
};
export type CampaignGuide = {
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
  coverUrl: string | null;
};

export type CampaignBlog = { id: string; title: string; body: string; readMinutes: number };

export type CampaignAssets = {
  posts: CampaignPost[];
  landing: CampaignLanding | null;
  guide: CampaignGuide;
  emails: CampaignBankItem[];
  images: CampaignBankItem[];
  blog: CampaignBlog | null;
  /** Earliest upcoming send time across this campaign's posts, if any. */
  nextScheduledAt: string | null;
  /** How many of this campaign's posts are already published. */
  publishedCount: number;
};

const str = (v: unknown, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseSections(raw: any): { heading: string; body: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => ({
      heading: str(s?.heading) || str(s?.section_heading),
      body: str(s?.body) || str(s?.section_body),
    }))
    .filter((s) => s.heading || s.body);
}

export const listCampaignAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CampaignAssets> => {
    const ctx = context as unknown as Ctx;
    const id = data.campaignId;

    const [campaignRes, postsRes, landingRes, bankRes] = await Promise.all([
      ctx.supabase
        .from("campaigns")
        .select("guide_title, guide_intro, guide_sections, guide_cover_url")
        .eq("user_id", ctx.userId)
        .eq("id", id)
        .maybeSingle(),
      ctx.supabase
        .from("content_posts")
        .select("id, title, caption, platform, status, scheduled_at, meta, created_at")
        .eq("user_id", ctx.userId)
        .contains("meta", { campaign_id: id })
        .order("created_at", { ascending: true }),
      ctx.supabase
        .from("landing_pages")
        .select("id, slug, title, status, content")
        .eq("user_id", ctx.userId)
        .eq("campaign_id", id)
        .order("created_at", { ascending: false })
        .limit(1),
      ctx.supabase
        .from("content_bank_items")
        .select("id, kind, title, body, meta, created_at")
        .eq("user_id", ctx.userId)
        .contains("meta", { campaign_id: id })
        .order("created_at", { ascending: true }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campaign = (campaignRes?.data ?? {}) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = ((landingRes?.data ?? [])[0] ?? null) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bank = (bankRes?.data ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postRows = (postsRes?.data ?? []) as any[];

    const now = Date.now();
    const upcoming = postRows
      .map((p) => (typeof p.scheduled_at === "string" ? p.scheduled_at : null))
      .filter((s): s is string => !!s && new Date(s).getTime() > now)
      .sort();
    const blogRow = bank.find((b) => b.kind === "blog") ?? null;

    return {
      blog: blogRow
        ? {
            id: blogRow.id as string,
            title: str(blogRow.title),
            body: str(blogRow.body),
            readMinutes: Number(blogRow.meta?.read_minutes) || 5,
          }
        : null,
      nextScheduledAt: upcoming[0] ?? null,
      publishedCount: postRows.filter((p) => p.status === "published").length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      posts: ((postsRes?.data ?? []) as any[]).map((p) => ({
        id: p.id as string,
        title: str(p.title),
        caption: str(p.caption),
        platform: str(p.platform) || null,
        phase: Number.isInteger(Number(p.meta?.phase)) ? Number(p.meta.phase) : null,
      })),
      landing: page
        ? {
            id: page.id as string,
            slug: str(page.slug),
            title: str(page.title),
            headline: str(page.content?.headline),
            subheadline: str(page.content?.subheadline),
            status: str(page.status, "draft"),
            buttonLabel: str(page.content?.buttonLabel, "Find out more"),
          }
        : null,
      guide: {
        title: str(campaign.guide_title),
        intro: str(campaign.guide_intro),
        sections: normaliseSections(campaign.guide_sections),
        coverUrl: str(campaign.guide_cover_url) || null,
      },
      emails: bank
        .filter((b) => b.kind === "email")
        .map((b) => ({ id: b.id as string, kind: "email", title: str(b.title), body: str(b.body), url: null, path: null })),
      images: bank
        .filter((b) => b.kind === "image" || b.kind === "image_prompt")
        .map((b) => ({
          id: b.id as string,
          kind: str(b.kind, "image"),
          title: str(b.title),
          body: str(b.body),
          url: str(b.meta?.url) || null,
          path: str(b.meta?.path) || null,
          imageStatus: str(b.meta?.image_status) || (str(b.meta?.url) ? "ready" : "brief"),
          imageError: str(b.meta?.image_error) || null,
        })),
    };
  });

export const updateCampaignPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().max(300).default(""),
        caption: z.string().max(20000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("content_posts")
      .update({ title: data.title || null, caption: data.caption })
      .eq("user_id", ctx.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCampaignBankItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().max(300).default(""),
        body: z.string().max(20000).default(""),
        imageUrl: z.string().max(2000).nullable().optional(),
        imagePath: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: current, error: readError } = await ctx.supabase
      .from("content_bank_items")
      .select("meta")
      .eq("user_id", ctx.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("That item isn't here any more.");
    const meta = { ...((current.meta ?? {}) as Record<string, unknown>) };
    if (data.imageUrl !== undefined) meta["url"] = data.imageUrl;
    if (data.imagePath !== undefined) meta["path"] = data.imagePath;
    const { error } = await ctx.supabase
      .from("content_bank_items")
      .update({ title: data.title || null, body: data.body, meta })
      .eq("user_id", ctx.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCampaignGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        title: z.string().max(300).default(""),
        intro: z.string().max(6000).default(""),
        sections: z
          .array(z.object({ heading: z.string().max(300).default(""), body: z.string().max(12000).default("") }))
          .max(20)
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("campaigns")
      .update({
        guide_title: data.title || null,
        guide_intro: data.intro || null,
        guide_sections: data.sections,
      })
      .eq("user_id", ctx.userId)
      .eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCampaignGuideCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campaignId: z.string().uuid(), coverUrl: z.string().url().max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("campaigns")
      .update({ guide_cover_url: data.coverUrl })
      .eq("user_id", ctx.userId)
      .eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCampaignLandingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        headline: z.string().max(300).default(""),
        subheadline: z.string().max(600).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: page, error: readErr } = await ctx.supabase
      .from("landing_pages")
      .select("content")
      .eq("user_id", ctx.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!page) throw new Error("That page isn't here any more.");
    const content = { ...((page.content ?? {}) as Record<string, unknown>), headline: data.headline, subheadline: data.subheadline };
    const { error } = await ctx.supabase
      .from("landing_pages")
      .update({ content })
      .eq("user_id", ctx.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PhaseEmail = {
  id: string;
  phase: number;
  subject: string;
  body: string;
  order: number;
};

/** The 30-day launch email sequence for a campaign, oldest phase first. */
export const listPhaseEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("email_sequences")
      .select("id, phase, email_subject, email_body, send_order")
      .eq("user_id", ctx.userId)
      .eq("campaign_id", data.campaignId)
      .order("phase", { ascending: true })
      .order("send_order", { ascending: true });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r["id"] as string,
      phase: Number(r["phase"] ?? 1),
      subject: (r["email_subject"] as string) ?? "",
      body: (r["email_body"] as string) ?? "",
      order: Number(r["send_order"] ?? 1),
    })) as PhaseEmail[];
  });

export const updatePhaseEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        subject: z.string().trim().max(300),
        body: z.string().max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase
      .from("email_sequences")
      .update({ email_subject: data.subject, email_body: data.body })
      .eq("user_id", ctx.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Renders one image-pack brief into a real picture and saves it on the same item. */
export const generateCampaignImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { renderBankImage } = await import("./campaign-image.server");
    return renderBankImage(context as unknown as Ctx, data.id);
  });

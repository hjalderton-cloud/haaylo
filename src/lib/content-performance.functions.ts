import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type PerformancePost = {
  id: string;
  title: string;
  caption: string;
  platform: string | null;
  pillar: string | null;
  status: string;
  publishedAt: string | null;
  externalId: string | null;
  campaignId: string | null;
};

type Ctx = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

async function resolveProjectId(ctx: Ctx, projectId?: string | null): Promise<string | null> {
  if (projectId) return projectId;
  const { data } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("user_id", ctx.userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

const loadSchema = z.object({ projectId: z.string().uuid().nullish() });

/** Every post in the workspace with the fields the performance screen needs. */
export const getContentPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => loadSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ posts: PerformancePost[] }> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);

    let query = ctx.supabase
      .from("content_posts")
      .select("id, title, caption, platform, pillar, status, published_at, scheduled_at, created_at, campaign_id, meta")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (projectId) query = query.eq("project_id", projectId);

    const { data: rows } = await query;

    const posts: PerformancePost[] = (rows ?? []).map((r: Record<string, unknown>) => {
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
        campaignId: (r["campaign_id"] as string | null) ?? null,
      };
    });

    return { posts };
  });

const insightSchema = z.object({
  rangeLabel: z.string().max(60),
  totals: z.object({
    posts: z.number(),
    impressions: z.number(),
    avgEngagement: z.number().nullable(),
  }),
  platforms: z
    .array(
      z.object({
        platform: z.string().max(40),
        posts: z.number(),
        impressions: z.number(),
        avgEngagement: z.number().nullable(),
      }),
    )
    .max(8),
  pillars: z
    .array(
      z.object({
        pillar: z.string().max(80),
        posts: z.number(),
        avgImpressions: z.number().nullable(),
        avgEngagement: z.number().nullable(),
      }),
    )
    .max(12),
  days: z
    .array(z.object({ day: z.string().max(12), avgEngagement: z.number().nullable(), posts: z.number() }))
    .max(7),
  slots: z
    .array(z.object({ slot: z.string().max(20), avgEngagement: z.number().nullable(), posts: z.number() }))
    .max(4),
});

export type InsightInput = z.infer<typeof insightSchema>;

const n1 = (v: number | null | undefined) => (typeof v === "number" ? Math.round(v * 10) / 10 : null);

function fallbackInsight(d: InsightInput): string {
  const pillar = [...d.pillars].sort((a, b) => (b.avgEngagement ?? 0) - (a.avgEngagement ?? 0))[0];
  const platform = [...d.platforms].sort((a, b) => (b.avgEngagement ?? 0) - (a.avgEngagement ?? 0))[0];
  const day = [...d.days].sort((a, b) => (b.avgEngagement ?? 0) - (a.avgEngagement ?? 0))[0];
  const slot = [...d.slots].sort((a, b) => (b.avgEngagement ?? 0) - (a.avgEngagement ?? 0))[0];
  if (!d.totals.posts) return `Nothing published in the ${d.rangeLabel.toLowerCase()} yet, so there's nothing to read into.`;
  const bits = [`Across the ${d.rangeLabel.toLowerCase()} you published ${d.totals.posts} post${d.totals.posts === 1 ? "" : "s"}.`];
  if (pillar?.pillar) bits.push(`${pillar.pillar} is your strongest pillar at ${n1(pillar.avgEngagement) ?? 0}% average engagement.`);
  if (platform?.platform) bits.push(`${platform.platform} carries the most engagement.`);
  if (day?.day && slot?.slot) bits.push(`${day.day} ${slot.slot.toLowerCase()} is when your posts land best — worth putting more there.`);
  return bits.join(" ");
}

/** One short paragraph reading the numbers for the selected range. */
export const generateContentInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => insightSchema.parse(d))
  .handler(async ({ data }): Promise<{ insight: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { insight: fallbackInsight(data) };
    if (!data.totals.posts) return { insight: fallbackInsight(data) };

    const system = [
      "You are a British social media strategist talking to a small business owner.",
      "Write in UK English. Plain, direct, understated — the way a knowledgeable peer talks over coffee.",
      "Never use hype words such as unlock, elevate, game-changer, supercharge, crucial, tapestry, testament, foster, or 'not X, it's Y'.",
      "Write ONE paragraph of three or four sentences reading the numbers given.",
      "Name the pillar and platform that do best, the best day and time to post, and one thing to do next.",
      "Only use the figures provided. Never invent numbers. If a figure is missing, say so plainly.",
      "Return plain text only, no headings, no bullet points.",
    ].join("\n");

    const prompt = JSON.stringify({ range: data.rangeLabel, ...data }, null, 0).slice(0, 4000);

    try {
      const res = await fetch(GATEWAY_CHAT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: `Here are the figures for ${data.rangeLabel}:\n${prompt}` },
          ],
        }),
      });
      if (!res.ok) return { insight: fallbackInsight(data) };
      const json = await res.json();
      const text = (json?.choices?.[0]?.message?.content as string | undefined)?.trim();
      return { insight: text && text.length > 20 ? text : fallbackInsight(data) };
    } catch {
      return { insight: fallbackInsight(data) };
    }
  });

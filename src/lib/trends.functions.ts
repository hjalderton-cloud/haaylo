import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODULE = "trending_scan";

export const TREND_PLATFORMS = ["linkedin", "instagram", "facebook"] as const;
export type TrendPlatform = (typeof TREND_PLATFORMS)[number];

export const TREND_SIGNALS = ["high", "rising", "steady"] as const;
export type TrendSignal = (typeof TREND_SIGNALS)[number];

export type Trend = {
  topic: string;
  summary: string;
  angle: string;
  signal: TrendSignal;
};

export type TrendScan = {
  id: string;
  platform: TrendPlatform;
  niche: string;
  keyword: string | null;
  created_at: string;
  trends: Trend[];
};

export type TrendContext = { niche: string; history: TrendScan[] };

type Ctx = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

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

/** Brand DNA niche, audience and voice for the selected workspace. */
async function loadProfile(ctx: Ctx, projectId: string | null) {
  const [brainRes, brandRes] = await Promise.all([
    projectId
      ? ctx.supabase.from("business_brains").select("data").eq("project_id", projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase
      .from("brand_brain")
      .select("brand_name, target_audience, brand_voice")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brain = ((brainRes?.data as any)?.data ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brand = (brandRes?.data ?? null) as Record<string, any> | null;

  return {
    name: str(brain?.business?.name) || str(brain?.brand?.name) || str(brand?.brand_name),
    niche: str(brain?.business?.industry) || str(brain?.audience?.niche),
    audience: str(brain?.audience?.ideal_customer) || str(brand?.target_audience),
    offer: str(brain?.ctas?.current_offer) || str(brain?.business?.products_services),
    voice: str(brain?.brand?.tone_of_voice) || str(brand?.brand_voice),
  };
}

function normaliseTrends(raw: unknown): Trend[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = (raw ?? {}) as any;
  return arr(parsed.trends)
    .map((t) => {
      const signal = str(t?.signal).toLowerCase();
      return {
        topic: str(t?.topic).slice(0, 160),
        summary: str(t?.summary).slice(0, 1200),
        angle: str(t?.angle).slice(0, 500),
        signal: ((TREND_SIGNALS as readonly string[]).includes(signal) ? signal : "steady") as TrendSignal,
      };
    })
    .filter((t) => t.topic.length > 1 && t.summary.length > 1)
    .slice(0, 5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToScan(row: any): TrendScan | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prompt = (row?.prompt ?? {}) as any;
  let trends: Trend[];
  try {
    trends = normaliseTrends(JSON.parse(row?.output ?? "{}"));
  } catch {
    return null;
  }
  if (!trends.length) return null;
  const platform = str(prompt.platform).toLowerCase();
  return {
    id: row.id as string,
    platform: ((TREND_PLATFORMS as readonly string[]).includes(platform) ? platform : "linkedin") as TrendPlatform,
    niche: str(prompt.niche),
    keyword: str(prompt.keyword) || null,
    created_at: row.created_at as string,
    trends,
  };
}

/** Pre-fill data for the trend scanner: niche and previous scans. */
export const getTrendContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid().nullish() }).default({}).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<TrendContext> => {
    const projectId = await resolveProjectId(context, data.projectId);
    const [profile, historyRes] = await Promise.all([
      loadProfile(context, projectId),
      (async () => {
        let q = context.supabase
          .from("marketing_history")
          .select("id, prompt, output, created_at")
          .eq("user_id", context.userId)
          .eq("module", MODULE)
          .order("created_at", { ascending: false })
          .limit(10);
        if (projectId) q = q.eq("project_id", projectId);
        return q;
      })(),
    ]);

    const history = (historyRes?.data ?? [])
      .map(rowToScan)
      .filter((s: TrendScan | null): s is TrendScan => Boolean(s));

    return { niche: profile.niche, history };
  });

const scanInput = z.object({
  platform: z.enum(TREND_PLATFORMS),
  niche: z.string().trim().min(2, "Add a niche first.").max(400),
  keyword: z.string().trim().max(300).nullish(),
  projectId: z.string().uuid().nullish(),
});

const PLATFORM_NOTE: Record<TrendPlatform, string> = {
  linkedin: "LinkedIn: professional conversation — industry shifts, hiring, tools, opinion posts, case studies.",
  instagram: "Instagram: visual and personal — formats, aesthetics, behind-the-scenes, short-form video themes.",
  facebook: "Facebook: community and local conversation — groups, recommendations, longer discussion threads.",
};

function quarterLabel(d = new Date()) {
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

/** Generates five trend suggestions for the workspace niche and logs the scan. */
export const scanTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scanInput.parse(d))
  .handler(async ({ data, context }): Promise<{ scan: TrendScan }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const projectId = await resolveProjectId(context, data.projectId);
    const profile = await loadProfile(context, projectId);

    const system = [
      "You are a British social media strategist working with a small business.",
      "Write in UK English. Plain, direct, understated — the way a knowledgeable peer talks over coffee.",
      "Never use hype words such as unlock, elevate, game-changer, supercharge, crucial, tapestry, testament, foster, or 'not X, it's Y'.",
      `Suggest five themes that this niche is genuinely talking about in ${quarterLabel()}. Be specific to the niche, never generic marketing advice.`,
      "summary: one paragraph on why it's being talked about and what the conversation looks like.",
      "angle: one sentence telling this business what to say about it, in their voice and for their audience.",
      "signal: 'high' for busy conversations, 'rising' for growing ones, 'steady' for constant ones. Mix them.",
      'Return JSON only: {"trends":[{"topic":"...","summary":"...","angle":"...","signal":"high"}]}',
    ].join("\n");

    const prompt = [
      profile.name ? `Brand: ${profile.name}` : "",
      `Niche: ${data.niche}`,
      profile.audience ? `Audience: ${profile.audience}` : "",
      profile.offer ? `Offer: ${profile.offer}` : "",
      profile.voice ? `Brand voice: ${profile.voice}` : "",
      data.keyword ? `Focus on this topic: ${data.keyword}` : "",
      "",
      PLATFORM_NOTE[data.platform],
      "Give exactly five trends.",
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch(GATEWAY_CHAT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("The AI is busy right now — try again in a moment.");
      if (res.status === 402) throw new Error("You've run out of AI credits. Top them up, then try again.");
      if (res.status === 403) throw new Error("AI generation is switched off for this workspace.");
      throw new Error(`Could not scan trends (${res.status}). ${txt.slice(0, 120)}`);
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content as string | undefined;
    if (!raw) throw new Error("Nothing came back. Try again.");

    let trends: Trend[];
    try {
      trends = normaliseTrends(JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()));
    } catch {
      throw new Error("Could not read the trends. Try again.");
    }
    if (!trends.length) throw new Error("The scan came back empty. Try again.");

    const promptMeta = {
      platform: data.platform,
      niche: data.niche,
      keyword: data.keyword ?? null,
    };

    let saved: TrendScan | null = null;
    if (projectId) {
      const { data: row } = await context.supabase
        .from("marketing_history")
        .insert({
          project_id: projectId,
          user_id: context.userId,
          module: MODULE,
          title: data.keyword || data.niche,
          prompt: promptMeta,
          output: JSON.stringify({ trends }),
        })
        .select("id, prompt, output, created_at")
        .maybeSingle();
      saved = row ? rowToScan(row) : null;
    }

    return {
      scan:
        saved ?? {
          id: crypto.randomUUID(),
          platform: data.platform,
          niche: data.niche,
          keyword: data.keyword ?? null,
          created_at: new Date().toISOString(),
          trends,
        },
    };
  });

/** Saves a trend as a titled draft in the Content Bank. */
export const saveTrendIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(2).max(300),
        platform: z.enum(TREND_PLATFORMS),
        projectId: z.string().uuid().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const projectId = await resolveProjectId(context, data.projectId);
    const { data: row, error } = await context.supabase
      .from("content_posts")
      .insert({
        user_id: context.userId,
        project_id: projectId,
        title: data.title,
        caption: "",
        platform: data.platform,
        status: "draft",
        meta: { source: "trending_scan" },
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (row?.id as string | undefined) ?? null };
  });

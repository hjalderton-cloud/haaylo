import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODULE = "hashtag_optimizer";

export const TAG_PLATFORMS = ["linkedin", "instagram", "facebook"] as const;
export type TagPlatform = (typeof TAG_PLATFORMS)[number];

export const REACH_TIERS = ["high", "medium", "niche"] as const;
export type ReachTier = (typeof REACH_TIERS)[number];

export const KEYWORD_TAGS = ["core", "supporting", "long-tail"] as const;
export type KeywordTag = (typeof KEYWORD_TAGS)[number];

export type HashtagSuggestion = { tag: string; reach: ReachTier };
export type KeywordSuggestion = { keyword: string; tag: KeywordTag };

export type OptimizerResult = {
  hashtags: HashtagSuggestion[];
  keywords: KeywordSuggestion[];
};

export type OptimizerSearch = {
  id: string;
  platform: TagPlatform;
  niche: string;
  pillar: string | null;
  topic: string | null;
  created_at: string;
  result: OptimizerResult;
};

export type OptimizerContext = {
  niche: string;
  pillars: string[];
  drafts: Array<{ id: string; label: string; platform: string }>;
  history: OptimizerSearch[];
};

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
  const [brainRes, brandRes, planRes] = await Promise.all([
    projectId
      ? ctx.supabase.from("business_brains").select("data").eq("project_id", projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase
      .from("brand_brain")
      .select("brand_name, target_audience, brand_voice")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    projectId
      ? ctx.supabase
          .from("strategy_plans")
          .select("plan")
          .eq("user_id", ctx.userId)
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brain = ((brainRes?.data as any)?.data ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brand = (brandRes?.data ?? null) as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = ((planRes?.data as any)?.plan ?? null) as Record<string, any> | null;

  const brainPillars = arr(brain?.content?.pillars)
    .map((p) => (typeof p === "string" ? p.trim() : str(p?.name)))
    .filter(Boolean);
  const planPillars = arr(plan?.pillars)
    .map((p) => str(p?.name))
    .filter(Boolean);

  return {
    name: str(brain?.business?.name) || str(brain?.brand?.name) || str(brand?.brand_name),
    niche: str(brain?.business?.industry) || str(brain?.audience?.niche),
    audience: str(brain?.audience?.ideal_customer) || str(brand?.target_audience),
    offer: str(brain?.ctas?.current_offer) || str(brain?.business?.products_services),
    voice: str(brain?.brand?.tone_of_voice) || str(brand?.brand_voice),
    pillars: Array.from(new Set([...planPillars, ...brainPillars])).slice(0, 12),
  };
}

function normaliseResult(raw: unknown): OptimizerResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = (raw ?? {}) as any;
  const hashtags: HashtagSuggestion[] = arr(parsed.hashtags)
    .map((h) => {
      const tag = str(typeof h === "string" ? h : h?.tag).replace(/^#*/, "");
      const reach = str(h?.reach).toLowerCase();
      return {
        tag: tag ? `#${tag.replace(/\s+/g, "")}` : "",
        reach: ((REACH_TIERS as readonly string[]).includes(reach) ? reach : "medium") as ReachTier,
      };
    })
    .filter((h) => h.tag.length > 1)
    .slice(0, 30);

  const keywords: KeywordSuggestion[] = arr(parsed.keywords)
    .map((k) => {
      const keyword = str(typeof k === "string" ? k : k?.keyword);
      const tag = str(k?.tag).toLowerCase().replace("longtail", "long-tail");
      return {
        keyword,
        tag: ((KEYWORD_TAGS as readonly string[]).includes(tag) ? tag : "supporting") as KeywordTag,
      };
    })
    .filter((k) => k.keyword.length > 1)
    .slice(0, 20);

  return { hashtags, keywords };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSearch(row: any): OptimizerSearch | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prompt = (row?.prompt ?? {}) as any;
  let result: OptimizerResult;
  try {
    result = normaliseResult(JSON.parse(row?.output ?? "{}"));
  } catch {
    return null;
  }
  if (!result.hashtags.length && !result.keywords.length) return null;
  const platform = str(prompt.platform).toLowerCase();
  return {
    id: row.id as string,
    platform: ((TAG_PLATFORMS as readonly string[]).includes(platform) ? platform : "instagram") as TagPlatform,
    niche: str(prompt.niche),
    pillar: str(prompt.pillar) || null,
    topic: str(prompt.topic) || null,
    created_at: row.created_at as string,
    result,
  };
}

/** Pre-fill data for the optimiser: niche, pillars, recent drafts and the last five searches. */
export const getOptimizerContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid().nullish() }).default({}).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<OptimizerContext> => {
    const projectId = await resolveProjectId(context, data.projectId);
    const [profile, draftsRes, historyRes] = await Promise.all([
      loadProfile(context, projectId),
      (async () => {
        let q = context.supabase
          .from("content_posts")
          .select("id, title, caption, platform")
          .eq("user_id", context.userId)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(15);
        if (projectId) q = q.eq("project_id", projectId);
        return q;
      })(),
      (async () => {
        let q = context.supabase
          .from("marketing_history")
          .select("id, prompt, output, created_at")
          .eq("user_id", context.userId)
          .eq("module", MODULE)
          .order("created_at", { ascending: false })
          .limit(5);
        if (projectId) q = q.eq("project_id", projectId);
        return q;
      })(),
    ]);

    const drafts = (draftsRes?.data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => ({
        id: p.id as string,
        label: (str(p.title) || str(p.caption).slice(0, 70) || "Untitled draft").slice(0, 80),
        platform: str(p.platform) || "linkedin",
      }),
    );

    const history = (historyRes?.data ?? [])
      .map(rowToSearch)
      .filter((s: OptimizerSearch | null): s is OptimizerSearch => Boolean(s));

    return { niche: profile.niche, pillars: profile.pillars, drafts, history };
  });

const findInput = z.object({
  platform: z.enum(TAG_PLATFORMS),
  niche: z.string().trim().min(2, "Add a niche first.").max(400),
  pillar: z.string().trim().max(200).nullish(),
  topic: z.string().trim().max(400).nullish(),
  projectId: z.string().uuid().nullish(),
});

const PLATFORM_NOTE: Record<TagPlatform, string> = {
  linkedin: "LinkedIn: 5-10 hashtags only, professional and search-led, no gimmicky tags.",
  instagram: "Instagram: 18-25 hashtags mixing broad community tags with tight niche ones.",
  facebook: "Facebook: 5-8 hashtags, plain and topical — hashtags matter less here, so favour searchable phrases.",
};

/** Generates hashtags and keywords for the workspace, and logs the search to history. */
export const findHashtagsAndKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => findInput.parse(d))
  .handler(async ({ data, context }): Promise<{ search: OptimizerSearch }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const projectId = await resolveProjectId(context, data.projectId);
    const profile = await loadProfile(context, projectId);

    const system = [
      "You are a British social and SEO strategist for a small business.",
      "Write in UK English. Plain, direct, understated. No hype words such as unlock, elevate, game-changer, supercharge, or 'not X, it's Y'.",
      "Suggest hashtags people in this niche genuinely search and follow, and keyword phrases worth writing about.",
      "reach: 'high' for broad tags, 'medium' for mid-size, 'niche' for small specific ones. Give a realistic mix, not all high.",
      "tag: 'core' for the main search terms, 'supporting' for related terms, 'long-tail' for longer specific phrases.",
      'Return JSON only: {"hashtags":[{"tag":"#example","reach":"high"}],"keywords":[{"keyword":"example phrase","tag":"core"}]}',
    ].join("\n");

    const prompt = [
      profile.name ? `Brand: ${profile.name}` : "",
      `Niche: ${data.niche}`,
      profile.audience ? `Audience: ${profile.audience}` : "",
      profile.offer ? `Offer: ${profile.offer}` : "",
      data.pillar ? `Content pillar: ${data.pillar}` : "",
      data.topic ? `Specific topic: ${data.topic}` : "",
      "",
      PLATFORM_NOTE[data.platform],
      "Also give 10-14 SEO and content keyword phrases for the same subject.",
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
      throw new Error(`Could not find hashtags (${res.status}). ${txt.slice(0, 120)}`);
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content as string | undefined;
    if (!raw) throw new Error("Nothing came back. Try again.");

    let result: OptimizerResult;
    try {
      result = normaliseResult(JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()));
    } catch {
      throw new Error("Could not read the suggestions. Try again.");
    }
    if (!result.hashtags.length && !result.keywords.length) {
      throw new Error("The suggestions came back empty. Try again.");
    }

    const promptMeta = {
      platform: data.platform,
      niche: data.niche,
      pillar: data.pillar ?? null,
      topic: data.topic ?? null,
    };

    let saved: OptimizerSearch | null = null;
    if (projectId) {
      const { data: row } = await context.supabase
        .from("marketing_history")
        .insert({
          project_id: projectId,
          user_id: context.userId,
          module: MODULE,
          title: data.topic || data.pillar || data.niche,
          prompt: promptMeta,
          output: JSON.stringify(result),
        })
        .select("id, prompt, output, created_at")
        .maybeSingle();
      saved = row ? rowToSearch(row) : null;
    }

    return {
      search:
        saved ?? {
          id: crypto.randomUUID(),
          platform: data.platform,
          niche: data.niche,
          pillar: data.pillar ?? null,
          topic: data.topic ?? null,
          created_at: new Date().toISOString(),
          result,
        },
    };
  });

/** Appends a hashtag list to the end of an existing draft post. */
export const appendHashtagsToPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        hashtags: z.array(z.string().max(80)).min(1).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: post, error } = await context.supabase
      .from("content_posts")
      .select("id, caption, hashtags")
      .eq("id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) throw new Error("That post could not be found.");

    const tags = data.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`));
    const body = str(post.caption);
    const missing = tags.filter((t) => !body.includes(t));
    const caption = missing.length ? (body ? `${body}\n\n${missing.join(" ")}` : missing.join(" ")) : body;

    const merged = Array.from(new Set([...(post.hashtags ?? []), ...tags.map((t) => t.replace(/^#/, ""))])).slice(0, 40);

    const { error: upErr } = await context.supabase
      .from("content_posts")
      .update({ caption, hashtags: merged })
      .eq("id", data.postId)
      .eq("user_id", context.userId);
    if (upErr) throw new Error(upErr.message);

    return { added: missing.length };
  });

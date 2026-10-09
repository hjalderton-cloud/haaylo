import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { looksLikeUrl, readSite, toUrl } from "./site-read";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

export const PLATFORMS = ["linkedin", "instagram", "facebook", "all"] as const;
export type CompetitorPlatform = (typeof PLATFORMS)[number];

export type PillarGap = { pillar: string; gap: string; strength: string };

export type ScanResults = {
  topics: string[];
  pillarGaps: PillarGap[];
  strongestPillar: string;
  tone: string;
  angles: { title: string; brief: string }[];
  siteRead: boolean;
  pillarsInvented: boolean;
};

export type CompetitorScan = {
  id: string;
  competitor_name: string;
  competitor_url: string | null;
  platform: string;
  results: ScanResults;
  created_at: string;
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const str = (v: unknown, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);
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

async function loadContext(ctx: Ctx, projectId: string | null) {
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
      : ctx.supabase
          .from("strategy_plans")
          .select("plan")
          .eq("user_id", ctx.userId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brain = ((brainRes?.data as any)?.data ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brand = (brandRes?.data ?? null) as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = ((planRes?.data as any)?.plan ?? null) as Record<string, any> | null;
  const pillars = arr(plan?.pillars)
    .map((p) => str(p?.name))
    .filter(Boolean)
    .slice(0, 6);

  return {
    name: str(brain?.business?.name) || str(brain?.brand?.name) || str(brand?.brand_name),
    audience: str(brain?.audience?.ideal_customer) || str(brand?.target_audience),
    pains: str(brain?.audience?.pain_points),
    offer: str(brain?.ctas?.current_offer) || str(brain?.business?.products_services),
    voice: str(brain?.brand?.tone_of_voice) || str(brand?.brand_voice),
    niche: str(brain?.business?.industry) || str(brain?.audience?.niche),
    pillars,
  };
}

const SYSTEM = [
  "You are a British content strategist doing a competitor read for a small brand.",
  "Write in UK English. Understated, direct, peer-over-coffee voice. No hype, no press-release cadence.",
  "Never use these words or phrasings: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, game-changer, foster, unlock, supercharge, or 'not X, it's Y'.",
  "Base every judgement on the competitor material supplied. Where material is thin, say what is unknown rather than inventing detail.",
  "Return JSON only, in this shape:",
  '{"topics":[""],"pillar_gaps":[{"pillar":"","gap":"","strength":"high|medium|low"}],"strongest_pillar":"","tone":"","angles":[{"title":"","brief":""}]}',
  "topics: 4-6 topics or angles the competitor is not covering that this brand's audience cares about.",
  "pillar_gaps: one entry per supplied pillar, naming the open space in that pillar. strongest_pillar: the pillar with the most white space.",
  "tone: one paragraph on how this brand's voice can sit differently to the competitor's apparent tone.",
  "angles: 3-5 post angles this brand can own. brief is 2-3 sentences a writer could work from straight away.",
].join("\n");

function friendly(status: number): string {
  if (status === 429) return "The AI is busy right now — try again in a moment.";
  if (status === 402) return "You've run out of AI credits. Top them up, then try again.";
  return "The scan didn't finish. Try again in a moment.";
}

async function askJson(prompt: string): Promise<Record<string, unknown>> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI isn't set up for this workspace.");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(friendly(res.status));
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = (json.choices?.[0]?.message?.content ?? "").trim();
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    throw new Error("Could not read what came back. Try the scan again.");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toScan(row: any): CompetitorScan {
  const r = (row?.results_json ?? {}) as Partial<ScanResults>;
  return {
    id: row.id as string,
    competitor_name: str(row.competitor_name, "Competitor"),
    competitor_url: str(row.competitor_url) || null,
    platform: str(row.platform, "all"),
    created_at: row.created_at as string,
    results: {
      topics: arr(r.topics).map((t) => String(t)),
      pillarGaps: arr(r.pillarGaps).map((g) => ({
        pillar: str(g?.pillar),
        gap: str(g?.gap),
        strength: str(g?.strength, "medium"),
      })),
      strongestPillar: str(r.strongestPillar),
      tone: str(r.tone),
      angles: arr(r.angles).map((a) => ({ title: str(a?.title), brief: str(a?.brief) })),
      siteRead: r.siteRead === true,
      pillarsInvented: r.pillarsInvented === true,
    },
  };
}

export const scanCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        competitor: z.string().trim().min(2, "Add a competitor name or website.").max(200),
        platform: z.enum(PLATFORMS).default("all"),
        projectId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CompetitorScan> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);
    const profile = await loadContext(ctx, projectId);

    const isUrl = looksLikeUrl(data.competitor);
    const url = isUrl ? toUrl(data.competitor) : null;
    const site = url ? await readSite(url) : { text: "", pages: [] };
    const siteRead = site.text.length > 200;

    const displayName = isUrl
      ? data.competitor.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "")
      : data.competitor;

    const pillarsInvented = profile.pillars.length === 0;
    const platformName =
      data.platform === "all" ? "all platforms" : data.platform.charAt(0).toUpperCase() + data.platform.slice(1);

    const prompt = [
      `COMPETITOR: ${displayName}`,
      url ? `COMPETITOR WEBSITE: ${url}` : "No website supplied.",
      `THEIR MAIN PLATFORM: ${platformName}`,
      siteRead
        ? `COMPETITOR WEBSITE COPY (read just now):\n${site.text}`
        : "Their website could not be read. Work from the name and niche, and keep claims about them cautious.",
      "",
      "THE BRAND COMMISSIONING THIS SCAN:",
      profile.name ? `Business: ${profile.name}` : "",
      profile.niche ? `Niche: ${profile.niche}` : "",
      profile.audience ? `Audience: ${profile.audience}` : "",
      profile.pains ? `Audience pain points: ${profile.pains}` : "",
      profile.offer ? `Offer: ${profile.offer}` : "",
      profile.voice ? `Brand voice: ${profile.voice}` : "",
      pillarsInvented
        ? "They have no content pillars saved yet — propose 3-4 sensible pillars from their brand and audience, and use those in pillar_gaps."
        : `Their content pillars: ${profile.pillars.join(", ")}. Use exactly these in pillar_gaps.`,
    ]
      .filter(Boolean)
      .join("\n");

    const json = await askJson(prompt);

    const results: ScanResults = {
      topics: arr(json["topics"]).map((t) => String(t).slice(0, 300)).slice(0, 6),
      pillarGaps: arr(json["pillar_gaps"])
        .map((g) => ({
          pillar: str(g?.pillar).slice(0, 120),
          gap: str(g?.gap).slice(0, 600),
          strength: str(g?.strength, "medium").toLowerCase().slice(0, 20),
        }))
        .filter((g) => g.pillar)
        .slice(0, 6),
      strongestPillar: str(json["strongest_pillar"]).slice(0, 120),
      tone: str(json["tone"]).slice(0, 2000),
      angles: arr(json["angles"])
        .map((a) => ({ title: str(a?.title).slice(0, 200), brief: str(a?.brief).slice(0, 1200) }))
        .filter((a) => a.title || a.brief)
        .slice(0, 5),
      siteRead,
      pillarsInvented,
    };

    if (results.topics.length === 0 && results.angles.length === 0) {
      throw new Error("Nothing usable came back. Try the scan again.");
    }

    const { data: row, error } = await ctx.supabase
      .from("competitor_scans")
      .insert({
        user_id: ctx.userId,
        project_id: projectId,
        competitor_name: displayName.slice(0, 200),
        competitor_url: url,
        platform: data.platform,
        results_json: results,
      })
      .select("id, competitor_name, competitor_url, platform, results_json, created_at")
      .single();
    if (error) throw new Error(error.message);
    return toScan(row);
  });

export const listCompetitorScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<CompetitorScan[]> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);
    let query = ctx.supabase
      .from("competitor_scans")
      .select("id, competitor_name, competitor_url, platform, results_json, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map(toScan);
  });

export const saveAngleToBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scanId: z.string().uuid(),
        competitor: z.string().max(200).default(""),
        title: z.string().trim().min(1).max(200),
        body: z.string().max(8000).default(""),
        projectId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);
    if (!projectId) throw new Error("No workspace found to save this into.");
    const { error } = await ctx.supabase.from("content_bank_items").insert({
      user_id: ctx.userId,
      project_id: projectId,
      kind: "idea",
      title: data.title.slice(0, 200),
      body: data.body,
      tags: ["competitor-scan"],
      collection: data.competitor ? data.competitor.slice(0, 80) : null,
      meta: { scan_id: data.scanId, competitor: data.competitor },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

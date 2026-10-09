import { createServerFn } from "@tanstack/react-start";
import { cleanForWorkspace, brainFromGrounding, validateImagePrompt } from "./brand-compliance.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type IdeaConcept = { hook: string; why: string; pillar: string };
export type IdeaCampaign = { id: string; title: string; theme: string };
export type IdeaContext = { niche: string; campaigns: IdeaCampaign[] };

type Ctx = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

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

  const rawPillars = brain?.content?.pillars ?? brain?.pillars ?? [];
  const pillars = (Array.isArray(rawPillars) ? rawPillars : [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => (typeof p === "string" ? p : str(p?.name) || str(p?.title)))
    .filter(Boolean)
    .slice(0, 8);

  const { loadBrandContext } = await import("./brand-context.server");
  const grounding = projectId ? (await loadBrandContext(ctx, projectId)).prompt : "";

  return {
    grounding,
    name: str(brain?.business?.name) || str(brain?.brand?.name) || str(brand?.brand_name),
    niche: str(brain?.business?.industry) || str(brain?.audience?.niche),
    audience: str(brain?.audience?.ideal_customer) || str(brand?.target_audience),
    offer: str(brain?.ctas?.current_offer) || str(brain?.business?.products_services),
    voice: str(brain?.brand?.tone_of_voice) || str(brand?.brand_voice),
    pillars: pillars as string[],
  };
}

/** Campaign themes plus the workspace niche, for the Idea Generator inputs. */
export const getIdeaContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid().nullish() }).default({}).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<IdeaContext> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId);
    const profile = await loadProfile(ctx, projectId);

    let q = ctx.supabase
      .from("campaigns")
      .select("id, campaign_title, campaign_theme")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
    const { data: rows } = await q;

    const campaigns = (rows ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        id: r.id as string,
        title: str(r.campaign_title) || "Untitled campaign",
        theme: str(r.campaign_theme),
      }))
      .filter((c: IdeaCampaign) => Boolean(c.id));

    return { niche: profile.niche, campaigns };
  });

const generateInput = z.object({
  keyword: z.string().trim().min(2, "Add a keyword first.").max(200),
  campaignId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
});

/** Three post concept hooks written to the workspace Brand DNA. */
export const generateIdeaConcepts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generateInput.parse(d))
  .handler(async ({ data, context }): Promise<{ concepts: IdeaConcept[] }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId);
    const profile = await loadProfile(ctx, projectId);

    let campaign: { title: string; theme: string } | null = null;
    if (data.campaignId) {
      const { data: row } = await ctx.supabase
        .from("campaigns")
        .select("campaign_title, campaign_theme")
        .eq("user_id", ctx.userId)
        .eq("id", data.campaignId)
        .maybeSingle();
      if (row) campaign = { title: str(row.campaign_title), theme: str(row.campaign_theme) };
    }

    const system = [
      "You are a British social media strategist working with a small business.",
      "Write in UK English. Plain, direct, understated — the way a knowledgeable peer talks over coffee.",
      "Never use hype words such as unlock, elevate, game-changer, supercharge, crucial, tapestry, testament, foster, or 'not X, it's Y'.",
      "Give exactly three distinct post concepts. Each must take a genuinely different angle — no rewording of the same idea.",
      "hook: the opening line of the post, specific and concrete, no more than 25 words.",
      "why: one short sentence on why this lands with their audience.",
      "pillar: which of their content pillars it belongs to (use one from the list when given, otherwise name a sensible one).",
      'Return JSON only: {"concepts":[{"hook":"...","why":"...","pillar":"..."}]}',
    ].join("\n");

    const prompt = [
      profile.grounding ? `BRAND CONTEXT (ground every hook in these facts, voice and audience):\n${profile.grounding}\n` : "",
      profile.name ? `Brand: ${profile.name}` : "",
      profile.niche ? `Niche: ${profile.niche}` : "",
      profile.audience ? `Audience: ${profile.audience}` : "",
      profile.offer ? `Offer: ${profile.offer}` : "",
      profile.voice ? `Brand voice: ${profile.voice}` : "",
      profile.pillars.length ? `Content pillars: ${profile.pillars.join(", ")}` : "",
      campaign ? `Campaign: ${campaign.title}${campaign.theme ? ` — theme: ${campaign.theme}` : ""}` : "",
      `Keyword: ${data.keyword}`,
      "",
      "Give exactly three concepts.",
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
      throw new Error(`Could not generate ideas (${res.status}). ${txt.slice(0, 120)}`);
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content as string | undefined;
    if (!raw) throw new Error("Nothing came back. Try again.");

    let concepts: IdeaConcept[] = [];
    try {
      const parsed = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
      concepts = (Array.isArray(parsed?.concepts) ? parsed.concepts : [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((c: any) => ({
          hook: str(c?.hook).slice(0, 400),
          why: str(c?.why).slice(0, 400),
          pillar: str(c?.pillar).slice(0, 120),
        }))
        .filter((c: IdeaConcept) => c.hook.length > 1)
        .slice(0, 3);
    } catch {
      throw new Error("Could not read the ideas. Try again.");
    }
    if (!concepts.length) throw new Error("The ideas came back empty. Try again.");
    {
      const g = brainFromGrounding(profile.grounding);
      concepts = cleanForWorkspace(concepts, g.brain, { kind: "idea", verifiedContext: `${g.verifiedContext}\n${prompt}` }, { projectId: projectId ?? null, generator: "idea_generator" }).value;
    }

    return { concepts };
  });

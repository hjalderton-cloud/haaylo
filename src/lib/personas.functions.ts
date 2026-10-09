import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

export const MAX_PERSONAS = 5;
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type PersonaData = {
  personaName: string;
  ageRange: string;
  role: string;
  industry: string;
  goals: string[];
  painPoints: string[];
  contentEngagement: string;
  platforms: string[];
  quote: string;
};

export type PersonaRecord = {
  id: string;
  created_at: string;
  data: PersonaData;
};

const str = (v: unknown, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

const personaSchema = z.object({
  personaName: z.string().trim().min(1).max(120),
  ageRange: z.string().max(80).default(""),
  role: z.string().max(160).default(""),
  industry: z.string().max(160).default(""),
  goals: z.array(z.string().max(400)).max(8).default([]),
  painPoints: z.array(z.string().max(400)).max(8).default([]),
  contentEngagement: z.string().max(1500).default(""),
  platforms: z.array(z.string().max(60)).max(10).default([]),
  quote: z.string().max(400).default(""),
});

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

async function loadAudience(ctx: Ctx, projectId: string | null) {
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

  return {
    name: str(brain?.business?.name) || str(brain?.brand?.name) || str(brand?.brand_name),
    audience: str(brain?.audience?.ideal_customer) || str(brand?.target_audience),
    pains: str(brain?.audience?.pain_points),
    desires: str(brain?.audience?.desires) || str(brain?.audience?.aspirations),
    niche: str(brain?.business?.industry) || str(brain?.audience?.niche),
    offer: str(brain?.ctas?.current_offer) || str(brain?.business?.products_services),
    voice: str(brain?.brand?.tone_of_voice) || str(brand?.brand_voice),
    pillars: arr(plan?.pillars)
      .map((p) => str(p?.name))
      .filter(Boolean)
      .slice(0, 6),
  };
}

const SYSTEM = [
  "You are a British brand strategist writing one buyer persona for a small business.",
  "Write in UK English. Understated, direct, peer-over-coffee voice. No hype, no press-release cadence.",
  "Never use these words or phrasings: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, game-changer, foster, unlock, supercharge, or 'not X, it's Y'.",
  "Ground the persona in the audience information supplied. Be specific and plausible, never generic filler.",
  "Return JSON only, in this shape:",
  '{"persona_name":"","age_range":"","role":"","industry":"","goals":["","",""],"pain_points":["","",""],"content_engagement":"","platforms":[""],"quote":""}',
  "persona_name: a first name plus their role, e.g. 'Marketing Manager Maya'.",
  "goals and pain_points: exactly three each, one short sentence apiece.",
  "content_engagement: 2-3 sentences on the formats, tones and topics that land with them.",
  "platforms: 2-4 from LinkedIn, Instagram, Facebook, YouTube, Podcasts.",
  "quote: one first-person sentence capturing their mindset.",
].join("\n");

function friendly(status: number): string {
  if (status === 429) return "The AI is busy right now — try again in a moment.";
  if (status === 402) return "You've run out of AI credits. Top them up, then try again.";
  return "That didn't finish. Try again in a moment.";
}

export const generatePersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid().optional(),
        avoid: z.array(z.string().max(120)).max(5).default([]),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PersonaData> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);
    const a = await loadAudience(ctx, projectId);

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI isn't set up for this workspace.");

    const prompt = [
      a.name ? `Business: ${a.name}` : "",
      a.niche ? `Industry or niche: ${a.niche}` : "",
      a.audience ? `Audience: ${a.audience}` : "No audience saved yet — infer a sensible one from the rest.",
      a.pains ? `Audience pain points: ${a.pains}` : "",
      a.desires ? `What they want: ${a.desires}` : "",
      a.offer ? `What the business sells: ${a.offer}` : "",
      a.voice ? `Brand voice: ${a.voice}` : "",
      a.pillars.length ? `Content pillars: ${a.pillars.join(", ")}` : "",
      data.avoid.length
        ? `Personas already built: ${data.avoid.join(", ")}. Take a genuinely different angle on the same audience — a different role, seniority or situation.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

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
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Could not read what came back. Try again.");
      try {
        parsed = JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        throw new Error("Could not read what came back. Try again.");
      }
    }

    const persona: PersonaData = {
      personaName: str(parsed["persona_name"], "Your customer").slice(0, 120),
      ageRange: str(parsed["age_range"]).slice(0, 80),
      role: str(parsed["role"]).slice(0, 160),
      industry: str(parsed["industry"]).slice(0, 160),
      goals: arr(parsed["goals"]).map((g) => String(g).slice(0, 400)).filter(Boolean).slice(0, 3),
      painPoints: arr(parsed["pain_points"]).map((p) => String(p).slice(0, 400)).filter(Boolean).slice(0, 3),
      contentEngagement: str(parsed["content_engagement"]).slice(0, 1500),
      platforms: arr(parsed["platforms"]).map((p) => String(p).slice(0, 60)).filter(Boolean).slice(0, 6),
      quote: str(parsed["quote"]).slice(0, 400),
    };

    if (!persona.goals.length && !persona.painPoints.length) {
      throw new Error("Nothing usable came back. Try again.");
    }
    return persona;
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): PersonaRecord {
  const d = (row?.persona_data ?? {}) as Partial<PersonaData>;
  return {
    id: row.id as string,
    created_at: row.created_at as string,
    data: {
      personaName: str(d.personaName, str(row?.persona_name, "Persona")),
      ageRange: str(d.ageRange),
      role: str(d.role),
      industry: str(d.industry),
      goals: arr(d.goals).map((g) => String(g)),
      painPoints: arr(d.painPoints).map((p) => String(p)),
      contentEngagement: str(d.contentEngagement),
      platforms: arr(d.platforms).map((p) => String(p)),
      quote: str(d.quote),
    },
  };
}

export const listPersonas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<PersonaRecord[]> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);
    let query = ctx.supabase
      .from("personas")
      .select("id, persona_name, persona_data, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map(toRecord);
  });

export const savePersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        persona: personaSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PersonaRecord> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId ?? null);

    if (!data.id) {
      let countQuery = ctx.supabase
        .from("personas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ctx.userId);
      countQuery = projectId ? countQuery.eq("project_id", projectId) : countQuery.is("project_id", null);
      const { count } = await countQuery;
      if ((count ?? 0) >= MAX_PERSONAS) {
        throw new Error(`You can keep ${MAX_PERSONAS} personas per client. Delete one to make room.`);
      }
    }

    const payload = {
      user_id: ctx.userId,
      project_id: projectId,
      persona_name: data.persona.personaName.slice(0, 120),
      persona_data: data.persona,
    };

    const query = data.id
      ? ctx.supabase
          .from("personas")
          .update(payload)
          .eq("id", data.id)
          .eq("user_id", ctx.userId)
          .select("id, persona_name, persona_data, created_at")
          .single()
      : ctx.supabase.from("personas").insert(payload).select("id, persona_name, persona_data, created_at").single();

    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return toRecord(row);
  });

export const deletePersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase.from("personas").delete().eq("id", data.id).eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

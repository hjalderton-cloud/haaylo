/**
 * Agent Briefing Room server functions.
 *
 * `planBrief` turns a natural-language brief into a campaign blueprint, grounded
 * in the workspace's Business Brain and 90-day strategy. `compileBrief` turns an
 * approved blueprint into a real campaign row by calling the shared tool-registry
 * runner (no duplicate insert logic). `saveBrainAnswers` writes back the handful
 * of missing brand facts the agent had to ask for.
 *
 * Every call takes an explicit workspaceId and verifies ownership first — the
 * agent never infers or switches workspace.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnedWorkspace } from "@/lib/tool-registry/guards";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

const CHANNELS = ["LinkedIn", "Instagram", "Facebook", "Email", "Blog"] as const;

const ASSUMPTION_FIELDS: string[] = [
  "business_name",
  "ideal_customer",
  "tone_of_voice",
  "preferred_platforms",
  "products_services",
  "other",
];

export const blueprintSchema = z.object({
  title: z.string().trim().min(1).max(160),
  goal: z.string().trim().min(1).max(300),
  duration: z.enum(["30-day", "90-day"]),
  audience: z.string().trim().max(300).default(""),
  channels: z.array(z.string().trim().max(40)).max(6).default([]),
  theme: z.string().trim().min(1).max(600),
  assets: z.object({
    socialPosts: z.boolean().default(false),
    landingPage: z.boolean().default(false),
    leadMagnet: z.boolean().default(false),
    emailSequence: z.boolean().default(false),
    imagePack: z.boolean().default(false),
    blog: z.boolean().default(false),
  }),
  assetSummary: z.array(z.string().trim().max(120)).max(12).default([]),
  grounding: z.string().trim().max(400).default(""),
  /** Calls the agent made for itself where the brand profile was silent. */
  assumptions: z
    .array(
      z.object({
        field: z
          .enum(["business_name", "ideal_customer", "tone_of_voice", "preferred_platforms", "products_services", "other"])
          .default("other"),
        label: z.string().trim().max(60).default(""),
        value: z.string().trim().max(200).default(""),
        why: z.string().trim().max(200).default(""),
      }),
    )
    .max(6)
    .default([]),
});

export type Blueprint = z.infer<typeof blueprintSchema>;

export type BrainGap = { field: BrainField; question: string };

const BRAIN_FIELDS = {
  business_name: ["business", "name"],
  ideal_customer: ["audience", "ideal_customer"],
  tone_of_voice: ["brand", "tone_of_voice"],
  preferred_platforms: ["content", "preferred_platforms"],
  products_services: ["business", "products_services"],
} as const;

export type BrainField = keyof typeof BRAIN_FIELDS;

const GAP_QUESTIONS: Record<BrainField, string> = {
  business_name: "What's the business called?",
  ideal_customer: "Who are we speaking to? A sentence on your ideal customer is plenty.",
  tone_of_voice: "How should this sound? Describe your tone of voice.",
  preferred_platforms: "Which channels do you want to use? (e.g. LinkedIn, Email)",
  products_services: "What are you selling here? A short description of the offer.",
};

function pick(brain: Record<string, unknown>, path: readonly string[]): string {
  let node: unknown = brain;
  for (const key of path) {
    if (!node || typeof node !== "object") return "";
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" ? node.trim() : "";
}


const SYSTEM = `You are Haaylo's marketing agent, planning a campaign for a UK business owner.

Return ONE JSON object and nothing else:
{
  "title": short campaign name,
  "goal": one plain sentence,
  "duration": "30-day" or "90-day",
  "audience": who it speaks to,
  "channels": array from ${CHANNELS.join(", ")},
  "theme": two or three sentences describing the campaign angle, used to generate the assets,
  "assets": { "socialPosts": bool, "landingPage": bool, "leadMagnet": bool, "emailSequence": bool, "imagePack": bool, "blog": bool },
  "assetSummary": short human lines, e.g. "4 LinkedIn posts", "3 emails", "1 landing page",
  "grounding": one sentence naming which brand facts you used,
  "assumptions": array (max 4) of { "field": one of business_name, ideal_customer, tone_of_voice, preferred_platforms, products_services, other, "label": short label e.g. "Audience", "value": what you decided, "why": where you took it from }
}

Never ask the owner for missing information. Where the profile is silent, decide it
yourself from the brief, the strategy and what they have published before, and list
that decision in "assumptions". Leave "assumptions" empty when nothing was guessed.

Writing rules, applied to every word:
- UK English only.
- Understated, direct, plain British voice. No hype, no press-release cadence.
- Never use: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, game-changer, foster, unlock, supercharge.
- No antithesis constructions ("not X, it's Y"), no rhetorical-question openers.
- Ground every business fact in the profile given. Invent nothing.`;

async function callGateway(system: string, prompt: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured on the server yet.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (res.status === 429) throw new Error("The AI is busy right now. Try again in a moment.");
  if (res.status === 402) throw new Error("AI credits have run out. Top up to keep generating.");
  if (!res.ok) throw new Error("The AI didn't respond. Try again.");
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

function cut(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.trim().slice(0, max) : undefined;
}

/**
 * Models answer in slightly different shapes: the asset summary as one sentence,
 * the length as "30 days", a channel we don't support. Tidy those into the
 * schema's shape rather than throwing the whole plan away.
 */
export function coerceBlueprint(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const o = { ...(input as Record<string, unknown>) };

  if (typeof o["assetSummary"] === "string") {
    o["assetSummary"] = (o["assetSummary"] as string)
      .split(/[,\n•]/)
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof o["duration"] === "string") {
    const d = (o["duration"] as string).toLowerCase();
    if (d !== "30-day" && d !== "90-day") {
      const weeks = /week/.test(d) ? Number(d.match(/\d+/)?.[0] ?? 0) * 7 : 0;
      const months = /month/.test(d) ? Number(d.match(/\d+/)?.[0] ?? 0) * 30 : 0;
      const days = weeks || months || Number(d.match(/\d+/)?.[0] ?? 0);
      o["duration"] = days && days <= 45 ? "30-day" : "90-day";
    } else {
      o["duration"] = d;
    }
  }

  if (Array.isArray(o["channels"])) {
    o["channels"] = (o["channels"] as unknown[])
      .map((c) => CHANNELS.find((k) => k.toLowerCase() === String(c).trim().toLowerCase()))
      .filter((c): c is (typeof CHANNELS)[number] => Boolean(c))
      .slice(0, 6);
  } else if (typeof o["channels"] === "string") {
    o["channels"] = CHANNELS.filter((k) =>
      (o["channels"] as string).toLowerCase().includes(k.toLowerCase()),
    );
  }

  for (const [key, max] of [
    ["title", 160],
    ["goal", 300],
    ["audience", 300],
    ["theme", 600],
    ["grounding", 400],
  ] as const) {
    const v = cut(o[key], max);
    if (v !== undefined) o[key] = v;
  }

  if (Array.isArray(o["assetSummary"])) {
    o["assetSummary"] = (o["assetSummary"] as unknown[])
      .map((s) => String(s).trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 12);
  }

  if (Array.isArray(o["assumptions"])) {
    o["assumptions"] = (o["assumptions"] as unknown[])
      .map((a) => {
        if (typeof a === "string") {
          const [label, ...rest] = a.split(":");
          return { field: "other", label: (label ?? "").trim().slice(0, 60), value: rest.join(":").trim().slice(0, 200), why: "" };
        }
        if (!a || typeof a !== "object") return null;
        const r = a as Record<string, unknown>;
        return {
          field: ASSUMPTION_FIELDS.includes(String(r["field"])) ? String(r["field"]) : "other",
          label: cut(r["label"], 60) ?? "",
          value: cut(r["value"], 200) ?? "",
          why: cut(r["why"], 200) ?? "",
        };
      })
      .filter((a): a is { field: string; label: string; value: string; why: string } => Boolean(a && a.value))
      .slice(0, 6);
  } else if (o["assumptions"] !== undefined) {
    o["assumptions"] = [];
  }

  return o;
}

type ParseResult = { ok: true; blueprint: Blueprint } | { ok: false; reason: string };

function parseBlueprint(raw: string): ParseResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, reason: "the reply contained no JSON object" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { ok: false, reason: "the JSON in the reply was malformed" };
  }
  const result = blueprintSchema.safeParse(coerceBlueprint(parsed));
  if (!result.success) {
    const reason = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, reason };
  }
  const bp = result.data;
  if (!Object.values(bp.assets).some(Boolean)) bp.assets.socialPosts = true;
  return { ok: true, blueprint: bp };
}

/** Stage 1: read the workspace, then propose a campaign blueprint. */
export const planBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        brief: z.string().trim().min(3, "Tell the agent what you're working on.").max(2000),
        addition: z.string().trim().max(600).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);

    const { runFetchBrandContext, runFetchStrategy, runFetchPreviousContent } = await import(
      "@/lib/tool-registry/runners.server"
    );
    const brandRes = await runFetchBrandContext(ctx, { workspaceId: data.workspaceId });
    const brain = brandRes.data as Record<string, unknown>;
    const strategyRes = await runFetchStrategy(ctx, { workspaceId: data.workspaceId });

    // The agent recommends rather than interrogates. Missing facts are decided by
    // the model and listed back as assumptions. The only thing it can't work from
    // is an empty brand profile plus a brief too thin to infer anything.
    const missing: BrainField[] = (Object.keys(BRAIN_FIELDS) as BrainField[]).filter(
      (f) => !pick(brain, BRAIN_FIELDS[f]),
    );
    const known = (Object.keys(BRAIN_FIELDS) as BrainField[]).filter((f) => !missing.includes(f));

    if (known.length === 0 && data.brief.trim().length < 40) {
      const gaps: BrainGap[] = [
        { field: "products_services", question: GAP_QUESTIONS["products_services"] },
      ];
      return { status: "needs_info" as const, gaps, blueprint: null };
    }

    const gapLine = missing.length
      ? `NOT RECORDED — decide these yourself and list them under "assumptions": ${missing.join(", ")}`
      : "Nothing missing from the profile.";


    const plan = strategyRes.plan as
      | { goal?: string; pillars?: Array<{ name?: string }> }
      | null;
    const strategyLine = plan
      ? `Existing 90-day plan goal: ${plan.goal ?? "(none)"}\nPillars: ${(plan.pillars ?? [])
          .map((p) => p?.name)
          .filter(Boolean)
          .join(", ")}`
      : "No 90-day plan saved yet.";

    // Long-term memory: what this workspace has published before, so the plan can
    // build on what already works rather than starting cold.
    let pastLine = "No earlier content saved yet.";
    try {
      const past = (await runFetchPreviousContent(ctx, {
        workspaceId: data.workspaceId,
        limit: 12,
      })) as Array<{ title?: string | null; caption?: string | null; platform?: string | null; pillar?: string | null }>;
      const lines = past
        .map((p) => {
          const text = (p.title ?? p.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 110);
          if (!text) return "";
          const tags = [p.platform, p.pillar].filter(Boolean).join(" / ");
          return tags ? `- [${tags}] ${text}` : `- ${text}`;
        })
        .filter(Boolean)
        .slice(0, 10);
      if (lines.length) pastLine = lines.join("\n");
    } catch {
      /* planning still works without the history */
    }

    const addition = (data.addition ?? "").trim();
    const { loadBrandContext } = await import("@/lib/brand-context.server");
    const brandCtx = await loadBrandContext(ctx, data.workspaceId);
    const prompt = `BRAND PROFILE:\n${brandCtx.prompt || "(nothing recorded yet)"}\n\n${gapLine}\n\nSTRATEGY:\n${strategyLine}\n\nWHAT THEY'VE PUBLISHED BEFORE (match what already works; do not repeat it):\n${pastLine}\n\nBRIEF FROM THE OWNER:\n${data.brief}${
      addition ? `\n\nALSO INCLUDE IN THE CAMPAIGN:\n${addition}` : ""
    }`;

    const first = parseBlueprint(await callGateway(SYSTEM, prompt));
    const { cleanForWorkspace } = await import("@/lib/brand-compliance.server");
    const clean = <T,>(bp: T): T =>
      cleanForWorkspace(bp, brandCtx.brain as Record<string, unknown>, { kind: "brief", verifiedContext: prompt }, { projectId: data.workspaceId, generator: "briefing_room" }).value;
    if (first.ok) {
      return { status: "ready" as const, gaps: [] as BrainGap[], blueprint: clean(first.blueprint) };
    }
    console.error("planBrief: first attempt unusable —", first.reason);

    // One corrective retry naming exactly what was wrong with the shape.
    const second = parseBlueprint(
      await callGateway(
        SYSTEM,
        `${prompt}\n\nYour previous answer could not be read: ${first.reason}. Return the JSON object again, valid, with assetSummary as an array of short strings and duration exactly "30-day" or "90-day".`,
      ),
    );
    if (second.ok) {
      return { status: "ready" as const, gaps: [] as BrainGap[], blueprint: clean(second.blueprint) };
    }
    console.error("planBrief: retry unusable —", second.reason);
    throw new Error(`The agent's plan came back in a shape we couldn't read (${second.reason}). Try again.`);
  });

/** Writes back the brand facts the agent had to ask for. */
export const saveBrainAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        // A partial set is fine — the owner may only correct one thing.
        answers: z
          .object({
            business_name: z.string().trim().max(2000).optional(),
            ideal_customer: z.string().trim().max(2000).optional(),
            tone_of_voice: z.string().trim().max(2000).optional(),
            preferred_platforms: z.string().trim().max(2000).optional(),
            products_services: z.string().trim().max(2000).optional(),
          })
          .partial(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);

    const { data: row } = await ctx.supabase
      .from("business_brains")
      .select("id, data")
      .eq("project_id", data.workspaceId)
      .maybeSingle();

    const brain = { ...((row?.data as Record<string, unknown> | undefined) ?? {}) };
    for (const [field, value] of Object.entries(data.answers)) {
      const text = (value ?? "").trim();
      if (!text) continue;
      const path = BRAIN_FIELDS[field as BrainField];
      const section = { ...((brain[path[0]] as Record<string, unknown> | undefined) ?? {}) };
      section[path[1]] = text;
      brain[path[0]] = section;
    }

    if (row?.id) {
      const { error } = await ctx.supabase
        .from("business_brains")
        .update({ data: brain })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await ctx.supabase
        .from("business_brains")
        .insert({ user_id: ctx.userId, project_id: data.workspaceId, data: brain });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

/**
 * First free stretch of 90-day plan weeks in this workspace, so a 90-day
 * recommendation shows up as a chapter on the plan page. Null when the plan is
 * already fully covered.
 */
async function freePlanWeeks(
  ctx: Ctx,
  workspaceId: string,
  span: number,
): Promise<{ start: number; end: number } | null> {
  const { data } = await ctx.supabase
    .from("campaigns")
    .select("plan_week_start, plan_week_end")
    .eq("user_id", ctx.userId)
    .eq("project_id", workspaceId)
    .not("plan_week_start", "is", null);

  const taken = new Set<number>();
  for (const r of (data ?? []) as { plan_week_start: number | null; plan_week_end: number | null }[]) {
    if (r.plan_week_start == null || r.plan_week_end == null) continue;
    for (let w = r.plan_week_start; w <= r.plan_week_end; w += 1) taken.add(w);
  }

  for (let start = 1; start + span - 1 <= 13; start += 1) {
    let free = true;
    for (let w = start; w < start + span; w += 1) if (taken.has(w)) free = false;
    if (free) return { start, end: start + span - 1 };
  }
  return null;
}

/** Stage 2: create the campaign row from the approved blueprint. */
export const compileBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        blueprint: blueprintSchema,
        brief: z.string().trim().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);

    const bp = data.blueprint;
    const weeks =
      bp.duration === "90-day" ? await freePlanWeeks(ctx, data.workspaceId, 13) : null;

    const { runCreateCampaign } = await import("@/lib/tool-registry/runners.server");
    const campaign = (await runCreateCampaign(ctx, {
      workspaceId: data.workspaceId,
      title: bp.title,
      theme: bp.theme,
      duration: bp.duration,
      assets: bp.assets as unknown as Record<string, boolean>,
      planWeekStart: weeks?.start ?? null,
      planWeekEnd: weeks?.end ?? null,
      brief: {
        brief: data.brief,
        goal: bp.goal,
        audience: bp.audience,
        channels: bp.channels,
        assetSummary: bp.assetSummary,
        grounding: bp.grounding,
      },
    })) as { id: string };

    return { campaignId: campaign.id };
  });

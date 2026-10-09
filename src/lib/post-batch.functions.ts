/**
 * Standalone post batches.
 *
 * Writes a run of social posts straight into the Content Bank without wrapping
 * them in a campaign. Used by the "Social posts" output on the Briefing Room and
 * by the 30-day content plan's "generate this month" button.
 *
 * Every post is grounded in the workspace's Strategy Profile: the owner's real
 * example posts, their saved calls to action and contact details.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnedWorkspace } from "@/lib/tool-registry/guards";
import { loadBrandContext } from "./brand-context.server";
import { complyEachPost, complianceMeta, buildProvenance, PLATFORM_RULES } from "./brand-compliance.server";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";

const BANNED = [
  "crucial", "tapestry", "dive deep", "more than just", "look no further",
  "elevate", "testament", "game-changer", "game changer", "foster", "unlock",
  "supercharge", "magic", "effortless", "seamless", "revolutionise",
  "revolutionize", "transform your", "level up", "buckle up", "in today's",
  "the secret to", "say goodbye to", "tired of", "imagine a world",
];

const SYSTEM =
  "You are writing social posts as the business owner themselves, not as an agency. " +
  "Write in UK English (organisation, colour, whilst). Warm, plain, spoken-out-loud voice — the way the owner talks to a customer on the doorstep. " +
  "When example posts from the owner are supplied, they override every stylistic instinct you have: copy their rhythm, paragraphing, emoji use and sign-off exactly. " +
  "No American hype, no press-release cadence, no corporate or explanatory register. " +
  `Never use these words or phrases: ${BANNED.join(", ")}. ` +
  "Never use antithesis phrasing (\"not X, it's Y\"). Every claim must come from the brief — invent nothing. " +
  "Return JSON only.";

function stripFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

async function askJson(prompt: string): Promise<Record<string, unknown>> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI generation isn't set up for this workspace.");
  const res = await fetch(GATEWAY_CHAT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("The AI is busy right now — try again in a moment.");
    if (res.status === 402) throw new Error("You've run out of AI credits. Top them up, then try again.");
    throw new Error("Generation failed. Try again in a moment.");
  }
  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content as string | undefined;
  if (!raw) throw new Error("Nothing came back from the AI. Try again.");
  try {
    return JSON.parse(stripFence(raw)) as Record<string, unknown>;
  } catch {
    throw new Error("Could not read what the AI returned. Try again.");
  }
}

const str = (v: unknown, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

type PlanShape = {
  goal?: string;
  pillars?: Array<{ name?: string; description?: string }>;
  weeks?: Array<{ week?: number; theme?: string; focus?: string; pillar?: string }>;
};

const postBatchSchema = z.object({
        workspaceId: z.string().uuid(),
        topic: z.string().trim().min(1).max(8000),
        count: z.number().int().min(1).max(30).default(12),
        platforms: z.array(z.string().trim().max(30)).max(5).default([]),
        /** Weeks of the 90-day plan to draw themes from, e.g. 1-4 for this month. */
        weekFrom: z.number().int().min(1).max(13).nullable().default(null),
        weekTo: z.number().int().min(1).max(13).nullable().default(null),
        /** How the batch is filed in the Content Bank. */
        collection: z.string().trim().max(120).default(""),
      })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

/**
 * Core post-batch writer: grounding -> generator -> runCompliant -> draft rows.
 * Shared by the server function below and the Marketing Orchestrator.
 */
export async function runPostBatch(
  ctx: Ctx,
  data: z.infer<typeof postBatchSchema> & {
    campaignId?: string | null;
    extraMeta?: Record<string, unknown>;
    /** One entry per post: the channel and pillar the calendar planned for it. */
    plannedSlots?: Array<{ platform: string; pillar?: string }>;
    /** Angles already covered (campaign posts, recent content) that must not be repeated. */
    avoidAngles?: string[];
  },
) {
    await assertOwnedWorkspace(ctx, data.workspaceId);


    const [ground, planRes] = await Promise.all([
      loadBrandContext(ctx, data.workspaceId),
      ctx.supabase
        .from("strategy_plans")
        .select("plan")
        .eq("user_id", ctx.userId)
        .eq("project_id", data.workspaceId)
        .maybeSingle(),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brain = ground.brain as Record<string, any>;
    const plan = (planRes?.data?.plan ?? null) as PlanShape | null;

    const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const name = ground.name;


    const pillars = (plan?.pillars ?? []).map((p) => s(p?.name)).filter(Boolean);
    const weeks = (plan?.weeks ?? []).filter((w) => {
      const n = Number(w?.week ?? 0);
      if (!n) return false;
      if (data.weekFrom == null && data.weekTo == null) return false;
      return n >= (data.weekFrom ?? n) && n <= (data.weekTo ?? n);
    });

    const planText = [
      plan?.goal ? `Strategy goal: ${plan.goal}` : "",
      pillars.length
        ? `Content pillars (use these exact names for "pillar"):\n${(plan?.pillars ?? [])
            .filter((p) => s(p?.name))
            .map((p) => `- ${s(p?.name)}${s(p?.description) ? ` — ${s(p?.description)}` : ""}`)
            .join("\n")}`
        : "",
      weeks.length
        ? `Weekly themes to cover, in order:\n${weeks
            .map((w) => `- Week ${w.week}: ${s(w?.theme)}${s(w?.focus) ? ` — ${s(w.focus)}` : ""}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Channels: what the caller asked for, else the owner's saved channels, else a safe default.
    const platforms = data.platforms.length
      ? data.platforms
      : ground.channels.length
        ? ground.channels
        : ["linkedin", "instagram", "facebook"];

    const lengthPref = s(brain?.content?.post_length);
    const count = data.plannedSlots?.length ? Math.min(30, data.plannedSlots.length) : data.count;
    const slotText = data.plannedSlots?.length
      ? `Write the posts in exactly this order. Each post's "platform" must be the channel given, and it must be written for that channel:\n${data.plannedSlots
          .slice(0, count)
          .map((x, i) => `${i + 1}. ${x.platform}${x.pillar ? `, pillar "${x.pillar}"` : ""}`)
          .join("\n")}`
      : "";
    const avoidText = data.avoidAngles?.length
      ? `Angles already covered this month (campaign posts and recent content). Every new post must take a clearly different angle, scenario and example, so it complements these rather than repeating them:\n${data.avoidAngles
          .slice(0, 40)
          .map((a) => `- ${a.slice(0, 160)}`)
          .join("\n")}`
      : "";

    const batchPrompt = `${ground.prompt}

What the owner asked for: ${data.topic}
${planText}

${slotText}
${avoidText}
Write ${count} social posts.
Return JSON: { "posts": [ { "title": "", "caption": "", "pillar": "", "platform": "${platforms[0]}", "hashtags": [""] } ] }
Rules:
- Every caption must read as if the owner wrote it, matching their example posts line for line in rhythm, paragraphing, emoji and sign-off. A reader should not be able to tell the examples and the new posts apart.
- ${lengthPref ? `Length: ${lengthPref}.` : "Length: 60-140 words."} Short paragraphs, blank line between each.
- Open with a concrete moment, season, or product detail — never with a definition or an abstract noun phrase.
- Every post must contain at least one specific detail taken from the business facts, the proof or the audience notes above. A post that could be published by any business in this industry is a failed post: rewrite it.
- Use the competitive position and current talking points where they fit naturally, so the month has a point of view rather than filler.
- Each one usable as-is, no two posts making the same point.
${pillars.length ? `Every post's "pillar" must be one of: ${pillars.join(", ")}.` : `Vary the pillar across educational, story, proof, offer.`}
${weeks.length ? "Spread the posts evenly across the weekly themes above, in order." : ""}
Platform is one of: ${platforms.join(", ")}, and every post must be written for that audience in the owner's voice, following these channel rules:
${platforms.map((p) => `- ${PLATFORM_RULES[p] ?? p}`).join("\n")}
3-5 lowercase hashtags per post unless the channel rule says fewer.`;

    const json = await askJson(batchPrompt).catch(() => askJson(batchPrompt));
    const generated = arr(json["posts"]).slice(0, count);
    if (generated.length === 0) throw new Error("No posts came back. Try again.");

    // Every post gets its own brand check: one weak post never flags the rest.
    const checked = await complyEachPost({
      posts: generated,
      brain,
      verifiedContext: `${data.topic}\n${planText}`,
      groundingPrompt: ground.prompt,
      taskContext: `${data.topic}\n${planText}`,
      aiReview: true,
      avoid: data.avoidAngles,
      plannedPlatforms: data.plannedSlots?.map((x) => x.platform),
      rewrite: async (post, feedback) => {
        const r = await askJson(
          `${ground.prompt}\n\nWhat the owner asked for: ${data.topic}\n${planText}\n${avoidText}\n\nRewrite this one social post:\n${JSON.stringify(post)}\n\n${feedback}\n\nKeep the owner's voice and the same JSON fields. Remove any price, statistic, link, phone number or testimonial not in the brand profile. Return JSON: { "post": { "title": "", "caption": "", "pillar": "", "platform": "", "hashtags": [""] } }`,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (r["post"] ?? r) as any;
        return p && typeof p.caption === "string" ? p : null;
      },
      log: { projectId: data.workspaceId, generator: "post_batch", campaignId: data.campaignId ?? null },
    });
    const prov = buildProvenance(brain, { competitor: /COMPETIT/i.test(ground.prompt), trend: /TREND/i.test(ground.prompt) });

    const collection = data.collection.trim() || data.topic.slice(0, 80);
    const rows = checked.map(({ post: p, report, duplicateOf, platformFixed }, i) => ({
      user_id: ctx.userId,
      project_id: data.workspaceId,
      caption: str(p?.caption).slice(0, 20000),
      title: (str(p?.title) || str(p?.caption).split(/[.!?\n]/)[0]!.slice(0, 80)).slice(0, 300) || null,
      platform: str(data.plannedSlots?.[i]?.platform ?? p?.platform, platforms[0] ?? "linkedin").toLowerCase().slice(0, 40),
      pillar: str(p?.pillar, data.plannedSlots?.[i]?.pillar ?? "").slice(0, 120) || null,
      status: "draft",
      hashtags: arr(p?.hashtags).map((h) => String(h).slice(0, 80)).slice(0, 10),
      meta: {
        batch: true, batch_title: collection, ...complianceMeta(report, prov), ...(data.extraMeta ?? {}),
        ...(duplicateOf ? { duplicate_of: duplicateOf } : {}),
        ...(platformFixed ? { platform_corrected: true } : {}),
      },
      campaign_id: data.campaignId ?? null,
    }));

    const { data: inserted, error } = await ctx.supabase.from("content_posts").insert(rows).select("id");
    if (error) throw new Error(error.message);
    const { filePostBatch } = await import("./packages.server");
    await filePostBatch(ctx, {
      projectId: data.workspaceId,
      postIds: ((inserted ?? []) as Array<{ id: string }>).map((r) => r.id),
      title: collection,
      campaignId: data.campaignId ?? null,
      fromPlanWeeks: { from: data.weekFrom, to: data.weekTo },
      meta: { brief: data.topic.slice(0, 2000) },
    });
    const statuses = checked.map((c) => c.report.status);
    const report = {
      status: statuses.includes("needs_review") ? "needs_review" : statuses.includes("repaired") ? "repaired" : "pass",
      passed: statuses.filter((x) => x === "pass").length,
      repaired: statuses.filter((x) => x === "repaired").length,
      needsReview: statuses.filter((x) => x === "needs_review").length,
    };
    return { created: rows.length, collection, ids: ((inserted ?? []) as Array<{ id: string }>).map((r) => r.id), report };
  }

export const generatePostBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => postBatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runPostBatch({ userId: context.userId, supabase: context.supabase as any }, data);
    return { created: r.created, collection: r.collection };
  });

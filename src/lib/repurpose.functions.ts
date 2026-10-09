import { createServerFn } from "@tanstack/react-start";
import { cleanForWorkspace, brainFromGrounding, validateImagePrompt } from "./brand-compliance.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const REPURPOSE_TARGETS = ["carousel", "video", "newsletter"] as const;
export type RepurposeTarget = (typeof REPURPOSE_TARGETS)[number];

export const TARGET_LABEL: Record<RepurposeTarget, string> = {
  carousel: "Convert to Multi-Slide Carousel Script",
  video: "Convert to Short-Form Video Script",
  newsletter: "Expand into Email Newsletter",
};

export type BankCaption = {
  id: string;
  title: string;
  caption: string;
  platform: string | null;
  status: string | null;
  created_at: string;
};

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

/** Central brand grounding (full Brand DNA, voice, CTAs, proof) for this workspace. */
async function loadVoice(ctx: Ctx, projectId: string | null) {
  const { loadBrandContext } = await import("./brand-context.server");
  const brand = await loadBrandContext(ctx, projectId);
  return { context: brand.prompt, brain: brand.brain as Record<string, unknown> };
}

/** Saved captions from the Content Bank, for the source picker. */
export const listBankCaptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid().nullish() }).default({}).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<BankCaption[]> => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId);
    let q = ctx.supabase
      .from("content_posts")
      .select("id, title, caption, platform, status, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        id: r.id as string,
        title: str(r.title) || "Untitled post",
        caption: str(r.caption),
        platform: r.platform ?? null,
        status: r.status ?? null,
        created_at: r.created_at as string,
      }))
      .filter((r: BankCaption) => r.caption.length > 0);
  });

const TARGET_BRIEF: Record<RepurposeTarget, string> = {
  carousel:
    "Write a multi-slide carousel script. Give 6 to 8 slides. Each slide: 'Slide N — <slide title>' then one or two short lines of body copy. Finish with a closing slide that carries the call to action. Keep each slide readable at a glance.",
  video:
    "Write a short-form video script of 30 to 45 seconds. Open with a hook line in the first three seconds. Use HOOK / BODY / CLOSE headings, spoken lines under each, and a short on-screen text suggestion in brackets after each line.",
  newsletter:
    "Expand this into an email newsletter. Give a subject line, a preview line, then the body in short paragraphs with a couple of subheadings, and finish with the call to action.",
};

const repurposeInput = z.object({
  content: z.string().trim().min(20, "Add a bit more content to work from.").max(12000),
  target: z.enum(REPURPOSE_TARGETS),
  projectId: z.string().uuid().nullish(),
});

/** Converts an existing caption into a carousel, video script or newsletter. */
export const repurposeContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => repurposeInput.parse(d))
  .handler(async ({ data, context }): Promise<{ output: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId);
    const profile = await loadVoice(ctx, projectId);

    const system = [
      "You are a British content writer working with a small business.",
      "Write in UK English. Plain, direct, understated — the way a knowledgeable peer talks over coffee.",
      "Never use hype words such as unlock, elevate, game-changer, supercharge, crucial, tapestry, testament, foster, or 'not X, it's Y'.",
      "Keep the substance and the specifics of the original. Do not invent facts, numbers or claims.",
      TARGET_BRIEF[data.target],
      "Return plain text only. No preamble and no closing commentary.",
    ].join("\n");

    const prompt = [
      profile.context,
      "",
      "Original content:",
      data.content,
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
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("The AI is busy right now — try again in a moment.");
      if (res.status === 402) throw new Error("You've run out of AI credits. Top them up, then try again.");
      if (res.status === 403) throw new Error("AI generation is switched off for this workspace.");
      throw new Error(`Could not repurpose this (${res.status}). ${txt.slice(0, 120)}`);
    }

    const json = await res.json();
    const output = str(json?.choices?.[0]?.message?.content);
    if (!output) throw new Error("Nothing came back. Try again.");
    const checked = cleanForWorkspace(output, profile.brain, { kind: "repurpose", verifiedContext: `${profile.context}\n${prompt}` }, { projectId, generator: "repurpose" });
    return { output: checked.value };
  });

/** Saves a repurposed piece into the Content Bank as a draft. */
export const saveRepurposed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(2).max(300),
        body: z.string().trim().min(2).max(20000),
        target: z.enum(REPURPOSE_TARGETS),
        projectId: z.string().uuid().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const projectId = await resolveProjectId(ctx, data.projectId);
    const { data: row, error } = await ctx.supabase
      .from("content_posts")
      .insert({
        user_id: ctx.userId,
        project_id: projectId,
        title: data.title,
        caption: data.body,
        status: "draft",
        meta: { source: "repurposing_suite", repurpose_target: data.target },
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (row?.id as string | undefined) ?? null };
  });

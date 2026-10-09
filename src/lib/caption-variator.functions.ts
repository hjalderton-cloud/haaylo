import { createServerFn } from "@tanstack/react-start";
import { cleanForWorkspace, brainFromGrounding, validateImagePrompt } from "./brand-compliance.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const VARIATOR_PLATFORMS = ["linkedin", "instagram", "facebook"] as const;
export type VariatorPlatform = (typeof VARIATOR_PLATFORMS)[number];

export const PLATFORM_STYLE: Record<VariatorPlatform, string> = {
  linkedin:
    "Professional and considered, slightly longer than the original. Short paragraphs with line breaks. No hashtags inside the body — at most two on their own final line.",
  instagram:
    "Hook-heavy opening line that stops the scroll, conversational throughout, short lines, and 5-8 relevant hashtags grouped on the last line only.",
  facebook:
    "Warm and community-focused, slightly shorter than the original, plain-spoken, ends with a question or gentle invitation. No hashtags.",
};

export type CaptionVariant = {
  platform: VariatorPlatform;
  caption: string;
};

const input = z.object({
  caption: z.string().trim().min(10, "Paste a caption first.").max(3000),
  source: z.enum(VARIATOR_PLATFORMS).nullish(),
  targets: z.array(z.enum(VARIATOR_PLATFORMS)).min(1).max(3),
  projectId: z.string().uuid().nullish(),
  /** Bumped on "Regenerate all" so the model varies the wording. */
  nonce: z.number().int().nullish(),
});

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

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Central brand grounding (full Brand DNA, voice, CTAs, proof) for the selected workspace. */
async function loadVoice(ctx: Ctx, projectId?: string | null) {
  const resolved = await resolveProjectId(ctx, projectId);
  const { loadBrandContext } = await import("./brand-context.server");
  const brand = await loadBrandContext(ctx, resolved);
  const b = brand.brain;
  return {
    hasVoice: Boolean(s(b?.brand?.tone_of_voice) || s(b?.founder?.signature_phrases) || s(b?.founder?.sample_posts)),
    context: brand.prompt,
    brain: b as Record<string, unknown>,
    projectId: resolved,
  };
}

function stripFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

/** Rewrites one master caption into a version per selected platform. */
export const varyCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<{ variants: CaptionVariant[]; hasVoice: boolean }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const voice = await loadVoice(context, data.projectId);

    const system = [
      "You rewrite one social caption into platform-native versions for a British small business.",
      "Write in UK English. Keep the writer's own voice, facts and offer exactly as given — never invent claims, prices, dates or statistics.",
      "Plain, direct, understated British tone. No hype, no press-release cadence, no emoji spam, no phrases like 'unlock', 'elevate', 'game-changer', 'dive deep' or 'not X, it's Y'.",
      "Each version must read as a complete standalone post, not a summary.",
      "Return JSON only: { \"variants\": [ { \"platform\": \"linkedin\", \"caption\": \"...\" } ] }",
    ].join("\n");

    const prompt = [
      voice.context ? `Brand context:\n${voice.context}\n` : "",
      data.source ? `The master caption was originally written for ${data.source}.\n` : "",
      `Master caption:\n"""\n${data.caption}\n"""\n`,
      "Rewrite it for each of these platforms, following the style note exactly:",
      ...data.targets.map((p) => `- ${p}: ${PLATFORM_STYLE[p]}`),
      data.nonce ? `\nGive noticeably fresh wording this time (variation ${data.nonce}).` : "",
    ].join("\n");

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
      throw new Error(`Could not rewrite that caption (${res.status}). ${txt.slice(0, 120)}`);
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content as string | undefined;
    if (!raw) throw new Error("Nothing came back. Try again.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(stripFence(raw));
    } catch {
      throw new Error("Could not read the rewritten captions. Try again.");
    }

    parsed = cleanForWorkspace(parsed, voice.brain, { kind: "caption_variant", verifiedContext: `${voice.context}\n${prompt}` }, { projectId: voice.projectId ?? null, generator: "caption_variator" }).value;
    const rows = Array.isArray(parsed?.variants) ? parsed.variants : [];
    const byPlatform = new Map<string, string>();
    for (const row of rows) {
      const key = s(row?.platform).toLowerCase();
      const caption = s(row?.caption);
      if (caption && (VARIATOR_PLATFORMS as readonly string[]).includes(key)) byPlatform.set(key, caption);
    }

    const variants: CaptionVariant[] = data.targets
      .filter((p) => byPlatform.has(p))
      .map((p) => ({ platform: p, caption: byPlatform.get(p) as string }));

    if (!variants.length) throw new Error("The rewrite came back empty. Try again.");
    return { variants, hasVoice: voice.hasVoice };
  });

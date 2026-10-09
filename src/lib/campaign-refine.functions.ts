/**
 * Per-asset refinement for the campaign workbench.
 *
 * One server function rewrites a single piece of campaign copy (a post, an
 * email or landing-page copy) under the house writing rules, grounded in the
 * workspace's brand voice. It only returns text — saving stays with the
 * existing update functions, so nothing here duplicates write logic.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const REFINE_ACTIONS = ["regenerate", "shorter", "conversational", "cta"] as const;
export type RefineAction = (typeof REFINE_ACTIONS)[number];

export const REFINE_LABELS: Record<RefineAction, string> = {
  regenerate: "Regenerate",
  shorter: "Make shorter",
  conversational: "Make more conversational",
  cta: "Change the call to action",
};

const INSTRUCTION: Record<RefineAction, string> = {
  regenerate: "Write it again from scratch. Same subject, same facts, noticeably different wording and structure.",
  shorter: "Cut it to roughly two thirds of its length. Keep every fact and the call to action.",
  conversational: "Loosen the tone so it reads like the founder talking to one person. Keep the facts and the length roughly the same.",
  cta: "Keep the body as it is and replace the closing call to action with a different, clearer one.",
};

const input = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(["post", "email", "landing"]),
  action: z.enum(REFINE_ACTIONS),
  text: z.string().trim().min(10, "There's nothing to rewrite yet.").max(8000),
  note: z.string().trim().max(400).nullish(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function loadVoice(ctx: Ctx, projectId: string): Promise<string> {
  const { data: owned } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!owned) throw new Error("That workspace isn't yours.");

  const { data: brainRow } = await ctx.supabase
    .from("business_brains")
    .select("data")
    .eq("project_id", projectId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brain = ((brainRow?.data as any) ?? {}) as Record<string, any>;

  return [
    s(brain?.business?.name) && `Business: ${s(brain.business.name)}`,
    s(brain?.brand?.tone_of_voice) && `Tone of voice: ${s(brain.brand.tone_of_voice)}`,
    s(brain?.audience?.ideal_customer) && `Audience: ${s(brain.audience.ideal_customer)}`,
    s(brain?.business?.products_services) && `Offer: ${s(brain.business.products_services)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Rewrites one piece of campaign copy. Returns the new text only. */
export const refineCampaignText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const voice = await loadVoice(context as Ctx, data.projectId);

    const system = [
      "You rewrite marketing copy for a British small business.",
      "Write in UK English. Keep every fact, offer, price and date exactly as given — never invent anything.",
      "Plain, direct, understated British tone. Peer over coffee, not a press release.",
      "Banned: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, game-changer, foster, unlock, supercharge, and 'not X, it's Y' constructions.",
      "No rhetorical-question openers, no stacked negatives, no emoji spam.",
      "Return the rewritten copy only — no preamble, no quotes, no markdown fences.",
    ].join("\n");

    const prompt = [
      voice && `Brand context:\n${voice}\n`,
      `This is ${data.kind === "post" ? "a social post" : data.kind === "email" ? "a marketing email" : "landing page copy"}.`,
      INSTRUCTION[data.action],
      data.note ? `Extra instruction from the owner: ${data.note}` : "",
      `\nCopy:\n"""\n${data.text}\n"""`,
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
      if (res.status === 429) throw new Error("The AI is busy right now — try again in a moment.");
      if (res.status === 402) throw new Error("You've run out of AI credits. Top them up, then try again.");
      throw new Error(`That rewrite didn't come back (${res.status}). Try again.`);
    }

    const json = await res.json();
    const raw = s(json?.choices?.[0]?.message?.content).replace(/^```[a-z]*|```$/gi, "").trim();
    if (!raw) throw new Error("The rewrite came back empty. Try again.");
    return { text: raw };
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { BrainData } from "./brain-schema";

const PLATFORMS = ["instagram", "linkedin", "tiktok", "x", "youtube", "facebook"] as const;
const FORMATS = ["video", "carousel", "post", "thread", "caption", "outline"] as const;

const inputSchema = z.object({
  projectId: z.string().uuid().optional(),
  platform: z.enum(PLATFORMS),
  format: z.enum(FORMATS),
  sections: z.array(z.string().max(40)).max(20).optional(),
  trend: z.string().max(200).nullable().optional(),
  topic: z.string().max(400).optional(),
  notes: z.string().max(4000).optional(),
});

const PLATFORM_LABEL: Record<(typeof PLATFORMS)[number], string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X (Twitter)",
  youtube: "YouTube",
  facebook: "Facebook",
};

function formatBrief(format: (typeof FORMATS)[number], platform: string): string {
  switch (format) {
    case "video":
      return `A short-form video script for ${platform}. Use these exact headers on their own lines: "HOOK (0-2s)", "BEAT 2", "BEAT 3", "CLOSE". Under each header write the spoken line(s) in the brand voice, then a line starting "VISUAL CUE: " describing what is on screen. Every beat must advance the story — never restate a previous beat.`;
    case "carousel":
      return `A ${platform} carousel of 6 slides. Use headers "SLIDE 1 — Cover" through "SLIDE 6 — ...", each with its own distinct angle: cover hook, the problem in the customer's words, the specific insight, the mechanism/how it works, real proof (only from the brain), the ask. CRITICAL: no two slides may repeat the same fact, phrase, statistic or sentence structure. Each slide is 12–30 words. Finish with a "CAPTION" header and a caption that does NOT copy slide text verbatim.`;
    case "post":
      return `A written ${platform} post. Headers: "HOOK", then body paragraphs, then "CLOSE" with the call to action. Short lines, no bullet padding, no repeated ideas.`;
    case "thread":
      return `A 6-post thread. Headers "HOOK", "BEAT 2".."BEAT 5", "CLOSE", each numbered 1/..6/. Each post makes a different point.`;
    case "caption":
      return `A single ${platform} caption of 70 words maximum excluding hashtags. Headers: "CAPTION", then "CLOSE" with the call to action, then a "VISUAL CUE: " line.`;
    case "outline":
      return `A long-form video outline. Headers "HOOK (0-15s)", "BEAT 2 — Context", "BEAT 3 — Framework", "BEAT 4 — Proof", "CLOSE", each with a distinct job and a "VISUAL CUE: " line where useful.`;
  }
}

export const generateStudioContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Resolve workspace
    let projectId = data.projectId;
    if (!projectId) {
      const { data: proj } = await context.supabase
        .from("projects")
        .select("id")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      projectId = proj?.id;
    }
    if (!projectId) throw new Error("No workspace found — create a client workspace first.");

    const { data: row } = await context.supabase
      .from("business_brains")
      .select("data")
      .eq("project_id", projectId)
      .maybeSingle();
    const brain = (row?.data ?? {}) as BrainData;

    const { BRAIN_SECTIONS } = await import("./brain-schema");
    const wanted = data.sections?.length ? new Set(data.sections) : null;
    const lines: string[] = [];
    for (const s of BRAIN_SECTIONS) {
      if (wanted && !wanted.has(String(s.key))) continue;
      const sect = (brain as Record<string, Record<string, string | undefined>>)[s.key as string];
      if (!sect) continue;
      const entries = s.fields
        .map((f) => {
          const v = sect[f.key];
          return v && String(v).trim() ? `  - ${f.label}: ${String(v).trim()}` : null;
        })
        .filter(Boolean) as string[];
      if (entries.length) lines.push(`${s.title}:`, ...entries);
    }
    if (!lines.length) {
      throw new Error("This workspace's Strategy Profile has nothing in the selected sections yet.");
    }

    const platform = PLATFORM_LABEL[data.platform];
    const system = [
      "You are a senior UK copywriter writing for one specific business.",
      "GROUND TRUTH: only use facts, offers, proof, numbers and CTAs found in the BUSINESS BRAIN below.",
      "NEVER invent testimonials, statistics, case studies, guarantees, offers, lead magnets or customer stories.",
      "Write in UK English, in the brand's tone of voice. Obey any banned words list absolutely.",
      "Be specific, not generic: no 'in today's fast-paced world', no filler, no motivational fluff.",
      "ANTI-REPETITION: never repeat the same credential, statistic, phrase or sentence shape twice in one output.",
      "BANNED CONSTRUCTIONS — ZERO TOLERANCE: never use antithesis / negation-then-affirmation phrasing in any form (\"it's not X, it's Y\", \"isn't just X, it's Y\", \"not a luxury, a necessity\", \"less about A, more about B\", \"we don't do A, we do B\", \"not only A but also B\"). Before returning, scan for \"not/isn't/aren't/doesn't/don't\" followed within ~15 words by \"it's/it is/but/;/,/—\" and rewrite any such sentence as a plain positive statement.",
      "BRITISH WRITER VOICE: write like a skilled British copywriter, indistinguishable from a human. Vary sentence length aggressively (punchy short sentences mixed with occasional longer ones). Use natural contractions (it's, don't, you're) without exception. Vary paragraph lengths; never produce perfectly balanced blocks. UK spellings only (categorise, prioritising, behaviour, colour).",
      "FORBIDDEN: no dramatic hook paired with a cliché analogy; no emoji immediately after a hook (max one emoji per post, in body copy only); no overhyped traps like 'permanent Brain', 'Founding Member Spots', 'reclaim your evenings'; no forced engagement questions at the end; no rigid Problem-Agitation-Solution frameworks — start directly with substance.",
      "BANNED VOCABULARY: 'crucial', 'tapestry', 'dive deep', 'more than just', 'look no further', 'elevate', 'testament', 'game-changer', 'foster', 'unlock', 'supercharge'. No hyper-enthusiastic American sales language — understated, direct British tone. Replace hyper-polished adjectives with objective nouns or plain observations.",
      "DISGUISE THE FRAMEWORK: if you use Hook-Problem-Solution, PAS or AIDA, hide the seams — no obvious or rigid transitions. Banned bridges: '[Product] solves this by…', 'Introducing…', 'That's where X comes in', 'Enter X', 'The solution?', 'Sound familiar?'. Enter the problem through a specific annoying action a real person does, not an abstract pain statement. Enter the solution casually, like sharing a tool you built or found, never like pitching.",
      "PRODUCT INSIDE THE STORY: in narrative posts (partnerships, events, personal experience), never give the product its own explainer paragraph. Mention it as a tool in passing — 'they're using it to build these systems out' — not 'X provides the framework for…'. Keep one conversational register from first sentence to last; never drift into corporate or grandiose language halfway through.",

      "ALOUD TEST: if a sentence sounds like a press release, motivational speaker or LinkedIn thought leader when read aloud, rewrite it as one peer talking to another over coffee. Allow realistic nuance over robotic confidence. Start and end on substance — no preambles or performative enthusiasm.",

      "Use only the CTAs stored in the brain. If none exist, end with a plain, honest next step.",
      "Output plain text only using the exact section headers requested. No markdown, no asterisks, no preamble.",
    ].join("\n");

    const user = [
      `BUSINESS BRAIN (selected sections):\n${lines.join("\n")}`,
      "",
      `CHANNEL: ${platform}`,
      `DELIVERABLE: ${formatBrief(data.format, platform)}`,
      data.trend ? `TREND ANGLE to weave in naturally (do not let it override the brand voice): ${data.trend}` : "",
      data.topic ? `TOPIC / ANGLE requested by the user: ${data.topic}` : "",
      data.notes ? `EXTRA NOTES: ${data.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
    if (!res.ok) throw new Error(`Generation failed (${res.status})`);
    const json = await res.json();
    const text: string = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("Empty response from AI");

    await context.supabase.from("marketing_history").insert({
      project_id: projectId,
      user_id: context.userId,
      module: "content_studio",
      title: `${platform} ${data.format} — ${new Date().toDateString()}`,
      prompt: { system, user },
      output: text,
    });

    return { projectId, output: text };
  });

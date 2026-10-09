// Server-only AI Marketing Agent engine. Runs a scheduled weekly plan:
// reads the Brain + recent learnings, drafts N posts via the Lovable AI
// Gateway, writes them to content_posts as drafts, and logs an agent_run.
// Never import this from client-reachable modules.
import { loadBrandContext } from "./brand-context.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const BANNED_FILLER = [
  "crucial", "tapestry", "dive deep", "more than just", "look no further",
  "elevate", "testament", "game-changer", "foster", "unlock", "supercharge",
];
const BANNED_RHETORIC = [
  /\b(?:is|are|was|were|'s|'re|isn't|aren't|wasn't|weren't)\s+(?:about\s+)?more\s+than\s+(?:just|simply|merely)\b/i,
  /\bmore\s+than\s+(?:just|simply|merely)\b/i,
  /\bnot\s+only\b[^.!?\n]{0,120}\bbut\s+also\b/i,
  /\bgoes?\s+beyond\s+(?:just|simply|merely)\b/i,
  /\bless\s+about\b[^.!?\n]{0,120}\bmore\s+about\b/i,
];

const UK_SPELLING: Array<[RegExp, string]> = [
  [/\bprioritiz(e|es|ed|ing)\b/gi, "prioritis$1"],
  [/\borganiz(e|es|ed|ing)\b/gi, "organis$1"],
  [/\boptimiz(e|es|ed|ing)\b/gi, "optimis$1"],
  [/\brecogniz(e|es|ed|ing)\b/gi, "recognis$1"],
  [/\bpersonaliz(e|es|ed|ing)\b/gi, "personalis$1"],
  [/\bbehaviors?\b/gi, "behaviours"],
  [/\bcolors?\b/gi, "colours"],
  [/\bfavors?\b/gi, "favours"],
  [/\bcenters?\b/gi, "centres"],
  [/\banalyz(e|es|ed|ing)\b/gi, "analys$1"],
  [/\bmaximiz(e|es|ed|ing)\b/gi, "maximis$1"],
  [/\bleverage\b/gi, "use"],
  [/\bspecializ(e|es|ed|ing)\b/gi, "specialis$1"],
  [/\bgray\b/gi, "grey"],
  [/\bprogram\b/gi, "programme"],
];

function enforceUkEnglish(text: string): string {
  return UK_SPELLING.reduce((t, [re, rep]) => t.replace(re, rep), text);
}

function scrub(text: string): string {
  let out = enforceUkEnglish(text);
  for (const w of BANNED_FILLER) {
    out = out.replace(new RegExp(`\\b${w.replace(/ /g, "\\s+")}\\b`, "gi"), "");
  }
  for (const re of BANNED_RHETORIC) out = out.replace(re, "");
  return out.replace(/\s{2,}/g, " ").trim();
}


type DbLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
};

type AgentSettings = {
  user_id: string;
  project_id: string;
  mode: "draft" | "review" | "auto";
  cadence: "weekly" | "daily";
  platforms: string[];
  posts_per_run: number;
  approval_email: string | null;
  active: boolean;
  paused?: boolean;
  tone_override?: string | null;
};


type DraftedPost = {
  caption: string;
  title: string;
  platform: string;
  pillar: "education" | "inspiration" | "entertainment";
};

async function callAi(key: string, system: string, user: string): Promise<string> {
  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI gateway ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? "{}";
}

/**
 * Runs one plan for a single settings row. Drafts posts into the agent's own
 * queue (agent_posts) — never into the standard Content Bank, and never into
 * the live publishing queue. Approval in the AI Agent section is the only path
 * to scheduling.
 */
export async function runWeeklyPlan(
  supabaseAdmin: DbLike,
  settings: AgentSettings,
  key: string,
  runId?: string | null,
): Promise<{ drafted: DraftedPost[]; queued?: number; runId?: string; error?: string }> {
  if (settings.paused) return { drafted: [], error: "The agent is paused" };

  const [brandCtx, { data: planRow }, { data: learningRows }] = await Promise.all([
    // Central grounding: full Brand DNA, voice + CTAs, proof, competitors, trends, past winners.
    loadBrandContext({ userId: settings.user_id, supabase: supabaseAdmin }, settings.project_id),
    supabaseAdmin
      .from("strategy_plans")
      .select("plan")
      .eq("user_id", settings.user_id)
      .eq("project_id", settings.project_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("agent_learnings")
      .select("insight")
      .eq("project_id", settings.project_id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const context = brandCtx.prompt;
  if (!context) return { drafted: [], error: "Strategy Profile is empty" };
  const plan = (planRow?.plan ?? null) as Record<string, unknown> | null;
  const planText = plan ? JSON.stringify(plan).slice(0, 6000) : "";

  const learningNotes = Array.isArray(learningRows)
    ? (learningRows as Array<{ insight?: string }>).map((l) => l.insight).filter(Boolean).join("\n")
    : "";

  const platforms = (settings.platforms.length ? settings.platforms : ["linkedin"]).join(", ");
  const pillars = ["education", "inspiration", "entertainment"] as const;

  const voice = (settings.tone_override || "").trim();

  const system = `You are a senior UK content strategist drafting a week of social posts for a business. Write exclusively in British English (prioritise, organise, behaviour, colour). Banned filler: ${BANNED_FILLER.join(", ")}. Understated, direct British tone — no hyper-enthusiasm, no clichés. Never use "not X, but Y" antithesis phrasing.
Use ONLY facts in the Strategy Profile. Never invent testimonials, statistics, offers, prices, customer stories or CTAs. If a detail is missing, write around it. End each post with a saved CTA from the Brain, or a plain invitation to get in touch if none is saved.
${voice ? `Write in this voice: ${voice.slice(0, 800)}` : ""}
Return strict JSON only: {"posts":[{"caption":"...","title":"...","platform":"...","pillar":"education|inspiration|entertainment"}]}.`;

  const user = `BUSINESS BRAIN:\n${context}

90-DAY PLAN (align with the themes and pillars in here):\n${planText || "none saved"}

RECENT LEARNINGS (lean towards what worked):\n${learningNotes || "none yet"}

Draft ${settings.posts_per_run} posts for the coming week. Distribute across pillars ${pillars.join(", ")} and platforms ${platforms}. Each caption must be a complete, natural-English post ready to publish, 40–120 words, with a single sentence bridging into the CTA.`;

  let drafted: DraftedPost[] = [];
  let compliance: Record<string, unknown> = {};
  try {
    const { runCompliant, complianceMeta, buildProvenance } = await import("./brand-compliance.server");
    const brainObj = (brandCtx.brain ?? {}) as Record<string, unknown>;
    const { value: json, report } = await runCompliant({
      generate: async (feedback) => {
        const raw = await callAi(key, system, feedback ? `${user}\n\n${feedback}` : user);
        return JSON.parse(raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim()) as { posts?: unknown };
      },
      brain: brainObj,
      options: { kind: "agent_post", verifiedContext: planText },
      groundingPrompt: context,
      aiReview: true,
      taskContext: planText,
      log: { projectId: settings.project_id, generator: "agent.weekly" },
    });
    compliance = complianceMeta(report, buildProvenance(brainObj));
    if (Array.isArray(json.posts)) {
      drafted = (json.posts as Array<Record<string, unknown>>).map((p) => ({
        caption: scrub(String(p.caption ?? "")),
        title: scrub(String(p.title ?? "")).slice(0, 80),
        platform: String(p.platform ?? "linkedin"),
        pillar: (String(p.pillar ?? "").toLowerCase() as DraftedPost["pillar"]),
      })).filter((p) => p.caption.length >= 20);
    }
  } catch {
    return { drafted: [], error: "AI generation failed" };
  }

  if (!drafted.length) return { drafted: [], error: "No valid posts generated" };

  const rows = drafted.map((p) => ({
    user_id: settings.user_id,
    project_id: settings.project_id,
    run_id: runId ?? null,
    caption: p.caption,
    title: p.title || null,
    platform: p.platform,
    pillar: p.pillar,
    status: "pending",
    meta: { source: "agent", ...compliance },
  }));

  const { error: insErr } = await supabaseAdmin.from("agent_posts").insert(rows);
  if (insErr) return { drafted: [], error: insErr.message };

  return { drafted, queued: 0 };
}



// Server-only: generates the 90-day content plan (pillars, themes, weekly
// timeline) from the user's Strategy Profile via the AI gateway.
import { enforceUkEnglish } from "@/lib/first-post-ideas.server";
import { runCompliant, brainFromGrounding } from "@/lib/brand-compliance.server";

const BANNED = [
  "crucial", "tapestry", "dive deep", "more than just", "look no further",
  "elevate", "testament", "game-changer", "foster", "unlock", "supercharge",
];


/** Wraps the central brand context (loadBrandContext().prompt) for this prompt. */
function groundingBlock(grounding: string): string {
  return grounding.trim() ? `\nSTRATEGY PROFILE (ground every business fact in this):\n${grounding.trim()}\n` : "";
}

export type StrategyPlan = {
  /** What the user calls this strategy. Used to file its posts in the Content Bank. */
  name?: string;
  goal: string;
  pillars: Array<{ name: string; description: string; topics: string[] }>;
  weeks: Array<{ week: number; theme: string; focus: string; pillar: string }>;
};

function parsePlan(raw: string): StrategyPlan {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The AI didn't return a plan it could read. Try again.");
  try {
    const parsed = JSON.parse(match[0]) as Partial<StrategyPlan>;
    return {
      goal: typeof parsed.goal === "string" ? parsed.goal : "",
      pillars: Array.isArray(parsed.pillars)
        ? parsed.pillars
            .filter((p) => p && typeof p === "object" && typeof p.name === "string")
            .slice(0, 6)
            .map((p) => ({
              name: String(p.name),
              description: typeof p.description === "string" ? p.description : "",
              topics: Array.isArray(p.topics) ? p.topics.map(String).slice(0, 10) : [],
            }))
        : [],
      weeks: Array.isArray(parsed.weeks)
        ? parsed.weeks
            .filter((w) => w && typeof w === "object")
            .slice(0, 13)
            .map((w, i) => ({
              week: typeof w.week === "number" ? w.week : i + 1,
              theme: typeof w.theme === "string" ? w.theme : "",
              focus: typeof w.focus === "string" ? w.focus : "",
              pillar: typeof w.pillar === "string" ? w.pillar : "",
            }))
        : [],
    };
  } catch {
    throw new Error("The AI didn't return a plan it could read. Try again.");
  }
}

async function callGateway(system: string, prompt: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured on the server yet.");

  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (err) {
    console.error("[strategy] request failed", err);
    throw new Error("Could not reach the AI. Try again in a moment.");
  }

  if (!response.ok) {
    const body = await response.text();
    console.error("[strategy] gateway error", response.status, body.slice(0, 400));
    if (response.status === 429) throw new Error("The AI is busy right now. Try again in a moment.");
    if (response.status === 402) throw new Error("AI credits have run out — top up to keep generating.");
    throw new Error("The AI could not finish that. Try again.");
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = (payload.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("The AI came back empty. Try again.");
  return enforceUkEnglish(text);
}

export async function generateNinetyDayPlan(
  grounding: string,
  opts: { goal: string; postsPerWeek: number; name?: string },
): Promise<StrategyPlan> {
  const system =
    "You are a content strategist for small British businesses. You build realistic 90-day content plans. " +
    "British English only. Understated, direct, peer-over-coffee voice. No hype. " +
    `Never use: ${BANNED.join(", ")}. ` +
    "Reply with ONLY a JSON object — no markdown fences, no commentary.";

  const prompt = `${groundingBlock(grounding)}
Build a 90-day content plan.
${opts.goal ? `The user's stated goal for the 90 days: ${opts.goal}` : "Infer the goal from the business goals in the Strategy Profile."}
Cadence: ${opts.postsPerWeek} posts per week.

Return ONLY this JSON shape:
{
  "goal": "one sentence — the measurable outcome of the 90 days",
  "pillars": [
    { "name": "pillar name (2-4 words)", "description": "one sentence on what it covers and why it serves the audience", "topics": ["5-8 specific post topic ideas"] }
  ],
  "weeks": [
    { "week": 1, "theme": "the weekly theme (short)", "focus": "one sentence on what this week's posts should achieve", "pillar": "name of the pillar this week leans on" }
  ]
}

Rules:
- 3 to 5 pillars. Between them they must cover: educating the audience, building trust/proof, and moving people toward the offer.
- Exactly 12 weeks. Each week leans on one pillar but can touch others. No two weeks may repeat the same theme or angle — early weeks earn attention, middle weeks build trust, final weeks convert.
- Every topic must be specific enough to write a post from today — no vague labels like "engagement post".
- Every business fact, offer, audience detail and proof point must come from the STRATEGY PROFILE. Do not invent case studies, prices or guarantees.`;

  const { brain, verifiedContext } = brainFromGrounding(grounding);
  const { value: plan } = await runCompliant({
    generate: async (feedback) => parsePlan(await callGateway(system, feedback ? `${prompt}\n\n${feedback}` : prompt)),
    brain,
    options: { kind: "strategy", verifiedContext },
    log: { projectId: null, generator: "strategy.90_day" },
  });
  if (opts.name && opts.name.trim()) plan.name = opts.name.trim().slice(0, 120);
  return plan;
}

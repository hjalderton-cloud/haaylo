import type { FirstPostIdea } from "./first-post-ideas.functions";

const FALLBACK_IDEAS: FirstPostIdea[] = [
  { pillar: "education", topic: "Three avoidable mistakes customers make before choosing a provider", formatId: "blog" },
  { pillar: "education", topic: "A practical checklist for comparing your options with confidence", formatId: "instagram" },
  { pillar: "education", topic: "What a good service process should look like from start to finish", formatId: "linkedin" },
  { pillar: "inspiration", topic: "The customer outcome that makes this work worth doing", formatId: "instagram" },
  { pillar: "inspiration", topic: "Why this business exists and the standard behind every decision", formatId: "linkedin" },
  { pillar: "inspiration", topic: "A meaningful business goal and the work happening to reach it", formatId: "email" },
  { pillar: "entertainment", topic: "Three common industry myths put to a quick fact check", formatId: "tiktok" },
  { pillar: "entertainment", topic: "The questions customers are often too embarrassed to ask", formatId: "tiktok" },
  { pillar: "entertainment", topic: "A behind-the-scenes look at how the work gets done", formatId: "facebook" },
];

const VALID_FORMATS = new Set(["instagram", "tiktok", "linkedin", "blog", "facebook", "email"]);
const VALID_PILLARS = new Set(["education", "inspiration", "entertainment"]);

const UK_SPELLING_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bprioritizing\b/gi, "prioritising"],
  [/\bprioritized\b/gi, "prioritised"],
  [/\bprioritize\b/gi, "prioritise"],
  [/\bprioritizes\b/gi, "prioritises"],
  [/\borganizing\b/gi, "organising"],
  [/\borganized\b/gi, "organised"],
  [/\borganize\b/gi, "organise"],
  [/\borganizes\b/gi, "organises"],
  [/\boptimizing\b/gi, "optimising"],
  [/\boptimized\b/gi, "optimised"],
  [/\boptimize\b/gi, "optimise"],
  [/\boptimizes\b/gi, "optimises"],
  [/\brecognizing\b/gi, "recognising"],
  [/\brecognized\b/gi, "recognised"],
  [/\brecognize\b/gi, "recognise"],
  [/\brecognizes\b/gi, "recognises"],
  [/\bpersonalizing\b/gi, "personalising"],
  [/\bpersonalized\b/gi, "personalised"],
  [/\bpersonalize\b/gi, "personalise"],
  [/\bpersonalizes\b/gi, "personalises"],
  [/\bbehavior\b/gi, "behaviour"],
  [/\bbehaviors\b/gi, "behaviours"],
  [/\bcolor\b/gi, "colour"],
  [/\bcolors\b/gi, "colours"],
  [/\bfavor\b/gi, "favour"],
  [/\bfavors\b/gi, "favours"],
  [/\bcenter\b/gi, "centre"],
  [/\bcenters\b/gi, "centres"],
  [/\banalyze\b/gi, "analyse"],
  [/\banalyzing\b/gi, "analysing"],
  [/\banalyzed\b/gi, "analysed"],
  [/\banalyzes\b/gi, "analyses"],
  [/\bsummarize\b/gi, "summarise"],
  [/\bsummarizing\b/gi, "summarising"],
  [/\bsummarized\b/gi, "summarised"],
  [/\bmaximize\b/gi, "maximise"],
  [/\bmaximizing\b/gi, "maximising"],
  [/\bmaximized\b/gi, "maximised"],
  [/\bleverage\b/gi, "use"],
  [/\bspecialize\b/gi, "specialise"],
  [/\bspecializing\b/gi, "specialising"],
  [/\blicense\b/gi, "licence"],
  [/\bgray\b/gi, "grey"],
  [/\bprogram\b/gi, "programme"],
  [/\bflavor\b/gi, "flavour"],
  [/\bhonor\b/gi, "honour"],
];

export function enforceUkEnglish(text: string): string {
  return UK_SPELLING_REPLACEMENTS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  );
}


function cleanIdeas(value: unknown): FirstPostIdea[] {
  if (!Array.isArray(value)) return [];
  const result: FirstPostIdea[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const pillar = String(row.pillar ?? "").toLowerCase();
    const formatId = String(row.formatId ?? "").toLowerCase();
    const topic = enforceUkEnglish(
      String(row.topic ?? "").replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim(),
    );
    if (!VALID_PILLARS.has(pillar) || !VALID_FORMATS.has(formatId) || topic.length < 24 || topic.length > 160) continue;
    if (/[£$€]|\bcomment\s+[A-Z]{2,}\b|\bclick the link\b/i.test(topic)) continue;
    if (result.some((idea) => idea.topic.toLowerCase() === topic.toLowerCase())) continue;
    result.push({ pillar, topic, formatId } as FirstPostIdea);
  }
  return result;
}

export async function generateIdeasForProject(
  supabase: unknown,
  projectId: string,
  userId: string,
): Promise<{ ideas: FirstPostIdea[] }> {
  const { loadBrandContext } = await import("./brand-context.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { prompt: context } = await loadBrandContext({ userId, supabase: supabase as any }, projectId);
  if (!context) return { ideas: FALLBACK_IDEAS };

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ideas: FALLBACK_IDEAS };

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a senior UK content strategist. Create exactly nine polished content topics: three education, three inspiration and three entertainment.

QUALITY RULES:
- Write exclusively in British English. Use British spelling in every topic (for example: prioritise, organise, recognise, behaviour and colour). American spelling is forbidden.
- Banned filler words everywhere: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, game-changer, foster, unlock, supercharge.
- Understated, direct British tone — no hyper-enthusiastic American sales language, no clichéd analogies.
- Every topic must be a clear, complete, natural-English editorial angle that makes sense without seeing the source notes.
- Use only facts in the Strategy Profile. Never invent results, stories, statistics, customer situations, processes, opinions or offers.
- Never copy a CTA, promotional instruction or lead-magnet instruction into a topic.
- Convert rough notes into an editorial idea; never splice or quote raw field text.
- Make each topic specific to this business and useful to its actual audience.
- Avoid generic filler, vague promises, clickbait and phrases such as “why it keeps happening”.
- Inspiration must use a real mission, founder reason, value, customer goal or proven outcome from the Brain. If absent, use a thoughtful business-principle angle without inventing a story.
- Entertainment must remain credible: myth checks, relatable observations, FAQs or behind-the-scenes subjects supported by the Brain.
- Topics must be 7–16 words, sentence case, with no trailing punctuation.
- Vary the format IDs across instagram, tiktok, linkedin, blog, facebook and email.

Return strict JSON only: {"ideas":[{"pillar":"education|inspiration|entertainment","topic":"...","formatId":"instagram|tiktok|linkedin|blog|facebook|email"}]}`,
        },
        { role: "user", content: `BUSINESS BRAIN:\n${context}` },
      ],
    }),
  });
  if (!response.ok) return { ideas: FALLBACK_IDEAS };
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  try {
    const raw = payload.choices?.[0]?.message?.content ?? "{}";
    const json = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(json) as { ideas?: unknown };
    const { cleanForWorkspace, brainFromGrounding } = await import("./brand-compliance.server");
    const g = brainFromGrounding(context);
    const ideas = cleanForWorkspace(cleanIdeas(parsed.ideas), g.brain, { kind: "idea", verifiedContext: g.verifiedContext }, { projectId, generator: "first_post_ideas" }).value;
    const complete = (["education", "inspiration", "entertainment"] as const).every(
      (pillar) => ideas.filter((idea) => idea.pillar === pillar).length >= 3,
    );
    if (complete) {
      return {
        ideas: (["education", "inspiration", "entertainment"] as const).flatMap((pillar) =>
          ideas.filter((idea) => idea.pillar === pillar).slice(0, 3),
        ),
      };
    }
  } catch {
    // A malformed model response falls back to known-good editorial topics.
  }
  return { ideas: FALLBACK_IDEAS };
}
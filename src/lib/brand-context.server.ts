/**
 * One source of truth for everything Haaylo knows about a workspace, rendered
 * as prompt-ready text.
 *
 * Every writer in the app (post batches, campaign assets, repurposing, the
 * agent) builds its prompt on top of this so that nothing generic ever gets
 * written: the full Strategy Profile, the latest competitor read, the latest
 * trend scan and the posts that actually landed well all shape the output.
 *
 * Server-only by filename, so it never reaches the browser bundle.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { voiceAndCtaPrompt } from "./brand-voice";
import { availabilityPrompt } from "./brand-compliance.server";

type Ctx = { userId: string; supabase: any };

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const clip = (v: string, n: number) => (v.length > n ? `${v.slice(0, n)}…` : v);

export type BrandContext = {
  /** Everything, ready to drop into a prompt. */
  prompt: string;
  /** The raw Strategy Profile, for callers that need individual fields. */
  brain: Record<string, any>;
  name: string;
  audience: string;
  /** Channels the owner actually posts on, lowercase. */
  channels: string[];
};

/** Business facts: what they sell, where, how long, what makes them different. */
function businessBlock(b: Record<string, any>): string {
  const lines = [
    s(b?.business?.name) && `Business: ${s(b.business.name)}`,
    s(b?.business?.industry) && `Niche: ${s(b.business.industry)}`,
    s(b?.business?.location) && `Location and market: ${s(b.business.location)}`,
    s(b?.business?.years_trading) && `Years trading: ${s(b.business.years_trading)}`,
    s(b?.business?.products_services) && `Products and services (only ever reference these):\n${clip(s(b.business.products_services), 1200)}`,
    s(b?.brand?.usp) && `What sets them apart: ${s(b.brand.usp)}`,
    s(b?.brand?.mission) && `Mission: ${s(b.brand.mission)}`,
    s(b?.brand?.values) && `Values: ${s(b.brand.values)}`,
    s(b?.ctas?.current_offer) && `Current offer: ${s(b.ctas.current_offer)}`,
  ].filter(Boolean);
  return lines.length ? `THE BUSINESS (facts, never contradict or embellish these):\n${lines.join("\n")}` : "";
}

/** Who they are writing for and what actually moves that person. */
function audienceBlock(b: Record<string, any>): string {
  const lines = [
    s(b?.audience?.ideal_customer) && `Ideal customer: ${s(b.audience.ideal_customer)}`,
    s(b?.audience?.pain_points) && `Pain points: ${s(b.audience.pain_points)}`,
    s(b?.audience?.goals) && `What they want: ${s(b.audience.goals)}`,
    s(b?.audience?.objections) && `Objections to overcome: ${s(b.audience.objections)}`,
    s(b?.audience?.buying_triggers) && `Buying triggers: ${s(b.audience.buying_triggers)}`,
  ].filter(Boolean);
  return lines.length
    ? `THE AUDIENCE (write to this person, use their words and worries):\n${lines.join("\n")}`
    : "";
}

/** Real proof: testimonials, results, clients, awards. Nothing invented. */
function proofBlock(b: Record<string, any>): string {
  const lines = [
    s(b?.proof?.testimonials) && `Testimonials in the customer's own words:\n${clip(s(b.proof.testimonials), 1500)}`,
    s(b?.proof?.case_studies) && `Case studies: ${clip(s(b.proof.case_studies), 800)}`,
    s(b?.proof?.notable_clients) && `Notable clients: ${s(b.proof.notable_clients)}`,
    s(b?.proof?.awards_press) && `Awards and press: ${s(b.proof.awards_press)}`,
    s(b?.proof?.owned_stats) && `Stats they own and can quote: ${s(b.proof.owned_stats)}`,
  ].filter(Boolean);
  return lines.length
    ? `PROOF (the only evidence you may cite; quote testimonials as written, never write a fake one):\n${lines.join("\n")}`
    : "";
}

/** Formatting and register rules the owner has set. */
function preferenceBlock(b: Record<string, any>): string {
  const lines = [
    s(b?.brand?.tone_of_voice) && `Tone of voice: ${s(b.brand.tone_of_voice)}`,
    s(b?.brand?.words_always_use) && `Words and phrases to use: ${s(b.brand.words_always_use)}`,
    s(b?.founder?.banned_words) && `NEVER use these words or phrases: ${s(b.founder.banned_words)}`,
    s(b?.founder?.hot_takes) && `Opinions the owner holds: ${s(b.founder.hot_takes)}`,
    s(b?.founder?.origin_story) && `Origin story to draw on: ${clip(s(b.founder.origin_story), 600)}`,
    s(b?.content?.post_length) && `Preferred caption length: ${s(b.content.post_length)}`,
    s(b?.content?.emoji_preference) && `Emoji preference: ${s(b.content.emoji_preference)}`,
    s(b?.content?.formality) && `Formality: ${s(b.content.formality)}`,
    s(b?.content?.cta_style) && `Call-to-action style: ${s(b.content.cta_style)}`,
  ].filter(Boolean);
  return lines.length ? `HOUSE RULES:\n${lines.join("\n")}` : "";
}

/** The most recent competitor read and any unread watch signals. */
async function competitorBlock(ctx: Ctx, projectId: string): Promise<string> {
  const [scanRes, signalRes] = await Promise.all([
    ctx.supabase
      .from("competitor_scans")
      .select("competitor_name, results_json")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from("competitor_signals")
      .select("competitor_name, summary, angle_title, angle_brief")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const lines: string[] = [];
  const scan = scanRes?.data as any;
  if (scan) {
    const r = (scan.results_json ?? {}) as Record<string, any>;
    const topics = Array.isArray(r["topics"]) ? r["topics"].map((t: unknown) => s(t)).filter(Boolean) : [];
    const angles = Array.isArray(r["angles"]) ? r["angles"] : [];
    if (topics.length) lines.push(`Gaps ${s(scan.competitor_name) || "the competition"} is not covering: ${topics.slice(0, 6).join("; ")}`);
    if (s(r["tone"])) lines.push(`How this brand should sound different: ${clip(s(r["tone"]), 400)}`);
    if (angles.length) {
      lines.push(
        `Angles this brand can own:\n${angles
          .slice(0, 4)
          .map((a: any) => `- ${s(a?.title)}${s(a?.brief) ? `: ${clip(s(a.brief), 200)}` : ""}`)
          .filter((l: string) => l.length > 2)
          .join("\n")}`,
      );
    }
  }
  for (const sig of (signalRes?.data ?? []) as any[]) {
    const title = s(sig?.angle_title);
    if (!title) continue;
    lines.push(`Recent competitor move (${s(sig.competitor_name) || "competitor"}): ${clip(s(sig.summary), 200)} → our angle: ${title}`);
  }

  return lines.length
    ? `COMPETITIVE POSITION (take the open ground, never mirror a competitor or name them):\n${lines.join("\n")}`
    : "";
}

/** The latest trend scan for this workspace. */
async function trendBlock(ctx: Ctx, projectId: string): Promise<string> {
  const { data } = await ctx.supabase
    .from("marketing_history")
    .select("output")
    .eq("project_id", projectId)
    .eq("module", "trending_scan")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const raw = s((data as any)?.output);
  if (!raw) return "";
  let trends: any[] = [];
  try {
    const parsed = JSON.parse(raw);
    trends = Array.isArray(parsed?.trends) ? parsed.trends : [];
  } catch {
    return "";
  }
  const lines = trends
    .slice(0, 5)
    .map((t: any) => `- ${s(t?.topic)}${s(t?.angle) ? ` → ${clip(s(t.angle), 180)}` : ""}`)
    .filter((l) => l.length > 3);
  if (!lines.length) return "";
  return `WHAT IS BEING TALKED ABOUT RIGHT NOW (weave in where it genuinely fits, never force it):\n${lines.join("\n")}`;
}

/**
 * Posts that actually landed: published first, then ones the owner approved or
 * scheduled. These show the writer what works with this audience in practice.
 */
async function performanceBlock(ctx: Ctx, projectId: string): Promise<string> {
  const { data } = await ctx.supabase
    .from("content_posts")
    .select("caption, platform, pillar, status, published_at")
    .eq("project_id", projectId)
    .in("status", ["published", "scheduled"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(6);
  const rows = (data ?? []) as any[];
  const lines = rows
    .map((r) => s(r?.caption))
    .filter(Boolean)
    .map((c, i) => `${i + 1}. ${clip(c, 420)}`);
  if (!lines.length) return "";
  const pillars = Array.from(new Set(rows.map((r) => s(r?.pillar)).filter(Boolean)));
  return [
    `WHAT HAS ALREADY WORKED (posts this owner approved or published — match this standard and do not repeat their exact subjects):`,
    lines.join("\n\n"),
    pillars.length ? `Themes that keep earning their place: ${pillars.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The checker's most common recent findings for this workspace, fed back so
 * first drafts avoid predictable slips. Compliance stays the final gate.
 */
async function slipsBlock(ctx: Ctx, projectId: string): Promise<string> {
  const { data } = await ctx.supabase
    .from("content_posts")
    .select("meta")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(60);
  const counts = new Map<string, number>();
  const bucket = (v: string): string | null => {
    const l = v.toLowerCase();
    if (/not x, it'?s y|antithesis|isn'?t just|more than just/.test(l)) return "No \"not X, it's Y\" / \"isn't just\" / \"more than just\" constructions.";
    if (/no x, no y|stacked negative/.test(l)) return "No stacked negatives (\"no X, no Y\").";
    if (/us spelling/.test(l)) return "UK spelling only (colour, organise, favourite).";
    if (/filler/.test(l)) return "No AI filler words (crucial, elevate, seamless, unlock, game-changer).";
    if (/banned word|house rules|prohibit/.test(l)) return "Respect every saved banned word and phrase exactly.";
    if (/price/.test(l)) return "Only use prices exactly as saved.";
    if (/statistic|percentage|completely|unsupported|every window|all the time|invent/.test(l)) return "No absolute or unsupported claims (\"completely\", \"every\", invented numbers or customer feedback).";
    if (/testimonial|quote/.test(l)) return "Quote testimonials word for word, never paraphrased.";
    if (/repeat|angle/.test(l)) return "Each post needs its own scenario and example, never a reworded angle.";
    if (/brochure|abstract opening|company-led|spoken/.test(l)) return "Open with a concrete customer moment or product detail, in plain spoken language to \"you\".";
    if (/rhythm|tick list|emoji|paragraph/.test(l)) return "Match the sample posts' rhythm: short lines, tick lists where they use them.";
    if (/contact|cta|closing/.test(l)) return "Close with an exact saved CTA and the saved contact details where the samples do.";
    if (/coming soon|integration|turnaround|saved offer|included|not offered|beta/.test(l)) return "Never describe planned features, integrations, inclusions or delivery times that aren't saved.";
    return null;
  };
  for (const row of (data ?? []) as any[]) {
    const c = row?.meta?.compliance ?? {};
    const all = [...(c.violations ?? []), ...(c.repaired ?? []), ...(c.aiIssues ?? []), ...(c.warnings ?? [])].map(String);
    const seen = new Set<string>();
    for (const v of all) { const b = bucket(v); if (b && !seen.has(b)) { seen.add(b); counts.set(b, (counts.get(b) ?? 0) + 1); } }
  }
  const top = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => `- ${k}`);
  return top.length ? `AVOID THESE (the brand checker has repeatedly caught them in this workspace):\n${top.join("\n")}` : "";
}

/** The channels the owner actually posts on, taken from their saved preferences. */
export function savedChannels(brain: Record<string, any>): string[] {
  const text = [s(brain?.content?.preferred_platforms), s(brain?.marketing?.channels)].join(", ").toLowerCase();
  const known = ["instagram", "facebook", "linkedin", "tiktok", "x", "youtube", "pinterest"];
  return known.filter(
    (p) =>
      text.includes(p) ||
      (p === "facebook" && /\bfb\b/.test(text)) ||
      (p === "instagram" && /\binsta\b/.test(text)),
  );
}

/**
 * Loads everything Haaylo knows about the workspace and renders it for a prompt.
 * Every block is optional: an empty Strategy Profile simply produces less text.
 */
export async function loadBrandContext(ctx: Ctx, projectId: string | null): Promise<BrandContext> {
  if (!projectId) {
    return { prompt: "", brain: {}, name: "the business", audience: "", channels: [] };
  }

  const [brainRes, competitors, trends, performance, slips] = await Promise.all([
    ctx.supabase.from("business_brains").select("data").eq("project_id", projectId).maybeSingle(),
    competitorBlock(ctx, projectId).catch(() => ""),
    trendBlock(ctx, projectId).catch(() => ""),
    performanceBlock(ctx, projectId).catch(() => ""),
    slipsBlock(ctx, projectId).catch(() => ""),
  ]);

  const brain = (((brainRes as any)?.data?.data ?? {}) as Record<string, any>) || {};

  const prompt = [
    businessBlock(brain),
    availabilityPrompt(brain),
    audienceBlock(brain),
    proofBlock(brain),
    voiceAndCtaPrompt(brain),
    preferenceBlock(brain),
    competitors,
    trends,
    performance,
    slips,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    prompt,
    brain,
    name: s(brain?.business?.name) || s(brain?.brand?.name) || "the business",
    audience: s(brain?.audience?.ideal_customer),
    channels: savedChannels(brain),
  };
}

import { fileAssets } from "./packages.server";
import { resolveImageBrief } from "./image-grounding";
import { createServerFn } from "@tanstack/react-start";
import type { BrainData } from "./brain-schema";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ASSET_KEYS, type CampaignRecord } from "./campaigns.functions";
import { DEFAULT_CONTENT, slugify, type LandingContent } from "./landing.functions";
import { currentPhase, phaseDef } from "./phases";
import { ctaBlock, voiceBlock, SIGN_OFF_RULE } from "./brand-voice";
import { loadBrandContext } from "./brand-context.server";
import {
  runCompliant,
  validateImagePrompt,
  checkCampaignConsistency,
  complianceMeta,
  complyEachPost,
  PLATFORM_RULES,
  buildProvenance,
  type ComplianceReport,
  type ContentKind,
} from "./brand-compliance.server";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";

const CAMPAIGN_COLUMNS =
  "id, campaign_title, campaign_theme, campaign_duration, has_social_posts, has_landing_page, has_lead_magnet, has_email_sequence, has_image_pack, has_blog, status, created_at, asset_status, current_phase, phase_override, phase_started_at, checkout_url, cart_closes_at, landing_page_headline, landing_page_subheadline, plan_week_start, plan_week_end, agent_brief";


type Ctx = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

const BANNED = [
  "crucial", "tapestry", "dive deep", "more than just", "look no further",
  "elevate", "testament", "game-changer", "game changer", "foster", "unlock",
  "supercharge", "magic", "effortless", "seamless", "revolutionise",
  "revolutionize", "transform your", "level up", "buckle up", "in today's",
  "the secret to", "say goodbye to", "tired of", "imagine a world",
];

const SYSTEM =
  "You are a British marketing strategist and direct-response copywriter. " +
  "Write in UK English (organisation, colour, whilst). Understated, direct, peer-over-coffee voice — " +
  "the way a competent person explains their work to a colleague. " +
  "No American hype, no press-release cadence, no exclamation marks, no rhetorical questions as openers. " +
  `Never use these words or phrases: ${BANNED.join(", ")}. ` +
  "Never use antithesis phrasing (\"not X, it's Y\", \"no more X, just Y\"), and never stack negative-list " +
  "clauses such as \"no re-briefing, no bland rewrites\". " +
  "Say plainly what the thing does and who it is for. Every claim must come from the brief — invent nothing. " +
  "Return JSON only.";

function stripFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

async function callJson(prompt: string): Promise<{ raw: string; parsed: Record<string, unknown> }> {
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
    return { raw, parsed: JSON.parse(stripFence(raw)) as Record<string, unknown> };
  } catch {
    throw new Error("Could not read what the AI returned. Try again.");
  }
}

type ComplyArgs = {
  brand: { brain: Record<string, unknown>; context: string; projectId: string | null };
  kind: ContentKind;
  generator: string;
  campaign?: CampaignRecord;
  aiReview?: boolean;
};

/**
 * Generate → Brand Compliance Engine → one targeted retry → check again.
 * A second failing draft is returned with status "needs_review" so callers
 * keep it as a draft and record the violations; it is never marked compliant.
 */
async function askJson(
  prompt: string,
  comply: ComplyArgs,
): Promise<{ json: Record<string, unknown>; report: ComplianceReport }> {
  const c = comply.campaign;
  const taskContext = c
    ? `Campaign: ${c.campaign_title}\nTheme: ${c.campaign_theme}\n${c.agent_brief?.goal ? `Goal: ${c.agent_brief.goal}` : ""}`
    : "";
  const { value, report } = await runCompliant({
    generate: async (feedback) => (await callJson(feedback ? `${prompt}\n\n${feedback}` : prompt)).parsed,
    brain: comply.brand.brain,
    options: { kind: comply.kind, verifiedContext: `${taskContext}\n${prompt.slice(-4000)}` },
    groundingPrompt: comply.brand.context,
    aiReview: comply.aiReview,
    taskContext,
    log: { projectId: comply.brand.projectId, generator: comply.generator, campaignId: c?.id ?? null },
  });
  if (c) {
    const drift = checkCampaignConsistency(
      { [comply.kind]: JSON.stringify(value) },
      { title: c.campaign_title, theme: c.campaign_theme, goal: c.agent_brief?.goal, offer: String(comply.brand.brain?.["ctas"] && (comply.brand.brain["ctas"] as Record<string, string>).current_offer || "") },
      comply.brand.brain,
    );
    for (const d of drift.drifted) report.warnings.push(...d.reasons.map((r) => `Campaign drift: ${r}`));
  }
  return { json: value, report };
}

function compMeta(report: ComplianceReport, brand: ComplyArgs["brand"], campaignId: string) {
  return complianceMeta(report, buildProvenance(brand.brain, { campaignId, competitor: /COMPETIT/i.test(brand.context), trend: /TREND/i.test(brand.context) }));
}


type PlanShape = {
  goal?: string;
  pillars?: Array<{ name?: string; description?: string }>;
  weeks?: Array<{ week?: number; theme?: string; focus?: string; pillar?: string }>;
};

/** The workspace's 90-day plan, narrowed to the weeks this campaign covers. */
async function loadPlanContext(
  ctx: Ctx,
  projectId: string | null,
  c: CampaignRecord,
): Promise<{ text: string; pillars: string[] }> {
  let q = ctx.supabase.from("strategy_plans").select("plan").eq("user_id", ctx.userId);
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { data: row } = await q.maybeSingle();
  const plan = (row?.plan ?? null) as PlanShape | null;
  if (!plan) return { text: "", pillars: [] };

  const pillars = (plan.pillars ?? [])
    .map((p) => (typeof p?.name === "string" ? p.name.trim() : ""))
    .filter(Boolean);
  const from = c.plan_week_start ?? null;
  const to = c.plan_week_end ?? null;
  const weeks = (plan.weeks ?? []).filter((w) => {
    const n = Number(w?.week ?? 0);
    if (!n) return false;
    if (from == null && to == null) return true;
    return n >= (from ?? n) && n <= (to ?? n);
  });

  const lines = [
    plan.goal ? `90-day goal: ${plan.goal}` : "",
    pillars.length
      ? `Content pillars (use these exact names for the "pillar" field):\n${(plan.pillars ?? [])
          .filter((p) => p?.name)
          .map((p) => `- ${p!.name}${p?.description ? ` — ${p.description}` : ""}`)
          .join("\n")}`
      : "",
    weeks.length
      ? `Weekly themes this campaign covers:\n${weeks
          .map((w) => `- Week ${w.week}: ${w.theme ?? ""}${w.focus ? ` — ${w.focus}` : ""}`)
          .join("\n")}`
      : "",
  ].filter(Boolean);
  if (!lines.length) return { text: "", pillars };
  return { text: `90-DAY PLAN (this campaign is a chapter of it):\n${lines.join("\n")}`, pillars };
}

/** The selected workspace's Brand DNA, flattened into prompt-ready strings. */
async function loadBrand(ctx: Ctx, projectId: string | null) {
  const [brainRes, brandRes, ground] = await Promise.all([
    projectId
      ? ctx.supabase.from("business_brains").select("data").eq("project_id", projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase
      .from("brand_brain")
      .select("brand_name, target_audience, brand_voice, primary_color, secondary_color, logo_url")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    loadBrandContext(ctx, projectId).catch(() => ({ prompt: "" })),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brain = ((brainRes?.data as any)?.data ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brand = (brandRes?.data ?? null) as Record<string, any> | null;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const hex = (v: unknown) => {
    const t = s(v);
    return /^#[0-9a-fA-F]{6}$/.test(t) ? t : "";
  };
  return {
    /** Everything Haaylo knows: facts, proof, voice, competitors, trends, what worked. */
    context: ground.prompt,
    brain: brain as Record<string, unknown>,
    projectId,
    name: s(brain?.business?.name) || s(brain?.brand?.name) || s(brand?.brand_name) || "the business",
    audience: s(brain?.audience?.ideal_customer) || s(brand?.target_audience),
    pains: s(brain?.audience?.pain_points),
    offer: s(brain?.ctas?.current_offer) || s(brain?.business?.products_services),
    voice: s(brain?.brand?.tone_of_voice) || s(brand?.brand_voice),
    website: s(brain?.business?.website),
    phrases: s(brain?.founder?.signature_phrases),
    samples: s(brain?.founder?.sample_posts).slice(0, 3000),
    ctaPrimary: s(brain?.ctas?.primary),
    ctaSecondary: s(brain?.ctas?.secondary),
    ctaAlternative: s(brain?.ctas?.alternative),
    ctaOffer: s(brain?.ctas?.offer),
    bridgeLine: s(brain?.ctas?.bridge_line),
    commentCta: s(brain?.ctas?.comment_cta),
    primary: hex(brain?.brand?.primary_color) || hex(brand?.primary_color) || DEFAULT_CONTENT.brandColour,
    secondary:
      hex(brain?.brand?.secondary_color) || hex(brand?.secondary_color) || DEFAULT_CONTENT.secondaryColour,
    logoUrl: s(brand?.logo_url) || null,
  };
}

// The owner's real calls to action and example posts live in @/lib/brand-voice
// so every post writer in the app shares one source of truth.


type Brand = Awaited<ReturnType<typeof loadBrand>>;

function phaseLine(c: CampaignRecord, phase?: number): string {
  if (c.campaign_duration !== "30-day") return "";
  const def = phaseDef(phase ?? currentPhase(c as never));
  return `Launch phase: Phase ${def.n} — ${def.label} (${def.days}).
Tone and focus for this phase: ${def.tone}`;
}

/**
 * The approved Briefing Room recommendation, rendered for the prompt. Empty for
 * campaigns created through the manual wizard.
 */
function briefContext(c: CampaignRecord): string {
  const b = c.agent_brief;
  if (!b) return "";
  const lines = [
    b.brief ? `What the owner asked for: ${b.brief}` : "",
    b.goal ? `Campaign goal: ${b.goal}` : "",
    b.audience ? `Who this is for: ${b.audience}` : "",
    b.channels?.length ? `Channels: ${b.channels.join(", ")}` : "",
    b.assetSummary?.length ? `Agreed deliverables: ${b.assetSummary.join("; ")}` : "",
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return `${lines.join("\n")}
Everything you write must serve that goal and speak to that audience.`;
}

function brief(c: CampaignRecord, brand: Brand, phase?: number): string {
  return `${brand.context}

Campaign: ${c.campaign_title}
Campaign theme: ${c.campaign_theme}
Campaign type: ${c.campaign_duration === "30-day" ? "30-day launch, urgency and conversion led" : "90-day content system, steady authority building"}
${briefContext(c)}
${phaseLine(c, phase)}
${brand.context ? "" : `Business: ${brand.name}\n${brand.audience ? `Audience: ${brand.audience}\n` : ""}${brand.offer ? `Offer: ${brand.offer}\n` : ""}${voiceBlock(brand)}\n${ctaBlock(brand)}`}
Everything you write must use the specific facts, proof and audience detail above. Anything that could have been written for any business in this industry is wrong: rewrite it with a real detail from this business.
${SIGN_OFF_RULE}`;
}



async function uniqueSlug(ctx: Ctx, base: string): Promise<string> {
  const root = slugify(base) || "page";
  for (let i = 0; i < 30; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const { data } = await ctx.supabase.from("landing_pages").select("id").eq("slug", candidate).limit(1);
    if (!data || data.length === 0) return candidate;
  }
  return `${root}-${Math.random().toString(36).slice(2, 7)}`;
}

const str = (v: unknown, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/* ------------------------------ generators ------------------------------ */

async function genSocialPosts(
  ctx: Ctx,
  c: CampaignRecord,
  projectId: string | null,
  brand: Brand,
  phaseOverride?: number,
  plannedPlatforms?: string[],
) {
  const is30 = c.campaign_duration === "30-day";
  const phase = is30 ? (phaseOverride ?? currentPhase(c as never)) : null;
  const count = phaseOverride ? 6 : is30 ? 12 : 18;
  const planCtx = await loadPlanContext(ctx, projectId, c);
  const planned = plannedPlatforms?.length ? Array.from({ length: count }, (_, i) => plannedPlatforms[i % plannedPlatforms.length]!) : undefined;
  const channels = planned ? [...new Set(planned)] : ["linkedin", "instagram", "facebook"];
  const prompt = `${brief(c, brand, phase ?? undefined)}
${planCtx.text}

Write ${count} social posts for this campaign.
Return JSON: { "posts": [ { "title": "", "caption": "", "pillar": "", "platform": "${channels[0]}", "hashtags": [""] } ] }
Rules: each one usable as-is, every post a different angle.
${
    planCtx.pillars.length
      ? `Every post's "pillar" must be one of these exactly: ${planCtx.pillars.join(", ")}. Spread the posts across them, and take topics and angles from the weekly themes above.`
      : `Vary the pillar across educational, story, proof, offer.`
  }
${phase ? `Every post must sit in the launch phase described above and carry that tone.` : ""}
Every caption must end with a clear call to action taken from the list above, using the owner's own wording. Where the sample posts close with contact details (phone number, website), close the same way and repeat those details exactly as written. Never invent a phone number, email, link or offer.
${planned ? `Write the posts in this order, each for the channel given:\n${planned.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "Platform is one of linkedin, instagram, facebook."}
Channel rules:
${channels.map((p) => `- ${PLATFORM_RULES[p] ?? p}`).join("\n")}
No emoji spam.`;
  const taskContext = `Campaign: ${c.campaign_title}\nTheme: ${c.campaign_theme}\n${c.agent_brief?.goal ? `Goal: ${c.agent_brief.goal}` : ""}`;
  const generated = arr((await callJson(prompt)).parsed["posts"]).slice(0, count);
  if (generated.length === 0) throw new Error("No posts came back. Try again.");

  // Each post is checked on its own, so one weak post never flags the rest.
  const checked = await complyEachPost({
    posts: generated,
    brain: brand.brain,
    verifiedContext: `${taskContext}\n${prompt.slice(-4000)}`,
    groundingPrompt: brand.context,
    taskContext,
    aiReview: true,
    plannedPlatforms: planned,
    rewrite: async (post, feedback) => {
      const r = (await callJson(`${prompt}\n\nRewrite only this one post:\n${JSON.stringify(post)}\n\n${feedback}\nReturn JSON: { "post": { "title": "", "caption": "", "pillar": "", "platform": "", "hashtags": [""] } }`)).parsed;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (r["post"] ?? r) as any;
      return p && typeof p.caption === "string" ? p : null;
    },
    log: { projectId: brand.projectId, generator: "campaign.social_posts", campaignId: c.id },
  });

  const rows = checked.map(({ post: p, report, platformFixed }, i) => ({
    user_id: ctx.userId,
    project_id: projectId,
    caption: str(p?.caption).slice(0, 20000),
    title: str(p?.title).slice(0, 300) || null,
    platform: str(planned?.[i] ?? p?.platform, "linkedin").toLowerCase().slice(0, 40),
    pillar: str(p?.pillar).slice(0, 120) || null,
    status: "draft",
    hashtags: arr(p?.hashtags).map((h) => String(h).slice(0, 80)).slice(0, 10),
    campaign_id: c.id,
    meta: {
      campaign_id: c.id,
      campaign_title: c.campaign_title,
      ...(phase ? { phase } : {}),
      ...compMeta(report, brand, c.id),
      ...(platformFixed ? { platform_corrected: true } : {}),
    },
  }));
  const { error } = await ctx.supabase.from("content_posts").insert(rows);
  if (error) throw new Error(error.message);
  return { created: rows.length };
}


async function genLandingPage(ctx: Ctx, c: CampaignRecord, projectId: string | null, brand: Brand) {
  const { json, report } = await askJson(`${brief(c, brand)}

Write the copy for a high-converting landing page that captures email addresses in exchange for a free guide.
Return JSON: { "headline": "", "subheadline": "", "body_html": "", "form_heading": "", "button_label": "", "thank_you": "", "seo_description": "" }
Rules: headline under 90 characters. body_html is simple HTML using only <h3>, <p> and <ul><li> — three short benefit blocks. seo_description under 150 characters. The headline, offer and benefits must match the campaign proposition and the business facts exactly.`,
    { brand, kind: "landing_page", generator: "campaign.landing_page", campaign: c, aiReview: true },
  );
  void report;

  const headline = str(json["headline"], c.campaign_title).slice(0, 160);
  const subheadline = str(json["subheadline"], c.campaign_theme).slice(0, 300);
  const bodyHtml = str(json["body_html"]).slice(0, 20000);

  const content: LandingContent = {
    ...DEFAULT_CONTENT,
    headline,
    subheadline,
    bodyEnabled: bodyHtml.length > 0,
    bodyHtml,
    formHeading: str(json["form_heading"], DEFAULT_CONTENT.formHeading).slice(0, 160),
    buttonLabel: str(json["button_label"], DEFAULT_CONTENT.buttonLabel).slice(0, 60),
    thankYou: str(json["thank_you"], DEFAULT_CONTENT.thankYou).slice(0, 300),
    brandColour: brand.primary,
    secondaryColour: brand.secondary,
    logoUrl: brand.logoUrl,
    seoTitle: c.campaign_title.slice(0, 70),
    seoDescription: str(json["seo_description"]).slice(0, 155),
  };

  const slug = await uniqueSlug(ctx, c.campaign_title);
  const { data: page, error } = await ctx.supabase
    .from("landing_pages")
    .insert({
      user_id: ctx.userId,
      project_id: projectId,
      campaign_id: c.id,
      title: c.campaign_title.slice(0, 160),
      slug,
      status: "draft",
      content,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await ctx.supabase
    .from("campaigns")
    .update({ landing_page_headline: headline, landing_page_subheadline: subheadline })
    .eq("id", c.id)
    .eq("user_id", ctx.userId);

  return { pageId: page.id as string, slug };
}

async function genLeadMagnet(ctx: Ctx, c: CampaignRecord, brand: Brand) {
  const { json } = await askJson(`${brief(c, brand)}

Write the lead magnet guide that this campaign gives away.
Return JSON: { "guide_title": "", "guide_intro": "", "sections": [ { "heading": "", "body": "" } ] }
Rules: exactly 5 sections. Each body 120-200 words, plain text, paragraphs separated by a blank line. Practical and specific — no generic advice. Do not introduce any statistic, price, client result or testimonial that is not in the brand profile.`,
    { brand, kind: "lead_magnet", generator: "campaign.lead_magnet", campaign: c, aiReview: true },
  );

  const sections = arr(json["sections"])
    .slice(0, 8)
    .map((s) => ({ heading: str(s?.heading), body: str(s?.body) }))
    .filter((s) => s.heading || s.body);
  if (sections.length === 0) throw new Error("The guide came back empty. Try again.");

  const { error } = await ctx.supabase
    .from("campaigns")
    .update({
      guide_title: str(json["guide_title"], c.campaign_title).slice(0, 300),
      guide_intro: str(json["guide_intro"]).slice(0, 4000),
      guide_sections: sections,
    })
    .eq("id", c.id)
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return { sections: sections.length };
}

const PHASE_EMAIL_SPEC: Record<number, string> = {
  1: "exactly 2 emails: a waitlist confirmation that sets expectations, then an anticipation email that builds the problem.",
  2: "exactly 3 emails: an educational series that teaches the method and says doors open soon. No hard sell yet.",
  3: "exactly 3 emails: sales emails. One leads on results and proof, one handles the biggest objection, one is a straight invitation to buy.",
  4: "exactly 3 emails: closing emails at 24 hours left, 2 hours left and last chance. Short, urgent, honest — no invented deadlines beyond the close.",
};

async function genEmails(
  ctx: Ctx,
  c: CampaignRecord,
  projectId: string | null,
  brand: Brand,
  phaseOverride?: number,
) {
  const is30 = c.campaign_duration === "30-day";
  const phase = is30 ? (phaseOverride ?? currentPhase(c as never)) : null;
  const spec = phase
    ? PHASE_EMAIL_SPEC[phase]
    : "exactly 4 emails. Email 1 delivers the guide, email 4 makes the offer.";

  const { json, report } = await askJson(`${brief(c, brand, phase ?? undefined)}

Write the email sequence for ${phase ? "this launch phase" : "someone who has just downloaded the campaign's free guide"}.
Return JSON: { "emails": [ { "subject": "", "body": "" } ] }
Rules: ${spec} Subjects under 60 characters, no clickbait. Bodies 120-220 words, plain text, sign off simply.`,
    { brand, kind: "email_body", generator: "campaign.email_sequence", campaign: c, aiReview: true },
  );

  const emails = arr(json["emails"]).slice(0, 5);
  if (emails.length === 0) throw new Error("No emails came back. Try again.");

  if (phase) {
    // 30-day launches keep their sequence in its own store, one set per phase.
    await ctx.supabase.from("email_sequences").delete().eq("user_id", ctx.userId).eq("campaign_id", c.id).eq("phase", phase);
    const rows = emails.map((e, i) => ({
      user_id: ctx.userId,
      campaign_id: c.id,
      phase,
      email_subject: str(e?.subject, "Email").slice(0, 300),
      email_body: str(e?.body).slice(0, 20000),
      send_order: i + 1,
      status: "draft",
    }));
    const { data: inserted, error } = await ctx.supabase.from("email_sequences").insert(rows).select("id");
    if (error) throw new Error(error.message);
    await fileAssets(ctx, { projectId, assetType: "email", ids: ((inserted ?? []) as { id: string }[]).map((r) => r.id), section: `Emails, phase ${phase}`, fallbackType: "email_sequence", title: `${c.campaign_title} emails`, campaignId: c.id });
    return { created: rows.length };
  }

  const rows = emails.map((e, i) => ({
    user_id: ctx.userId,
    project_id: projectId,
    kind: "email",
    title: `${i + 1}. ${str(e?.subject, "Email").slice(0, 160)}`,
    body: str(e?.body).slice(0, 20000),
    tags: ["campaign", "nurture"],
    collection: c.campaign_title.slice(0, 80),
    meta: { campaign_id: c.id, order: i + 1, subject: str(e?.subject), ...compMeta(report, brand, c.id) },
  }));
  const { data: inserted, error } = await ctx.supabase.from("content_bank_items").insert(rows).select("id");
  if (error) throw new Error(error.message);
  await fileAssets(ctx, { projectId, assetType: "email", ids: ((inserted ?? []) as { id: string }[]).map((r) => r.id), section: "Emails", fallbackType: "email_sequence", title: `${c.campaign_title} emails`, campaignId: c.id });
  return { created: rows.length };
}


async function genImagePack(ctx: Ctx, c: CampaignRecord, projectId: string | null, brand: Brand) {
  const resolved = resolveImageBrief((brand.brain ?? {}) as BrainData, {
    topic: `${c.campaign_title} ${c.campaign_theme}`,
    objective: `${c.campaign_title}: ${c.campaign_theme}`.slice(0, 240),
  });
  const { json, report } = await askJson(`${brief(c, brand)}

Write 3 photography briefs for promotional images for this campaign.
${resolved.block}
Every brief must show the resolved product/service in the resolved setting, for the resolved audience.
Return JSON: { "images": [ { "label": "", "prompt": "" } ] }
Rules: each prompt 40-70 words covering subject, real setting, camera angle, natural lighting and mood.
Every brief must show a real product or service of this business in the place a customer would actually see it.
Photorealistic photography only — no abstract art, no symbolic stand-ins, no office desks or laptops unless the business sells them.
Colour must be natural daylight and true to life: never tint, wash or light the scene in a brand colour.
State that the image contains no text, letters, numbers or logos.`,
    { brand, kind: "image_prompt", generator: "campaign.image_pack", campaign: c },
  );

  const briefs = arr(json["images"]).slice(0, 3);
  if (briefs.length === 0) throw new Error("No image briefs came back. Try again.");

  // Briefs are saved first as "queued"; each picture is then rendered in its own
  // short request (renderBankImage) so one slow or failed image can't sink the pack.
  const made = briefs.map((b) => {
    const check = validateImagePrompt(str(b?.prompt), brand.brain, `${c.campaign_title} ${c.campaign_theme}`);
    if (!check.valid) console.info("[brand-compliance] image prompt flagged", JSON.stringify(check.violations));
    const prompt = `${check.cleaned}
${resolved.product ? `Must show: ${resolved.product}. ` : ""}Setting: ${resolved.setting}
Photorealistic editorial photography on a full-frame camera: authentic materials and textures, accurate perspective, straight architectural lines, soft natural daylight, believable depth of field.
Avoid AI-render plastic surfaces, waxy or distorted faces and hands, over-saturated or neon lighting, HDR glow, and posed stock-photo cliches.
Square 1:1 composition. No text, no words, no logos anywhere in the image.`;
    return { label: str(b?.label, "Campaign image"), prompt, promptCheck: check };
  });

  const rows = made.map((m) => ({
    user_id: ctx.userId,
    project_id: projectId,
    kind: "image_prompt",
    title: m.label.slice(0, 160),
    body: m.prompt.slice(0, 20000),
    tags: ["campaign", "image"],
    collection: c.campaign_title.slice(0, 80),
    meta: {
      campaign_id: c.id,
      url: null,
      prompt: m.prompt,
      image_status: "queued",
      ...compMeta(report, brand, c.id),
      image_grounding: { product: resolved.product, objective: resolved.objective, setting: resolved.setting, colours: resolved.colours },
      image_prompt_check: { valid: m.promptCheck.valid, violations: m.promptCheck.violations, warnings: m.promptCheck.warnings },
      // Images can't be verified automatically: the owner signs them off.
      visual_approval: "required",
    },
  }));
  const { data: inserted, error } = await ctx.supabase.from("content_bank_items").insert(rows).select("id");
  if (error) throw new Error(error.message);
  await fileAssets(ctx, { projectId, assetType: "image", ids: ((inserted ?? []) as { id: string }[]).map((r) => r.id), section: "Images", fallbackType: "image_pack", title: `${c.campaign_title} images`, campaignId: c.id });
  return { created: rows.length, withImages: 0 };
}

/** One long-form article for the campaign, saved to the Content Bank. */
async function genBlog(ctx: Ctx, c: CampaignRecord, projectId: string | null, brand: Brand) {
  const { json, report } = await askJson(`${brief(c, brand)}

Write one blog article for this campaign.
Return JSON: { "title": "", "body": "", "read_minutes": 5 }
Rules: title under 70 characters, no colons-and-subtitle formula. Body 700-900 words of plain text with
short paragraphs and two or three sub-headings written on their own line. Open with the reader's situation,
not a question. Close with a single clear next step that matches the campaign.
Never present an outside statistic or research finding as this business's own figure.`,
    { brand, kind: "blog", generator: "campaign.blog", campaign: c, aiReview: true },
  );

  const title = str(json["title"], c.campaign_title).slice(0, 160);
  const body = str(json["body"]);
  if (!body) throw new Error("The article didn't come back. Try again.");
  const words = body.split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.round(Number(json["read_minutes"]) || words / 200));

  const { error } = await ctx.supabase.from("content_bank_items").insert({
    user_id: ctx.userId,
    project_id: projectId,
    kind: "blog",
    title,
    body: body.slice(0, 20000),
    tags: ["campaign", "blog"],
    collection: c.campaign_title.slice(0, 80),
    meta: { campaign_id: c.id, read_minutes: readMinutes, ...compMeta(report, brand, c.id) },
  });
  if (error) throw new Error(error.message);
  return { created: 1 };
}

/* ------------------------------ entry point ----------------------------- */

/**
 * Generates one campaign asset and writes it into the database, then marks
 * that asset ready on the campaign. One asset per call keeps each request
 * short enough for the serverless runtime.
 */
/** Core single-asset writer, shared by the server function and the Marketing Orchestrator. */
export async function runCampaignAsset(ctx: Ctx, data: { campaignId: string; key: (typeof ASSET_KEYS)[number]; plannedPlatforms?: string[] }) {

    const { data: row, error } = await ctx.supabase
      .from("campaigns")
      .select(`${CAMPAIGN_COLUMNS}, project_id, guide_sections`)
      .eq("user_id", ctx.userId)
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That campaign isn't here any more.");

    const campaign = row as CampaignRecord & { project_id: string | null };
    const projectId = campaign.project_id ?? null;
    const brand = await loadBrand(ctx, projectId);

    switch (data.key) {
      case "social_posts":
        await genSocialPosts(ctx, campaign, projectId, brand, undefined, data.plannedPlatforms);
        break;
      case "landing_page":
        await genLandingPage(ctx, campaign, projectId, brand);
        break;
      case "lead_magnet":
        await genLeadMagnet(ctx, campaign, brand);
        break;
      case "email_sequence":
        await genEmails(ctx, campaign, projectId, brand);
        break;
      case "image_pack":
        await genImagePack(ctx, campaign, projectId, brand);
        break;
      case "blog":
        await genBlog(ctx, campaign, projectId, brand);
        break;
    }

    const next = {
      ...((campaign.asset_status ?? {}) as Record<string, string>),
      [data.key]: "ready",
    };
    const { data: updated, error: upErr } = await ctx.supabase
      .from("campaigns")
      .update({ asset_status: next })
      .eq("user_id", ctx.userId)
      .eq("id", data.campaignId)
      .select(CAMPAIGN_COLUMNS)
      .single();
    if (upErr) throw new Error(upErr.message);
    return updated as CampaignRecord;
  }

export const generateCampaignAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campaignId: z.string().uuid(), key: z.enum(ASSET_KEYS) }).parse(input),
  )
  .handler(async ({ data, context }) => runCampaignAsset(context as unknown as Ctx, data));

/**
 * Writes a 30-day campaign's posts and emails for one launch phase, on demand.
 * Existing content is left alone; the phase's email set is replaced.
 */
export const generatePhaseAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        phase: z.number().int().min(1).max(4),
        what: z.enum(["posts", "emails", "both"]).default("both"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;

    const { data: row, error } = await ctx.supabase
      .from("campaigns")
      .select(`${CAMPAIGN_COLUMNS}, project_id`)
      .eq("user_id", ctx.userId)
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That campaign isn't here any more.");

    const campaign = row as CampaignRecord & { project_id: string | null };
    if (campaign.campaign_duration !== "30-day") {
      throw new Error("Launch phases only apply to 30-day campaigns.");
    }

    const projectId = campaign.project_id ?? null;
    const brand = await loadBrand(ctx, projectId);

    const wantPosts = data.what !== "emails" && campaign.has_social_posts === true;
    const wantEmails = data.what !== "posts" && campaign.has_email_sequence === true;

    let posts = 0;
    let emails = 0;
    if (wantPosts) posts = (await genSocialPosts(ctx, campaign, projectId, brand, data.phase)).created;
    if (wantEmails) emails = (await genEmails(ctx, campaign, projectId, brand, data.phase)).created;

    return { posts, emails };
  });

/**
 * Universal Brand Compliance Engine.
 *
 * Runs after the model and before anything is saved or shown. The workspace's
 * Business Brain is the only source of truth for facts: any URL, phone number,
 * email, price, percentage, statistic or quoted testimonial in generated copy
 * must appear in the Brain (or in explicitly supplied task context) or it is
 * removed / flagged.
 *
 * Layers:
 *  1. Deterministic checks + safe repairs (validateAndCleanContent)
 *  2. Optional AI quality review (aiQualityReview)
 *  3. One targeted retry, then a hard fail state (runCompliant)
 *  4. Image prompt checks (validateImagePrompt)
 *  5. Campaign-wide consistency (checkCampaignConsistency)
 *  6. Internal logging + provenance (logCompliance, buildProvenance)
 */

import { enforceUkEnglish } from "./first-post-ideas.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Brain = Record<string, any>;

export type ContentKind =
  | "social_post"
  | "email_body"
  | "email_subject"
  | "landing_page"
  | "lead_magnet"
  | "blog"
  | "funnel"
  | "strategy"
  | "idea"
  | "repurpose"
  | "caption_variant"
  | "agent_post"
  | "brief"
  | "image_prompt";

export type ComplianceOptions = {
  kind: ContentKind;
  /** Extra verified text the task legitimately supplies (campaign brief, source post). */
  verifiedContext?: string;
  /** Platform for length limits. */
  platform?: string;
  /** Require a saved CTA to appear. Defaults by kind. */
  requireCta?: boolean;
  /** Max characters for the field. */
  maxLength?: number;
};

export type ComplianceResult = {
  valid: boolean;
  cleaned: string;
  violations: string[];
  warnings: string[];
  repaired: string[];
};

/* ----------------------------- global rules ----------------------------- */

/** Filler with a safe replacement ("" = delete the word). */
const FILLER_REPAIRS: Array<[RegExp, string]> = [
  [/\bcrucial\b/gi, "important"],
  [/\bcrucially\b/gi, "importantly"],
  [/\btapestry\b/gi, "mix"],
  [/\bdive deep(?: into)?\b/gi, "look closely at"],
  [/\bdeep dive\b/gi, "close look"],
  [/\blook no further\b[.,!]?\s*/gi, ""],
  [/\belevate\b/gi, "improve"],
  [/\belevates\b/gi, "improves"],
  [/\belevated\b/gi, "improved"],
  [/\bis a testament to\b/gi, "shows"],
  [/\btestament\b/gi, "proof"],
  [/\bgame[- ]changer\b/gi, "big help"],
  [/\bgame[- ]changing\b/gi, "useful"],
  [/\bfoster\b/gi, "build"],
  [/\bfosters\b/gi, "builds"],
  [/\bfostering\b/gi, "building"],
  [/\bunlock\b/gi, "get"],
  [/\bunlocks\b/gi, "gets"],
  [/\bunlocking\b/gi, "getting"],
  [/\bsupercharge\b/gi, "speed up"],
  [/\bsupercharged\b/gi, "faster"],
  [/\bseamless(?:ly)?\b/gi, "smooth"],
  [/\beffortless(?:ly)?\b/gi, "easy"],
  [/\brevolutioni[sz]e\b/gi, "change"],
  [/\bdelve(?:s)? into\b/gi, "look at"],
  [/\bdelve\b/gi, "look"],
  [/\bin today'?s (?:fast-paced |digital |ever-changing )?(?:world|landscape)\b,?\s*/gi, ""],
  [/\bbuckle up\b[.,!]?\s*/gi, ""],
];

/** Generic AI constructions that need a rewrite, not a word swap. */
const SLOP_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:it'?s|this is|that'?s) not (?:just )?[^.?!\n]{1,60}[,;—-]\s*(?:it'?s|this is|that'?s)\b/i, "antithesis phrasing (\"not X, it's Y\")"],
  [/\b(?:isn'?t|is not) just\b/i, "\"isn't just\" construction"],
  [/\bmore than just\b/i, "\"more than just\" construction"],
  [/\bno [a-z-]+,\s*no [a-z-]+/i, "stacked negative list (\"no X, no Y\")"],
  [/\bimagine a world\b/i, "\"imagine a world\" opener"],
  [/\bsay goodbye to\b/i, "\"say goodbye to\" cliché"],
  [/\bthe secret to\b/i, "\"the secret to\" cliché"],
  [/\bin conclusion\b/i, "essay-style \"in conclusion\""],
];

const PLATFORM_LIMITS: Record<string, number> = {
  x: 280,
  twitter: 280,
  threads: 500,
  linkedin: 3000,
  instagram: 2200,
  facebook: 5000,
  tiktok: 2200,
};

const CTA_KINDS: ContentKind[] = ["landing_page"];

/* ---------------------------- source corpus ----------------------------- */

function flatten(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => flatten(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => flatten(x, out));
  return out;
}

export function verifiedCorpus(brain: Brain, extra = ""): string {
  return `${flatten(brain).join("\n")}\n${extra}`.toLowerCase();
}

const digits = (s: string) => s.replace(/\D/g, "");
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function customBanned(brain: Brain): string[] {
  return s(brain?.founder?.banned_words)
    .split(/[,\n;]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 1);
}

function savedCtas(brain: Brain): string[] {
  const c = brain?.ctas ?? {};
  return ["primary", "secondary", "alternative", "offer", "comment_cta", "bridge_line"]
    .map((k) => s(c[k]))
    .filter(Boolean);
}

function escapeRe(t: string) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* --------------------------- deterministic core -------------------------- */

const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co\.uk|uk|org|net|io|app|co|ai|shop|store)(?:\/[^\s)]*)?/gi;
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const PHONE_RE = /(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b/g;
const PRICE_RE = /[£$€]\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:k|m))?/gi;
const PERCENT_RE = /\b\d{1,3}(?:\.\d+)?\s?(?:%|per ?cent)/gi;
const STAT_RE = /\b(\d[\d,]*)\+?\s+(?:happy\s+)?(customers|clients|homes|businesses|users|members|reviews|projects|installations|years|families|orders|followers)\b/gi;
const QUOTE_RE = /["“]([^"”\n]{25,400})["”]\s*(?:[-—–]\s*([A-Z][a-zA-Z.' ]{1,40}))?/g;

function domainOf(u: string): string {
  return u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

/**
 * Deterministic check + safe repair for one piece of text.
 * Unsafe issues (prices, stats, testimonials, slop constructions) are violations
 * that the caller must resolve with a rewrite.
 */
export function validateAndCleanContent(
  text: string,
  brain: Brain,
  options: ComplianceOptions,
): ComplianceResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const repaired: string[] = [];
  if (!text || typeof text !== "string") return { valid: true, cleaned: text ?? "", violations, warnings, repaired };

  const corpus = verifiedCorpus(brain, options.verifiedContext ?? "");
  const corpusDigits = digits(corpus);
  let out = text;

  // UK English
  const uk = enforceUkEnglish(out);
  if (uk !== out) {
    repaired.push("US spelling changed to UK English");
    out = uk;
  }

  // Global filler
  for (const [re, rep] of FILLER_REPAIRS) {
    if (re.test(out)) {
      repaired.push(`Removed filler "${out.match(re)?.[0]}"`);
      out = out.replace(re, (m) => matchCase(m, rep));
    }
    re.lastIndex = 0;
  }

  // Workspace banned words
  for (const w of customBanned(brain)) {
    const re = new RegExp(`\\b${escapeRe(w)}\\b`, "gi");
    if (re.test(out)) {
      // Deleting a word mid-sentence breaks the meaning, so this needs a rewrite.
      violations.push(`Uses the saved banned word "${w}"`);
    }
  }

  // Slop constructions
  for (const [re, label] of SLOP_PATTERNS) if (re.test(out)) violations.push(`Generic AI construction: ${label}`);

  // Invented contact details: drop the whole sentence/line carrying them, so
  // nothing is left reading "Call us on to book".
  const bad: string[] = [];
  for (const m of out.match(EMAIL_RE) ?? []) if (!corpus.includes(m.toLowerCase())) bad.push(m), repaired.push(`Removed unverified email ${m}`);
  for (const m of out.match(URL_RE) ?? []) {
    if (m.includes("@") || bad.some((b) => b.includes(m))) continue;
    if (!corpus.includes(domainOf(m))) bad.push(m), repaired.push(`Removed unverified link ${m}`);
  }
  for (const m of out.match(PHONE_RE) ?? []) {
    const d = digits(m);
    const alt = d.startsWith("44") ? `0${d.slice(2)}` : d;
    if (!(corpusDigits.includes(d) || corpusDigits.includes(alt))) bad.push(m), repaired.push(`Removed unverified phone number ${m.trim()}`);
  }
  if (bad.length) out = dropUnitsContaining(out, bad);

  // Prices
  for (const m of out.match(PRICE_RE) ?? []) {
    const n = m.replace(/[£$€\s,]/g, "").toLowerCase();
    if (!corpus.replace(/,/g, "").includes(n)) violations.push(`Price ${m.trim()} isn't in the Business Brain`);
  }

  // Percentages
  for (const m of out.match(PERCENT_RE) ?? []) {
    const n = m.match(/\d+(?:\.\d+)?/)?.[0] ?? "";
    if (!new RegExp(`\\b${escapeRe(n)}\\s?(?:%|per ?cent)`).test(corpus))
      violations.push(`Percentage ${m.trim()} isn't backed by saved proof`);
  }

  // Statistics
  for (const m of out.matchAll(STAT_RE)) {
    const n = m[1].replace(/,/g, "");
    if (!corpus.replace(/,/g, "").includes(n)) violations.push(`Statistic "${m[0]}" isn't backed by saved proof`);
  }

  // Product / service / availability claims
  if (options.kind !== "image_prompt") for (const v of checkClaims(out, brain, options.verifiedContext ?? "")) violations.push(v);

  // Testimonials / customer quotes
  if (options.kind !== "strategy" && options.kind !== "image_prompt") {
    for (const m of out.matchAll(QUOTE_RE)) {
      const quote = m[1].toLowerCase().slice(0, 40);
      const attributed = !!m[2];
      if (corpus.includes(quote)) continue;
      if (attributed || /\b(?:customer|client|review|said|told us)\b/i.test(out.slice(Math.max(0, (m.index ?? 0) - 80), m.index)))
        violations.push(`Quoted testimonial "${m[1].slice(0, 50)}…" isn't in saved proof`);
    }
  }

  // Tone markers
  const bangs = (out.match(/!/g) ?? []).length;
  if (bangs >= 3 && !/!/.test(s(brain?.founder?.sample_posts))) warnings.push("Heavy use of exclamation marks not found in sample posts");
  if (/\b(?:color|organization|optimize|favorite)\b/i.test(out)) warnings.push("Possible remaining US spelling");

  // CTA
  const ctas = savedCtas(brain);
  const needCta = options.requireCta ?? CTA_KINDS.includes(options.kind);
  if (needCta && ctas.length) {
    const lower = out.toLowerCase();
    const hit = ctas.some((c) => lower.includes(c.toLowerCase().slice(0, 25)));
    if (!hit) warnings.push("No saved call to action used");
  }
  if (options.kind === "email_subject" && /\b(click|comment|dm me)\b/i.test(out)) warnings.push("Subject line contains a CTA");

  // Formatting
  const before = out;
  out = out.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?])/g, "$1").replace(/\n{3,}/g, "\n\n").replace(/\(\s*\)/g, "").trim();
  if (out !== before.trim()) repaired.push("Tidied spacing after removals");
  if (options.kind === "email_subject" || options.kind === "image_prompt") out = out.replace(/\s*\n\s*/g, " ");

  // Length
  const limit = options.maxLength ?? (options.platform ? PLATFORM_LIMITS[options.platform.toLowerCase()] : undefined) ?? (options.kind === "email_subject" ? 80 : undefined);
  if (limit && out.length > limit) {
    const cut = out.slice(0, limit);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
    out = (end > limit * 0.6 ? cut.slice(0, end + 1) : cut).trim();
    repaired.push(`Trimmed to ${limit} characters`);
  }

  return { valid: violations.length === 0, cleaned: out, violations, warnings, repaired };
}

/** Removes each line (or, in long lines, each sentence) that contains one of the tokens. */
function dropUnitsContaining(text: string, tokens: string[]): string {
  return text
    .split("\n")
    .map((line) => {
      if (!tokens.some((tk) => line.includes(tk))) return line;
      if (line.length < 120) return null;
      return line
        .split(/(?<=[.!?])\s+/)
        .filter((sent) => !tokens.some((tk) => sent.includes(tk)))
        .join(" ");
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}

function matchCase(src: string, rep: string): string {
  if (!rep) return rep;
  return src[0] === src[0]?.toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep;
}

/* ----------------------- structured (JSON) outputs ----------------------- */

const SKIP_KEYS = new Set(["platform", "pillar", "formatId", "url", "slug", "hashtags", "id", "kind", "status"]);

/**
 * Walks every string in a generated JSON object and applies the deterministic
 * checks. Keys named "subject" use subject-line rules; "prompt" uses image rules.
 */
export function validateStructured<T>(
  value: T,
  brain: Brain,
  options: ComplianceOptions,
): { value: T; result: ComplianceResult } {
  const agg: ComplianceResult = { valid: true, cleaned: "", violations: [], warnings: [], repaired: [] };
  const walk = (v: unknown, key: string, platform?: string): unknown => {
    if (typeof v === "string") {
      if (SKIP_KEYS.has(key) || v.length < 3) return v;
      const kind: ContentKind = key === "subject" || key === "email_subject" ? "email_subject" : options.kind;
      const r = validateAndCleanContent(v, brain, { ...options, kind, platform: platform ?? options.platform, requireCta: key === "caption" || key === "body" ? options.requireCta : false });
      const tag = key ? `[${key}] ` : "";
      agg.violations.push(...r.violations.map((x) => tag + x));
      agg.warnings.push(...r.warnings.map((x) => tag + x));
      agg.repaired.push(...r.repaired.map((x) => tag + x));
      return r.cleaned;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key, platform));
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const p = typeof o.platform === "string" ? o.platform : platform;
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x, k, p)]));
    }
    return v;
  };
  const cleaned = walk(value, "") as T;
  agg.violations = [...new Set(agg.violations)];
  agg.warnings = [...new Set(agg.warnings)];
  agg.repaired = [...new Set(agg.repaired)];
  agg.valid = agg.violations.length === 0;
  return { value: cleaned, result: agg };
}

/* --------------------------- AI quality review --------------------------- */

export type QualityReview = { pass: boolean; issues: string[]; soft?: string[]; reviewed: boolean };

/**
 * Subjective checks deterministic code can't make: voice match, audience,
 * pain points, campaign/strategy fit, usefulness, AI feel, repetition, CTA fit.
 * Internal only — never shown as a score.
 */
export async function aiQualityReview(
  content: string,
  groundingPrompt: string,
  opts: { kind: ContentKind; taskContext?: string; recent?: string[] },
): Promise<QualityReview> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key || !content.trim()) return { pass: true, issues: [], reviewed: false };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content:
              "You are a strict brand editor. Judge generated marketing content against the saved brand profile. " +
              "Fail it only for real problems a brand owner would reject. Return JSON only: " +
              '{ "issues": [{ "type": "fact"|"banned"|"style"|"format", "fix": "short, specific, fixable instruction" }] }. ' +
              'type "fact" = an unsupported or wrong factual claim, product, feature, promise, testimonial change or price; "banned" = a saved house-rule word or phrase; "style" = voice, rhythm, openings, wording; "format" = layout, emoji, hashtags, length. Return an empty list when the content is fine.',
          },
          {
            role: "user",
            content: `BRAND PROFILE:\n${groundingPrompt.slice(0, 14000)}\n\n${opts.taskContext ? `TASK / CAMPAIGN CONTEXT:\n${opts.taskContext.slice(0, 3000)}\n\n` : ""}${opts.recent?.length ? `RECENT APPROVED CONTENT (avoid repeating):\n${opts.recent.join("\n---\n").slice(0, 3000)}\n\n` : ""}CONTENT TYPE: ${opts.kind}\n\nCONTENT:\n${content.slice(0, 12000)}\n\nCheck: 1) sounds like the saved founder voice and sample posts' rhythm 2) written for the saved audience 3) reflects real pain points / buying triggers 4) fits the campaign objective / strategy 5) useful and specific, not generic 6) not obviously AI-written 7) not repeating recent content 8) CTA suits this content type (subject lines and educational posts may have none). Also flag any product or service named that the profile doesn't sell.`,
          },
        ],
      }),
    });
    if (!res.ok) return { pass: true, issues: [], reviewed: false };
    const json = await res.json();
    const outText: string =
      json?.output_text ??
      (json?.output ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .flatMap((o: any) => o?.content ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((c: any) => c?.text ?? "")
        .join("");
    const parsed = JSON.parse(String(outText || "{}").replace(/^```(?:json)?|```$/g, ""));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 8) : [];
    const typed = raw.map((i) => (typeof i === "string" ? { type: "fact", fix: i } : { type: String(i?.type ?? "fact"), fix: String(i?.fix ?? "") })).filter((i) => i.fix);
    const blocking = typed.filter((i) => i.type === "fact" || i.type === "banned").map((i) => i.fix);
    const soft = typed.filter((i) => i.type !== "fact" && i.type !== "banned").map((i) => i.fix);
    return { pass: blocking.length === 0, issues: blocking, soft, reviewed: true };
  } catch {
    return { pass: true, issues: [], reviewed: false };
  }
}

/* ----------------------------- retry loop ------------------------------- */

export type ComplianceReport = {
  status: "pass" | "repaired" | "needs_review";
  violations: string[];
  warnings: string[];
  repaired: string[];
  aiReviewed: boolean;
  aiIssues: string[];
  retried: boolean;
};

/**
 * Generate → check → (one targeted rewrite) → check. Never returns a failing
 * second draft as compliant: if it still fails, status is "needs_review" and
 * the caller must keep it as a draft and surface the violations.
 */
export async function runCompliant<T>(args: {
  generate: (feedback?: string) => Promise<T>;
  brain: Brain;
  options: ComplianceOptions;
  groundingPrompt?: string;
  aiReview?: boolean;
  taskContext?: string;
  log?: { projectId: string | null; generator: string; campaignId?: string | null };
}): Promise<{ value: T; report: ComplianceReport }> {
  const check = async (raw: T) => {
    const { value, result } = validateStructured(raw, args.brain, args.options);
    let review: QualityReview = { pass: true, issues: [], reviewed: false };
    if (args.aiReview && args.groundingPrompt && result.valid) {
      review = await aiQualityReview(JSON.stringify(value), args.groundingPrompt, { kind: args.options.kind, taskContext: args.taskContext });
    }
    return { value, result, review, ok: result.valid && review.pass };
  };

  const first = await check(await args.generate());
  let final = first;
  let retried = false;
  // Style/format notes earn one rewrite too (better copy), but never block on their own.
  if (!first.ok || (first.review.soft?.length ?? 0) > 0) {
    retried = true;
    const feedback = [...first.result.violations, ...first.review.issues, ...(first.review.soft ?? [])].map((v) => `- ${v}`).join("\n");
    try {
      const second = await check(
        await args.generate(
          `Your previous draft failed the brand checks:\n${feedback}\nFix exactly these problems. Keep the same meaning, brand voice and JSON shape. Remove any price, percentage, statistic, link, phone number or testimonial that is not in the brand profile above.`,
        ),
      );
      // Keep the better draft: never swap a passing first draft for a failing rewrite.
      final = second.ok || !first.ok ? second : first;
    } catch {
      final = first;
    }
  }

  const report: ComplianceReport = {
    status: final.ok ? (final.result.repaired.length || retried ? "repaired" : "pass") : "needs_review",
    violations: [...final.result.violations, ...(final.review.pass ? [] : final.review.issues)],
    warnings: [...final.result.warnings, ...(final.review.soft ?? []).map((x) => `Style note: ${x}`)],
    repaired: final.result.repaired,
    aiReviewed: final.review.reviewed,
    aiIssues: final.review.issues,
    retried,
  };
  if (args.log) logCompliance({ ...args.log, kind: args.options.kind, report });
  return { value: final.value, report };
}

/* --------------------------- image prompts ------------------------------ */

const COLOUR_WORDS = ["red", "blue", "green", "yellow", "orange", "purple", "pink", "black", "white", "grey", "gold", "silver", "teal", "navy", "brown", "cream", "beige", "turquoise", "violet", "magenta"];
const STOCK_CLICHES = /\b(handshake|people high[- ]fiving|lightbulb moment|rocket launch|glowing brain|chess pieces|smiling team around a laptop|thumbs up)\b/i;

export function validateImagePrompt(prompt: string, brain: Brain, verifiedContext = ""): ComplianceResult {
  const base = validateAndCleanContent(prompt, brain, { kind: "image_prompt", verifiedContext });
  const violations = [...base.violations.filter((v) => !/Price|Percentage|Statistic/.test(v))];
  const warnings = [...base.warnings];
  const lower = base.cleaned.toLowerCase();
  const corpus = verifiedCorpus(brain, verifiedContext);

  // Brand colours: any colour named as a brand/accent colour must be saved.
  const brandColourMentions = lower.match(/\b([a-z]+)\s+(?:brand|accent)\s+colou?r/g) ?? [];
  for (const m of brandColourMentions) {
    const c = m.split(/\s+/)[0];
    if (COLOUR_WORDS.includes(c) && !corpus.includes(c)) violations.push(`Brand colour "${c}" isn't a saved brand colour`);
  }
  for (const hex of lower.match(/#[0-9a-f]{6}\b/g) ?? []) if (!corpus.includes(hex)) violations.push(`Colour ${hex} isn't a saved brand colour`);

  if (/\b(sign|signage|banner|logo|lettering|caption text|written)\b/.test(lower) && !/\bno (?:text|logos?|words|signage)\b/.test(lower))
    warnings.push("Prompt may produce text or signage in the image");
  if (STOCK_CLICHES.test(lower)) violations.push("Stock-photo cliché in image prompt");

  // Product grounding: prompt should mention at least one word from products/services or industry.
  const productWords = `${s(brain?.business?.products_services)} ${s(brain?.business?.industry)} ${s(brain?.business?.industry_descriptors)}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 4);
  if (productWords.length && !productWords.some((w) => lower.includes(w)))
    violations.push("Image prompt doesn't show any saved product, service or industry setting");

  return { valid: violations.length === 0, cleaned: base.cleaned, violations, warnings, repaired: base.repaired };
}

/* ------------------------ campaign consistency -------------------------- */

export type ConsistencyReport = { consistent: boolean; drifted: Array<{ asset: string; reasons: string[] }> };

/**
 * Checks a campaign's assets as one connected set: each should carry the
 * campaign's core terms and, where it has a CTA, the same saved CTA family.
 */
export function checkCampaignConsistency(
  assets: Record<string, string>,
  brief: { title?: string; theme?: string; goal?: string; offer?: string },
  brain: Brain,
): ConsistencyReport {
  const stop = new Set(["the", "and", "for", "with", "your", "this", "that", "from", "into", "about", "will", "their", "them", "have", "more", "campaign"]);
  const terms = `${brief.title ?? ""} ${brief.theme ?? ""} ${brief.goal ?? ""} ${brief.offer ?? ""}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 4 && !stop.has(w));
  const unique = [...new Set(terms)];
  const ctas = savedCtas(brain).map((c) => c.toLowerCase().slice(0, 25));
  const drifted: ConsistencyReport["drifted"] = [];
  for (const [asset, text] of Object.entries(assets)) {
    if (!text) continue;
    const lower = text.toLowerCase();
    const reasons: string[] = [];
    const hits = unique.filter((t) => lower.includes(t)).length;
    if (unique.length >= 3 && hits === 0) reasons.push("shares none of the campaign's core terms");
    const mentionsOtherOffer = /[£$€]\s?\d/.test(text) && brief.offer && !lower.includes(brief.offer.toLowerCase().slice(0, 15));
    if (mentionsOtherOffer) reasons.push("mentions a price outside the campaign offer");
    if (asset !== "image_pack" && /\b(comment|book|call|dm|sign up|download)\b/i.test(text) && ctas.length && !ctas.some((c) => lower.includes(c)))
      reasons.push("uses a call to action that isn't one of the saved CTAs");
    if (reasons.length) drifted.push({ asset, reasons });
  }
  return { consistent: drifted.length === 0, drifted };
}

/* ------------------------- provenance + logging -------------------------- */

export function buildProvenance(brain: Brain, extra: { campaignId?: string | null; strategyId?: string | null; competitor?: boolean; trend?: boolean } = {}) {
  const sections = Object.entries(brain ?? {})
    .filter(([, v]) => v && typeof v === "object" && flatten(v).some((x) => x.trim()))
    .map(([k]) => k);
  return {
    brain_sections: sections,
    proof_used: !!s(brain?.proof?.testimonials) || !!s(brain?.proof?.owned_stats),
    campaign_id: extra.campaignId ?? null,
    strategy_id: extra.strategyId ?? null,
    competitor_context: !!extra.competitor,
    trend_context: !!extra.trend,
    generated_at: new Date().toISOString(),
  };
}

export function logCompliance(entry: {
  projectId: string | null;
  generator: string;
  campaignId?: string | null;
  kind: ContentKind;
  report: ComplianceReport;
}) {
  // Internal structured log; never shown to users.
  console.info(
    "[brand-compliance]",
    JSON.stringify({
      project_id: entry.projectId,
      generator: entry.generator,
      campaign_id: entry.campaignId ?? null,
      kind: entry.kind,
      status: entry.report.status,
      violations: entry.report.violations,
      warnings: entry.report.warnings,
      repaired: entry.report.repaired,
      ai_reviewed: entry.report.aiReviewed,
      retried: entry.report.retried,
    }),
  );
}

/** Compact record stored on the saved item's meta. */
export function complianceMeta(report: ComplianceReport, provenance?: ReturnType<typeof buildProvenance>) {
  return {
    compliance: {
      status: report.status,
      violations: report.violations.slice(0, 20),
      warnings: report.warnings.slice(0, 20),
      repaired: report.repaired.length,
      retried: report.retried,
      ai_reviewed: report.aiReviewed,
    },
    ...(provenance ? { provenance } : {}),
  };
}

/**
 * Deterministic pass for writers that return straight to the screen (no save
 * step of their own). Applies safe repairs, logs the result, and returns the
 * report so callers can flag anything still unverified.
 */
export function cleanForWorkspace<T>(
  value: T,
  brain: Brain,
  options: ComplianceOptions,
  log: { projectId: string | null; generator: string; campaignId?: string | null },
): { value: T; report: ComplianceReport } {
  const { value: cleaned, result } = validateStructured(value, brain, options);
  const report: ComplianceReport = {
    status: result.valid ? (result.repaired.length ? "repaired" : "pass") : "needs_review",
    violations: result.violations,
    warnings: result.warnings,
    repaired: result.repaired,
    aiReviewed: false,
    aiIssues: [],
    retried: false,
  };
  logCompliance({ ...log, kind: options.kind, report });
  return { value: cleaned, report };
}

/** Loads a workspace's Brain for writers that only hold the prompt text. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadBrainForCompliance(supabase: any, projectId: string | null): Promise<Brain> {
  if (!projectId) return {};
  const { data } = await supabase.from("business_brains").select("data").eq("project_id", projectId).maybeSingle();
  return (data?.data ?? {}) as Brain;
}

/**
 * For writers that only hold the grounding prompt: the prompt is built from the
 * Brain, so it is a faithful fact source. Returns a minimal Brain carrying the
 * saved banned words, plus the prompt as verified context.
 */
export function brainFromGrounding(grounding: string): { brain: Brain; verifiedContext: string } {
  const banned = grounding.match(/NEVER use these words or phrases:\s*([^\n]+)/i)?.[1] ?? "";
  return { brain: { founder: { banned_words: banned } }, verifiedContext: grounding };
}

/* ----------------------- per-post batch compliance ----------------------- */

const STOP = new Set("about after again also because been before being both could does doing each from have having here into just more most much only other over same some such than that their them then there these they this those through very what when where which while will with would your yours ours have you our the and for are but not all any can get has its out".split(" "));

/** Content-word fingerprint used for angle/duplicate comparison. */
export function angleTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

/** 0..1 overlap between two pieces of text (Jaccard on content words). */
export function angleSimilarity(a: string, b: string): number {
  const A = angleTokens(a);
  const B = angleTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

const angleOf = (p: { title?: unknown; caption?: unknown }) =>
  `${typeof p.title === "string" ? p.title : ""} ${typeof p.caption === "string" ? p.caption.slice(0, 260) : ""}`;

/** Two posts count as the same angle at this overlap. */
export const DUPLICATE_THRESHOLD = 0.34;

export const PLATFORM_RULES: Record<string, string> = {
  linkedin: "LinkedIn: 80-180 words, professional but personal, short paragraphs with blank lines, a clear single takeaway, 3 hashtags at most at the end.",
  instagram: "Instagram: 50-120 words, strong first line that works before the 'more' cut, line breaks, natural emoji only if the owner uses them, 4-5 hashtags at the end.",
  facebook: "Facebook: 40-110 words, conversational and local, written like talking to a neighbour, one direct question or call to action, 0-2 hashtags.",
  email: "Email: subject-ready first line, plain friendly paragraphs, one call to action.",
};

export type PerPostResult<P> = { post: P; report: ComplianceReport; duplicateOf: string | null; platformFixed: boolean };

/**
 * Runs the Brand Compliance Engine on every post individually, so one failing
 * post never flags the rest. Before checking, each post is compared with the
 * angles to avoid (campaign posts, recent content) and earlier posts in the
 * batch, and with its planned channel; a duplicate or wrong-channel post is
 * rewritten once on its own. Only the failing post is ever regenerated.
 */
export async function complyEachPost<P extends Record<string, any>>(args: {
  posts: P[];
  brain: Brain;
  verifiedContext: string;
  groundingPrompt?: string;
  taskContext?: string;
  aiReview?: boolean;
  avoid?: string[];
  plannedPlatforms?: Array<string | undefined>;
  /** Rewrites one post with feedback; returns null if nothing usable came back. */
  rewrite: (post: P, feedback: string) => Promise<P | null>;
  log?: { projectId: string | null; generator: string; campaignId?: string | null };
}): Promise<PerPostResult<P>[]> {
  const avoid = (args.avoid ?? []).filter((a) => a && a.trim().length > 8);
  // Decide duplicates in order so the first of two similar posts survives.
  const seen: string[] = [];
  const pre = args.posts.map((p, i) => {
    const angle = angleOf(p);
    const hit = [...avoid, ...seen].find((x) => angleSimilarity(angle, x) >= DUPLICATE_THRESHOLD) ?? null;
    seen.push(angle);
    const planned = args.plannedPlatforms?.[i]?.toLowerCase();
    const wrongPlatform = !!planned && String(p.platform ?? "").toLowerCase() !== planned;
    return { p, planned, hit, wrongPlatform };
  });

  return Promise.all(
    pre.map(async ({ p, planned, hit, wrongPlatform }) => {
      let post = p;
      const notes: string[] = [];
      if (hit) notes.push(`This post repeats an angle already covered: "${hit.slice(0, 160)}". Take a clearly different angle, scenario and example.`);
      if (wrongPlatform && planned) notes.push(`This post must be written for ${planned}. ${PLATFORM_RULES[planned] ?? ""}`);
      let duplicateOf: string | null = null;
      if (notes.length) {
        try {
          const again = await args.rewrite(post, notes.join("\n"));
          if (again && typeof again.caption === "string" && again.caption.trim()) post = again;
        } catch { /* keep the original; compliance still runs */ }
        if (hit && angleSimilarity(angleOf(post), hit) >= DUPLICATE_THRESHOLD) duplicateOf = hit.slice(0, 160);
      }
      const platformFixed = wrongPlatform;
      if (planned) post = { ...post, platform: planned };
      const { value, report } = await runCompliant<P>({
        generate: async (feedback) => {
          if (!feedback) return post;
          const r = await args.rewrite(post, feedback);
          return r ? ({ ...r, ...(planned ? { platform: planned } : {}) } as P) : post;
        },
        brain: args.brain,
        options: { kind: "social_post", verifiedContext: args.verifiedContext, platform: planned },
        groundingPrompt: args.groundingPrompt,
        aiReview: args.aiReview,
        taskContext: args.taskContext,
        log: args.log,
      });
      if (duplicateOf) {
        report.status = "needs_review";
        report.violations.push(`Repeats an angle already covered: "${duplicateOf}"`);
      }
      return { post: value, report, duplicateOf, platformFixed };
    }),
  );
}

/* ------------------- feature / offer availability ----------------------- */

export type Availability = "available" | "beta" | "planned" | "unavailable";
export type AvailabilityItem = { name: string; status: Availability };

const KNOWN_INTEGRATIONS = ["canva", "mailchimp", "zapier", "hubspot", "shopify", "slack", "xero", "quickbooks", "stripe", "salesforce", "google ads", "meta ads", "tiktok ads", "klaviyo", "wordpress", "squarespace", "wix", "notion", "calendly", "gojiberry"];

function statusOf(line: string, fallback: Availability): Availability {
  const l = line.toLowerCase();
  if (/\b(unavailable|not offered|not available|don'?t offer|do not offer|discontinued)\b/.test(l)) return "unavailable";
  if (/\b(coming soon|planned|roadmap|in development|later this year|future)\b/.test(l)) return "planned";
  if (/\bbeta\b/.test(l)) return "beta";
  return fallback;
}

const cleanName = (line: string) =>
  line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/\[[^\]]*\]|\((?:coming soon|planned|beta|not offered|unavailable|not available)[^)]*\)/gi, "")
    .replace(/\b(?:integration|coming soon|planned|not offered|unavailable)\b/gi, "")
    .replace(/[—–-]\s*.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

/** Reads availability from products_services tags plus the "Coming soon / not offered" box. */
export function parseAvailability(brain: Brain): AvailabilityItem[] {
  const items: AvailabilityItem[] = [];
  const split = (t: string) => t.split(/\n|;|·/).map((x) => x.trim()).filter((x) => x.length > 1);
  for (const line of split(s(brain?.business?.products_services))) {
    const name = cleanName(line);
    if (name) items.push({ name, status: statusOf(line, "available") });
  }
  for (const line of split(s(brain?.business?.unavailable_or_planned))) {
    const name = cleanName(line);
    if (name) items.push({ name, status: statusOf(line, "planned") });
  }
  return items;
}

/** Prompt block so writers know what is live, in beta, planned or not offered. */
export function availabilityPrompt(brain: Brain): string {
  const items = parseAvailability(brain);
  const by = (st: Availability) => items.filter((i) => i.status === st).map((i) => i.name);
  const [av, beta, planned, un] = [by("available"), by("beta"), by("planned"), by("unavailable")];
  if (!beta.length && !planned.length && !un.length) {
    return "AVAILABILITY: only describe products, features, integrations and services listed under THE BUSINESS as available. If you are unsure whether something exists or is included, leave it out or use cautious wording.";
  }
  return [
    "AVAILABILITY (strict):",
    av.length ? `Available now: ${av.join("; ")}` : "",
    beta.length ? `In beta (always say \"in beta\"): ${beta.join("; ")}` : "",
    planned.length ? `Coming soon (never describe as available, live, included or ready to use; only mention as \"coming soon\" if at all): ${planned.join("; ")}` : "",
    un.length ? `Not offered (never mention or imply): ${un.join("; ")}` : "",
    "Anything not listed: leave it out or use cautious wording. Never invent a feature, integration, inclusion or delivery time.",
  ].filter(Boolean).join("\n");
}

const FUTURE_NEAR = /\b(coming soon|soon|planned|on (?:our|the) roadmap|later|next|in beta|beta|will (?:be|soon)|we'?re (?:building|working on))\b/i;

/** Product/service claim checks against verified workspace information. */
export function checkClaims(text: string, brain: Brain, verifiedContext = ""): string[] {
  const out: string[] = [];
  if (!text) return out;
  const corpus = verifiedCorpus(brain, verifiedContext);
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  const items = parseAvailability(brain);

  for (const it of items.filter((i) => i.status === "planned" || i.status === "unavailable" || i.status === "beta")) {
    const key = it.name.toLowerCase().split(" ").slice(0, 3).join(" ");
    if (key.length < 3) continue;
    const re = new RegExp(`\\b${escapeRe(key)}\\b`, "i");
    for (const sent of sentences) {
      if (!re.test(sent)) continue;
      if (it.status === "unavailable") { out.push(`Mentions "${it.name}", which is not offered`); break; }
      if (it.status === "beta" && !/\bbeta\b/i.test(sent)) { out.push(`Describes "${it.name}" without saying it is in beta`); break; }
      if (it.status === "planned" && !FUTURE_NEAR.test(sent)) { out.push(`Describes "${it.name}" as available, but it is coming soon`); break; }
    }
  }

  // Integrations not in the verified profile.
  const availText = corpus;
  for (const name of KNOWN_INTEGRATIONS) {
    const re = new RegExp(`\\b${escapeRe(name)}\\b`, "i");
    if (!re.test(text)) continue;
    if (items.some((i) => i.name.toLowerCase().includes(name))) continue; // handled above
    if (!availText.includes(name)) out.push(`Mentions a ${name[0].toUpperCase()}${name.slice(1)} integration that isn't in the profile`);
  }

  // Delivery / turnaround promises.
  const TURN = /\b(?:within|in(?: just)?|under)\s+(\d+|one|two|three|four|five|six|seven|24|48)\s*(hours?|days?|weeks?|working days?)\b|\b(\d+)[- ](?:day|week|hour)s? (?:turnaround|delivery|installation|fitting)\b|\b(?:same|next)[- ]day (?:delivery|fitting|installation|service|turnaround)\b/gi;
  for (const m of text.matchAll(TURN)) {
    const phrase = m[0].toLowerCase();
    const num = (m[1] ?? m[3] ?? "").toLowerCase();
    const ok = corpus.includes(phrase) || (num && new RegExp(`\\b${escapeRe(num)}[- ]?(?:${(m[2] ?? "day|week|hour").replace(/s$/, "")})`).test(corpus));
    if (!ok) out.push(`Delivery or turnaround promise "${m[0]}" isn't in the profile`);
  }

  // "Free X" / "included" services.
  for (const m of text.matchAll(/\bfree\s+([a-z]+)(?:\s+([a-z]+))?/gi)) {
    const w = m[1].toLowerCase();
    if (["of", "to", "and", "from", "for", "up", "time", "will", "you", "your", "the"].includes(w)) continue;
    if (!corpus.includes(`free ${w}`)) out.push(`"${m[0]}" isn't a saved offer`);
  }
  for (const m of text.matchAll(/\b([a-z][a-z ]{2,30}?)\s+(?:is|are|comes?)\s+included\b/gi)) {
    const thing = m[1].trim().toLowerCase().split(" ").slice(-2).join(" ");
    if (!corpus.includes(thing)) out.push(`Says "${m[0].trim()}", which isn't in the profile`);
  }
  return Array.from(new Set(out));
}

// Streams Lovable AI Gateway chat completions for the Engine modules.
// Injects the active project's Business Brain into the system prompt and
// records every generation in marketing_history.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BANNED_RHETORIC_PATTERNS = [
  /\b(?:is|are|was|were|'s|'re|isn't|aren't|wasn't|weren't)\s+(?:about\s+)?more\s+than\s+(?:just|simply|merely)\b/i,
  /\bmore\s+than\s+(?:just|simply|merely)\b/i,
  /\b(?:not|isn't|aren't|wasn't|weren't)\s+(?:just|simply|merely)?[^.!?\n]{0,120}\b(?:but|instead|rather)\b/i,
  /\bless\s+about\b[^.!?\n]{0,120}\bmore\s+about\b/i,
  /\b(?:we|you|they|it|this|that)\s+(?:do not|don't|does not|doesn't|is not|isn't|are not|aren't)\b[^.!?\n]{0,120}[,;—:]\s*(?:we|you|they|it|this|that|'?s\b)/i,
  /\bnot\s+only\b[^.!?\n]{0,120}\bbut\s+also\b/i,
  /\bgoes?\s+beyond\s+(?:just|simply|merely)\b/i,
];

// Banned filler / AI-cliché vocabulary (user's style guide, section 3).
const BANNED_FILLER_PATTERNS = [
  /\bcrucial\b/i,
  /\btapestry\b/i,
  /\bdive\s+deep(?:er)?\b/i,
  /\blook\s+no\s+further\b/i,
  /\belevate\b/i,
  /\btestament\s+to\b/i,
  /\bgame[- ]?changer\b/i,
  /\bfoster\b/i,
  /\bin\s+today'?s\s+fast[- ]paced\s+world\b/i,
  /\breclaim\s+your\s+evenings\b/i,
  /\bunlock\b/i,
  /\bsupercharge\b/i,
  /\blet'?s\s+dive\s+in\b/i,
];

function containsBannedFiller(text: string): boolean {
  return BANNED_FILLER_PATTERNS.some((pattern) => pattern.test(text));
}

function containsBannedRhetoric(text: string): boolean {
  return BANNED_RHETORIC_PATTERNS.some((pattern) => pattern.test(text));
}

// Last-resort tidy-up: swap banned filler words for plain equivalents so a
// usable draft still reaches the writer instead of a hard failure.
const FILLER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcrucial\b/gi, "important"],
  [/\btapestry\b/gi, "mix"],
  [/\bdive\s+deep(?:er)?\b/gi, "look closer"],
  [/\blet'?s\s+dive\s+in\b/gi, "here goes"],
  [/\blook\s+no\s+further\b/gi, "here it is"],
  [/\belevate\b/gi, "improve"],
  [/\ba\s+testament\s+to\b/gi, "a sign of"],
  [/\btestament\s+to\b/gi, "sign of"],
  [/\bgame[- ]?changer\b/gi, "big shift"],
  [/\bfoster\b/gi, "build"],
  [/\bin\s+today'?s\s+fast[- ]paced\s+world,?\s*/gi, ""],
  [/\breclaim\s+your\s+evenings\b/gi, "get your evenings back"],
  [/\bunlock\b/gi, "open up"],
  [/\bsupercharge\b/gi, "speed up"],
];

function scrubFiller(text: string): string {
  let out = text;
  for (const [pattern, replacement] of FILLER_REPLACEMENTS) out = out.replace(pattern, replacement);
  return out.replace(/[ \t]{2,}/g, " ");
}

async function readChatCompletionStream(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string") output += delta;
      } catch {
        // Ignore malformed upstream event fragments.
      }
    }
  }
  return output;
}

function asCompletionStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-project-id, x-module, x-brain-override, x-onboarding-first-post",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const BRAIN_SECTIONS = [
  {
    key: "business",
    title: "Business information",
    fields: [
      ["name", "Business name"],
      ["website", "Website"],
      ["industry", "Industry"],
      ["products_services", "Products & services"],
      ["location", "Location"],
      ["years_trading", "Years trading"],
    ],
  },
  {
    key: "brand",
    title: "Brand",
    fields: [
      ["tone_of_voice", "Tone of voice"],
      ["mission", "Mission"],
      ["values", "Brand values"],
      ["usp", "Unique selling point"],
      ["colors", "Brand colours"],
      ["fonts", "Fonts"],
    ],
  },
  {
    key: "audience",
    title: "Target audience",
    fields: [
      ["ideal_customer", "Ideal customer"],
      ["pain_points", "Pain points"],
      ["goals", "Goals"],
      ["objections", "Objections"],
      ["buying_triggers", "Buying triggers"],
    ],
  },
  {
    key: "marketing",
    title: "Marketing",
    fields: [
      ["business_goals", "Business goals"],
      ["competitors", "Competitors"],
      ["keywords", "Keywords"],
      ["channels", "Channels"],
      ["budget", "Budget"],
    ],
  },
  {
    key: "content",
    title: "Content preferences",
    fields: [
      ["post_length", "Preferred post length"],
      ["emoji_preference", "Emojis"],
      ["preferred_platforms", "Preferred platforms"],
    ],
  },
  {
    key: "proof",
    title: "Testimonials & proof",
    fields: [
      ["testimonials", "Testimonials (verbatim — quote only these)"],
      ["case_studies", "Case study results"],
      ["notable_clients", "Notable clients / logos"],
      ["awards_press", "Awards & press"],
      ["owned_stats", "Owned stats & data points"],
    ],
  },
  {
    key: "founder",
    title: "Founder voice & story",
    fields: [
      ["name_role", "Founder name & role"],
      ["origin_story", "Why you started"],
      ["hot_takes", "Personal beliefs / hot takes"],
      ["signature_phrases", "Signature phrases"],
      ["banned_words", "Banned words & phrases"],
      ["sample_posts", "Sample posts that sound like you"],
    ],
  },
  {
    key: "ctas",
    title: "Calls to action",
    fields: [
      ["primary", "Primary CTA"],
      ["secondary", "Secondary CTA"],
      ["alternative", "Alternative CTA"],
      ["offer", "Offer CTA"],
      ["current_offer", "Current live offer"],
      ["bridge_line", "Caption-to-CTA bridge"],
      ["comment_cta", "Comment CTA"],
      ["lead_magnets", "Downloadable assets"],

    ],
  },
  {
    key: "preferences",
    title: "User preferences",
    fields: [
      ["language", "Language"],
      ["timezone", "Timezone"],
    ],
  },
];

// deno-lint-ignore no-explicit-any
function brainToContext(data: any): string {
  if (!data) return "";
  const lines: string[] = [];
  for (const s of BRAIN_SECTIONS) {
    const sect = data[s.key];
    if (!sect) continue;
    const entries: string[] = [];
    for (const [k, label] of s.fields) {
      const v = sect[k];
      if (v && String(v).trim()) entries.push(`  - ${label}: ${String(v).trim()}`);
    }
    if (entries.length) {
      lines.push(`${s.title}:`);
      lines.push(...entries);
    }
  }
  if (!lines.length) return "";
  const ctas = data?.ctas ?? {};
  const primary = String(ctas.primary ?? "").trim();
  const bridge = String(ctas.bridge_line ?? "").trim();
  const currentOffer = String(ctas.current_offer ?? "").trim();
  const hasCommentCta = !!String(ctas.comment_cta ?? "").trim();
  const hasAssets = !!String(ctas.lead_magnets ?? "").trim();
  return [
    "BUSINESS BRAIN — GROUND TRUTH. Use this context throughout. Every concrete fact in the output must come from here or the user's explicit generation input.",
    ...lines,
    "",
    "NEVER INVENT: customer stories, testimonials, conversations, technical specifications, installation methods, manufacturing timelines, guarantees, prices, staff names, awards, statistics, client logos, products, services or offer details.",
    "If a detail is missing, write around it instead of filling the gap.",
    "CALLS TO ACTION: only use CTAs in the Calls to action section. Never invent a CTA, phone number, booking link, download or offer.",
    primary ? `Default CTA: use the Primary CTA verbatim when no better saved CTA applies: "${primary}".` : "No Primary CTA is saved — end with a plain invitation to get in touch only.",
    bridge
      ? `BRIDGE (required): every post MUST include a short transition sentence between the main caption and the CTA so the ending doesn't feel bolted on. Use one of the saved bridge lines verbatim, or write a single sentence in the same voice that naturally leads into the CTA. Saved bridges:\n${bridge}`
      : "BRIDGE (required): every post MUST include a short one-sentence transition between the caption and the CTA, written in the brand voice, so the CTA feels connected to what was just said — never jump straight from story to sales.",
    currentOffer
      ? `CURRENT LIVE OFFER (only reference on offer-driven posts, use verbatim details): ${currentOffer}. When you reference it, pair it with the Offer CTA if one is saved.`
      : "No current live offer is saved — do not mention discounts, deadlines, promos or free extras.",
    hasCommentCta ? "A Comment CTA exists; use it only when the format genuinely calls for it." : "No Comment CTA is saved — comment-keyword mechanics are forbidden.",
    hasAssets ? "Downloadable assets exist; only offer the listed assets." : "No downloadable assets are saved — do not offer guides, PDFs, checklists, price lists, templates, ebooks or downloads.",
  ].join("\n");

}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    // Always drain the request body first. Returning early (paywall / brain
    // validation) without consuming it can reset the connection and surface
    // as "Failed to fetch" on the client's retry.
    let body: { system?: string; user?: string; model?: string } = {};
    try { body = await req.json(); } catch { body = {}; }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not signed in" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u.user) return json({ error: "Invalid session" }, 401);
    const userId = u.user.id;
    const isAnonymous = u.user.is_anonymous === true;

    const admin = createClient(SUPABASE_URL, SERVICE);

    // ---- Plan + credits gate (feature-flagged) ----
    const paywallOn = (Deno.env.get("ENGINE_PAYWALL_ENABLED") || "true").toLowerCase() !== "false";

    // Fetch plan + monthly reset if needed
    const { data: planRows } = await admin.rpc("get_engine_plan", { _user: userId });
    const plan = Array.isArray(planRows) ? planRows[0] : planRows;
    let hasActivePlan = !!plan?.active;
    const isPro = plan?.brain_enabled === true;
    let creditsLeft = plan?.credits_left ?? 0;

    // Single haaylo membership (Stripe `subscriptions` table) — an active
    // membership unlocks everything with unlimited generations, regardless of
    // the legacy engine_access tier rows.
    let membershipActive = false;
    try {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", userId)
        .maybeSingle();
      membershipActive =
        sub?.status === "active" ||
        sub?.status === "trialing" ||
        sub?.status === "past_due" ||
        (sub?.status === "canceled" &&
          !!sub?.current_period_end &&
          new Date(sub.current_period_end) > new Date());
    } catch { /* membership lookup is best-effort */ }


    // Roll monthly credit window
    if (hasActivePlan && plan?.credits_period_start) {
      const startMs = new Date(plan.credits_period_start).getTime();
      if (Date.now() - startMs > 30 * 24 * 60 * 60 * 1000) {
        await admin
          .from("engine_access")
          .update({ credits_used: 0, credits_period_start: new Date().toISOString() })
          .eq("user_id", userId);
        creditsLeft = plan.credits_limit ?? creditsLeft;
      }
    }

    const moduleKey = req.headers.get("x-module") || "engine";
    const tierName = String(plan?.plan ?? "none");
    // 'membership' = the single haaylo membership: everything unlocked, unlimited.
    if (tierName === "membership") membershipActive = true;
    const tierLimit = tierName === "expert" || tierName === "membership"
      ? Infinity
      : tierName === "pro" ? 500 : tierName === "starter" ? 150 : 0;
    if (hasActivePlan) {
      creditsLeft = tierLimit === Infinity ? Infinity : Math.max(0, tierLimit - (plan?.credits_used ?? 0));
    }
    const tierRank: Record<string, number> = { none: 0, starter: 1, pro: 2, expert: 3, membership: 3 };

    const featureMinTier: Record<string, "starter" | "pro" | "expert"> = {
      voice: "starter",
      strategy: "starter",
      content: "starter",
      competitors: "starter",
      funnel: "starter",
      keywords: "starter",
      refine: "starter",
      chat: "pro",
      analytics: "pro",
      assistant: "pro",
      brain: "pro",
      image: "expert",
    };

    const FREE_GENERATION_LIMIT = 1;
    const { data: usage } = await admin
      .from("engine_usage")
      .select("free_generation_used, free_generations_used, free_starter_used, free_voice_used, free_posts_used")
      .eq("user_id", userId)
      .maybeSingle();
    const freeUsed = usage?.free_generations_used ?? (usage?.free_generation_used === true ? 1 : 0);
    // The dedicated onboarding post is its own one-time entitlement. This keeps
    // Brain setup, voice summaries, or earlier failed attempts from consuming
    // the post the user was explicitly promised.
    const onboardingFirstPost = req.headers.get("x-onboarding-first-post") === "1" && moduleKey === "content";
    const freeGenerationUsed = onboardingFirstPost
      ? usage?.free_posts_used === true
      : freeUsed >= FREE_GENERATION_LIMIT;

    if (paywallOn && !membershipActive) {

      if (hasActivePlan) {
        const requiredTier = featureMinTier[moduleKey] ?? "starter";
        if ((tierRank[tierName] ?? 0) < tierRank[requiredTier]) {
          return json(
            {
              error: `Upgrade to ${requiredTier[0].toUpperCase() + requiredTier.slice(1)} to use this feature.`,
              code: "plan_required",
              module: moduleKey,
              requiredTier,
              plan: tierName,
            },
            402,
          );
        }
        if (tierName !== "expert" && creditsLeft <= 0) {
          return json(
            {
              error: "You've used this month's generations. Upgrade to keep going.",
              code: "credits_exhausted",
              plan: tierName,
            },
            402,
          );
        }
      } else if (freeGenerationUsed) {
        return json(
          {
            error: "That's your free generation. Join haaylo to keep creating.",
            code: "trial_exhausted",
            module: moduleKey,
          },
          402,
        );
      }
    }

    // load active project + brain — ALWAYS load for authenticated users so every
    // module sees identical Brain context. There is exactly one retrieval path.
    let projectId: string | null = req.headers.get("x-project-id");
    let brainCtx = "";
    let industry = "";
    let country = "";
    // deno-lint-ignore no-explicit-any
    let brainData: any = null;
    if (!isAnonymous) {
      if (!projectId) {
        const { data: proj } = await admin
          .from("projects")
          .select("id")
          .eq("user_id", userId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        projectId = proj?.id ?? null;
      }
      if (projectId) {
        const { data: brain } = await admin
          .from("business_brains")
          .select("data")
          .eq("project_id", projectId)
          .maybeSingle();
        brainData = brain?.data ?? null;
        brainCtx = brainToContext(brainData);
        industry = String(brainData?.business?.industry ?? "").trim();
        country = String(brainData?.preferences?.country ?? brainData?.business?.location ?? "").trim();
      }
    }

    // ── Pre-generation Brain validation ────────────────────────────────────
    // Each module declares the minimum Brain fields it needs to produce
    // brand-specific (non-generic) output. If any are missing and the caller
    // hasn't passed x-brain-override:1, we refuse with brain_incomplete and
    // the exact missing field labels so the UI can prompt the user.
    const REQUIRED_BRAIN: Record<string, Array<[string, string, string]>> = {
      // module -> [ [section, field, label] ] — keys must match src/lib/brain-schema.ts
      content:     [["brand","tone_of_voice","Brand voice — tone of voice"], ["audience","ideal_customer","Target audience — ideal customer"]],
      strategy:    [["business","products_services","Products & services"], ["audience","ideal_customer","Target audience — ideal customer"]],
      funnel:      [["business","products_services","Products & services"], ["audience","ideal_customer","Target audience — ideal customer"], ["ctas","primary","Primary CTA"]],
      voice:       [["business","name","Business name"], ["audience","ideal_customer","Target audience — ideal customer"]],
      keywords:    [["business","products_services","Products & services"], ["audience","ideal_customer","Target audience — ideal customer"]],
      competitors: [["business","products_services","Products & services"]],
      refine:      [["brand","tone_of_voice","Brand voice — tone of voice"]],
    };
    const overrideBrain = (req.headers.get("x-brain-override") || "") === "1";
    const required = REQUIRED_BRAIN[moduleKey] || [];
    if (!isAnonymous && required.length && !overrideBrain) {
      const missing: string[] = [];
      for (const [section, field, label] of required) {
        const v = brainData?.[section]?.[field];
        if (!v || !String(v).trim()) missing.push(label);
      }
      if (missing.length) {
        return json({
          error: `Your Business Brain is missing: ${missing.join(", ")}. Output will be generic without this.`,
          code: "brain_incomplete",
          module: moduleKey,
          missing,
        }, 428);
      }
    }


    const { system, user, model } = body;
    if (!user) return json({ error: "Missing user prompt" }, 400);

    // ── Industry research injection ────────────────────────────────────────
    // Cached per (industry, YYYY-MM). Generated with a fast model the first
    // time an industry is used each month, then reused for every generation.
    let industryCtx = "";
    if (industry) {
      const industryKey = industry.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
      const now = new Date();
      const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      try {
        const { data: cached } = await admin
          .from("industry_insights")
          .select("insights")
          .eq("industry_key", industryKey)
          .eq("period", period)
          .maybeSingle();
        if (cached?.insights) {
          industryCtx = cached.insights;
        } else {
          const monthName = now.toLocaleString("en-GB", { month: "long", year: "numeric" });
          const nextMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 1).toLocaleString("en-GB", {
            month: "long",
            year: "numeric",
          });
          const researchPrompt = `You are a senior industry analyst. Produce a tight, factual research brief for a content marketer working in this industry: "${industry}"${country ? ` (primary market: ${country})` : ""}.
Today is ${monthName}. Cover ${monthName} and ${nextMonth}.

Return plain text with these exact sections (short bullets, no fluff, no emojis, no markdown headings — use ALL-CAPS labels):

TRENDING TOPICS
- 5 concrete conversations happening in this industry right now (specific angles, not generic).

UPCOMING AWARENESS DAYS & INDUSTRY DATES
- Real awareness months/days, conferences, regulatory deadlines or seasonal moments in the next 8 weeks. Include the date AND a source URL to the official organiser page in the form: ([Organiser name](https://url)). If you can't cite a real URL, omit that entry.

STATS & REPORTS WORTH CITING
- 4-6 recent, real statistics or report findings a practitioner would recognise. Each MUST include a source URL in the form: ([Source name](https://url)) — link to the report landing page or publisher, not example.com. If you are not confident both the stat AND the URL are real, omit it. Never invent numbers or URLs.

EXPERT ANGLES
- 3 contrarian or thought-leadership takes that position the author as an expert (not obvious platitudes).

AVOID
- 3 tired takes, buzzwords or clichés that are overdone in this industry right now.

Keep the whole brief under 500 words. UK English.`;
          const briefRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "user", content: researchPrompt }],
            }),
          });
          if (briefRes.ok) {
            const bj = await briefRes.json();
            const text: string = bj.choices?.[0]?.message?.content?.trim() ?? "";
            if (text) {
              industryCtx = text;
              await admin
                .from("industry_insights")
                .upsert({ industry_key: industryKey, period, insights: text }, { onConflict: "industry_key,period" });
            }
          }
        }
      } catch (e) {
        console.error("industry insights fetch failed", e instanceof Error ? e.message : String(e));
      }
    }

    const industryBlock = industryCtx
      ? `INDUSTRY RESEARCH BRIEF (use this to ground topics, cite real stats/reports, tie posts to upcoming dates, and avoid tired takes — do not dump this brief into the output verbatim):\n${industryCtx}`
      : "";
    const brainBlock = brainCtx
      ? `═══ BUSINESS CONTEXT — AUTHORITATIVE ═══\nThe following is factual information about the business you are writing for. Every output MUST be consistent with this. Do NOT contradict it, do NOT ignore it, and do NOT default to generic marketing language if it conflicts with what is stated below. Use this business's actual tone, audience, offers, and voice.\n\n${brainCtx}\n═══ END BUSINESS CONTEXT ═══`
      : "";
    // ── Current date grounding ─────────────────────────────────────────────
    // Models default to their training cutoff and write "2024"/"2025" content.
    // Pin today's real date so seasonal hooks, awareness dates and any year
    // referenced in output are always current.
    const today = new Date();
    const dateBlock = [
      "═══ CURRENT DATE — AUTHORITATIVE ═══",
      `Today's date is ${today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.`,
      `The current year is ${today.getUTCFullYear()}. The current month is ${today.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${today.getUTCFullYear()}.`,
      `Never reference ${today.getUTCFullYear() - 1} or earlier as "this year", "current", "now" or "upcoming". Ignore your training cutoff — this date overrides it.`,
      `If a year must appear in the output (campaigns, seasonal hooks, trends, plans, awareness dates), use ${today.getUTCFullYear()} or later. Any 90-day plan starts from today.`,
      "═══ END CURRENT DATE ═══",
    ].join("\n");

    // ── Global banned rhetoric (applies to EVERY module, no exceptions) ─────
    const antithesisBlock = [
      "═══ BANNED SENTENCE CONSTRUCTIONS — ZERO TOLERANCE ═══",
      "NEVER use antithesis / negation-then-affirmation phrasing in ANY form, in any clause position, in any tense, with or without \"just\", \"merely\", \"only\", a semicolon, a comma or an em-dash. Banned shapes include but are not limited to:",
      "- \"It's not X, it's Y\" / \"It isn't just X, it's Y\" / \"This isn't X — it's Y\"",
      "- \"X is not A, it is B\" / \"X isn't a luxury, it's a necessity\" / \"not merely A but B\" / \"not only A but also B\"",
      "- \"less about A, more about B\" / \"A isn't the problem; B is\" / \"we don't do A, we do B\" / \"stop A, start B\"",
      "- \"more than just X\" / \"X is about more than just Y\" / \"X goes beyond just Y\" followed by a grander reframe.",
      "- ANY sentence that negates a common framing and then asserts the \"real\" one.",
      "Also banned: standalone aphorism/truism openers, chiasmus, and \"it's the X that Y\" reveal phrasing used as a flourish.",
      "SELF-CHECK BEFORE RETURNING: scan the draft for \"not\", \"isn't\", \"aren't\", \"doesn't\", \"don't\" followed within ~15 words by \"it's\", \"it is\", \"but\", \";\", \",\" or \"—\" leading into an affirmative clause. Rewrite every match as a plain positive statement. Do this silently.",
      "═══ END BANNED CONSTRUCTIONS ═══",
    ].join("\n");

    // ── Global writing style (user's style guide — applies to EVERY module) ──
    const styleBlock = [
      "═══ BRITISH WRITER VOICE — MANDATORY STYLE RULES ═══",
      "You write like an authentic, highly skilled British copywriter. Indistinguishable from a human.",
      "",
      "ANTI-AI CADENCE (burstiness):",
      "- Vary sentence structure aggressively. Mix punchy short sentences with occasional longer, multi-clause thoughts.",
      "- Use natural contractions (\"it's\", \"don't\", \"you're\") without exception.",
      "- Avoid rhythmic symmetry. Paragraphs must vary in length; never produce balanced, perfectly parallel blocks.",
      "- UK English spelling exclusively: categorise, prioritising, behaviour, programme, grey, colour. American spellings are forbidden.",
      "",
      "FORBIDDEN FORMATTING AND CLICHÉS:",
      "- Never pair a dramatic hook with a cliché analogy (\"memory of a goldfish\" etc.).",
      "- Never place an emoji immediately after a hook. Maximum one emoji per post, inside body copy where a human would use it.",
      "- No overhyped marketing traps: \"permanent Brain\", \"Founding Member Spots\", \"reclaim your evenings\".",
      "- No predictable forced engagement questions at the end (\"How many tabs do you have open?\"). If you end on a question, keep it short, casual and conversational.",
      "- No rigid Problem-Agitation-Solution style frameworks. Start directly with substance, a real scenario, or a straightforward fact.",
      "",
      "VOCABULARY AND TEXTURE RESTRICTIONS:",
      "- Banned filler words and transitions: \"crucial\", \"tapestry\", \"dive deep\", \"more than just\", \"look no further\", \"elevate\", \"testament\", \"game-changer\", \"foster\", \"unlock\", \"supercharge\", \"in today's fast-paced world\".",
      "- No hyper-enthusiastic American sales language. Understated, authentic, direct British tone.",
      "- Replace subjective, hyper-polished adjectives with objective nouns or straightforward observations.",
      "- Comfortable natural speaking pace. If a sentence sounds like a corporate press release, a motivational speaker, or a LinkedIn thought leader when read aloud, rewrite it to sound like one peer talking to another over coffee.",
      "",
      "DISGUISE THE COPYWRITING FRAMEWORKS:",
      "- If you use a framework (Hook-Problem-Solution, PAS, AIDA), hide the seams. Transitions must never be obvious or rigid.",
      "- Banned bridge phrases: \"[Product] solves this by...\", \"Introducing...\", \"That's where X comes in\", \"Enter X\", \"The solution?\", \"Sound familiar?\".",
      "- Enter the problem through a specific, annoying action a real person does (\"copying and pasting the same rules into a chat window every morning\"), never an abstract pain statement.",
      "- Enter the solution casually, like sharing a tool you built or stumbled on, not pitching a product.",
      "",
      "INTEGRATE PRODUCTS NATURALLY IN STORIES:",
      "- In narrative posts (a partnership, an event, a personal experience), never give the product its own explainer paragraph.",
      "- Treat the product as a tool or background character inside the story: \"They're using Haaylo to build these systems out\" rather than \"Haaylo provides the framework for them to build...\".",
      "- Hold one conversational register from the first sentence to the last. Never drift into corporate or grandiose language halfway through.",

      "THE ALOUD TEST:",

      "- Allow intellectual hesitation or realistic nuance rather than flawless robotic confidence.",
      "- Start on substance. Skip preambles and performative enthusiasm. End on substance.",
      "═══ END STYLE RULES ═══",
    ].join("\n");

    const finalSystem = [dateBlock, brainBlock, industryBlock, antithesisBlock, styleBlock, system].filter(Boolean).join("\n\n");



    const requestCompletion = (requestSystem: string) => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      body: JSON.stringify({
        model: model || "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: requestSystem },
          { role: "user", content: user },
        ],
        stream: true,
      }),
    });

    let upstream = await requestCompletion(finalSystem);

    if (!upstream.ok) {
      const txt = await upstream.text();
      console.error("engine-ai gateway error", upstream.status, txt);
      const safeStatus = upstream.status === 402 || upstream.status === 429 ? upstream.status : 502;
      const safeMessage =
        upstream.status === 402
          ? "Generation is temporarily unavailable. Please try again shortly."
          : upstream.status === 429
            ? "Rate limit exceeded, please retry shortly"
            : "AI service is temporarily unavailable";
      return json({ error: safeMessage }, safeStatus);
    }

    // Debit a credit (or the free trial) now that we're committed to a generation.
    if (paywallOn && !membershipActive) {
      if (hasActivePlan && tierName !== "expert") {
        await admin
          .from("engine_access")
          .update({ credits_used: (plan?.credits_used ?? 0) + 1 })
          .eq("user_id", userId);
      } else if (!freeGenerationUsed) {
        const nextFree = Math.max(freeUsed, 0) + 1;
        await admin
          .from("engine_usage")
          .upsert({
            user_id: userId,
            free_generations_used: nextFree,
            free_generation_used: nextFree >= FREE_GENERATION_LIMIT,
            ...(onboardingFirstPost ? { free_posts_used: true } : {}),
            free_uses_remaining: Math.max(0, FREE_GENERATION_LIMIT - nextFree),
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
      }
    }

    // Hold the draft server-side until it passes the rhetoric gate. This stops a
    // forbidden phrase reaching the browser even when the model ignores prompts.
    // The voice module is exempt: it quotes the founder's own sample posts and
    // signature phrases verbatim, and the founder edits the summary before saving,
    // so a rewrite would corrupt their own words.
    const skipRhetoricGate = moduleKey === "voice";
    let finalOutput = await readChatCompletionStream(upstream);

    // Give the model two chances to rewrite a draft that breaks the style rules,
    // then tidy the remaining filler ourselves rather than losing the draft.
    if (!skipRhetoricGate) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (finalOutput.trim() && !containsBannedRhetoric(finalOutput) && !containsBannedFiller(finalOutput)) break;
        const correction = `${finalSystem}\n\nMANDATORY REWRITE: Your previous draft broke the style rules. It used a forbidden contrast-reframe construction (e.g. “more than just”, negate-X-then-assert-Y) or a banned filler word (crucial, tapestry, dive deep, look no further, elevate, testament, game-changer, foster, unlock, supercharge). Rewrite the full answer in the British writer voice: plain positive statements, varied sentence length, natural contractions, UK spellings, no clichés. Return only the corrected answer.`;
        const retry = await requestCompletion(correction);
        if (!retry.ok) {
          console.error("engine-ai correction failed", retry.status, await retry.text());
          break;
        }
        const next = await readChatCompletionStream(retry);
        if (next.trim()) finalOutput = next;
      }
      if (containsBannedFiller(finalOutput)) finalOutput = scrubFiller(finalOutput);
    }

    if (!finalOutput.trim()) {
      return json({ error: "Nothing came back from the writer. Please try again." }, 422);
    }
    if (!skipRhetoricGate && containsBannedRhetoric(finalOutput)) {
      return json({ error: "The draft did not meet your saved writing rules. Please try again." }, 422);
    }

    if (projectId && !isAnonymous) {
      const title = (user.split("\n").find((line: string) => line.trim().length) || moduleKey).slice(0, 120);
      const { error: historyError } = await admin.from("marketing_history").insert({
        project_id: projectId,
        user_id: userId,
        module: moduleKey,
        title,
        prompt: { system: finalSystem, user },
        output: finalOutput.slice(0, 60000),
      });
      if (historyError) console.error("history capture failed", historyError.message);
    }

    return new Response(asCompletionStream(finalOutput), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("engine-ai error", e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

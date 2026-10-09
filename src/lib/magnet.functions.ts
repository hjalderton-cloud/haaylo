import { createServerFn } from "@tanstack/react-start";
import { cleanForWorkspace, brainFromGrounding, validateImagePrompt } from "./brand-compliance.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  type MagnetConfig,
} from "./magnet-schema";

const GATEWAY_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GATEWAY_IMAGE = "https://ai.gateway.lovable.dev/v1/images/generations";

const profileInput = z.object({
  goal: z.string().trim().min(2).max(2000),
  audience: z.string().trim().min(2).max(6000),
  offer: z.string().trim().min(2).max(6000),
  tone: z.string().trim().min(2).max(400),
  visual_style: z.string().trim().max(600).optional(),
  /** Skip AI imagery (faster) */
  skip_images: z.boolean().optional(),
  /** Client (project) currently selected in the nav switcher. */
  projectId: z.string().uuid().optional(),
  /** Campaign the kit belongs to — grounds the wording in that campaign. */
  campaignId: z.string().uuid().optional(),
});

type BrainCtx = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

/** Resolves the selected client, falling back to the default/first project. */
async function resolveProjectId(ctx: BrainCtx, projectId?: string): Promise<string | null> {
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

/** The selected client's Strategy Profile, plus the account-level brand row. */
async function loadBrains(ctx: BrainCtx, projectId?: string) {
  const resolved = await resolveProjectId(ctx, projectId);
  const [brainRes, brandRes] = await Promise.all([
    resolved
      ? ctx.supabase.from("business_brains").select("data").eq("project_id", resolved).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase
      .from("brand_brain")
      .select("brand_name, target_audience, brand_voice, primary_color, secondary_color, logo_url")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brain = ((brainRes?.data as any)?.data ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brand = (brandRes?.data ?? null) as Record<string, any> | null;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const hex = (v: unknown) => {
    const t = s(v);
    return /^#[0-9a-f]{3,8}$/i.test(t) ? t : "";
  };
  // The logo saved against this workspace's Brand DNA wins over the account-level one.
  let workspaceLogoUrl = "";
  if (resolved) {
    const { data: logoRow } = await ctx.supabase
      .from("brain_assets")
      .select("storage_path")
      .eq("project_id", resolved)
      .eq("kind", "logo")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const path = (logoRow?.storage_path as string | undefined) ?? "";
    if (path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("scheduler-media")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      workspaceLogoUrl = signed?.signedUrl ?? "";
    }
  }
  // Central brand grounding: full Brand DNA, voice, CTAs, proof, competitors, trends.
  const { loadBrandContext } = await import("./brand-context.server");
  const grounding = (await loadBrandContext(ctx, resolved)).prompt;
  // Prefer the selected client's own brand details over the account-level ones.
  return {
    grounding,
    projectId: resolved,
    brain,
    brand,
    brandName: s(brain?.business?.name) || s(brain?.brand?.name) || s(brand?.brand_name) || "Your brand",
    brandVoice: s(brain?.brand?.tone_of_voice) || s(brand?.brand_voice),
    brandAudience: s(brain?.audience?.ideal_customer) || s(brand?.target_audience),
    primary: hex(brain?.brand?.primary_color) || hex(brand?.primary_color),
    secondary: hex(brain?.brand?.secondary_color) || hex(brand?.secondary_color),
    accent: hex(brain?.brand?.accent_color),
    font: s(brain?.brand?.font_preference) || s(brain?.brand?.fonts),
    logoUrl: workspaceLogoUrl,
  };
}

/** The campaign record the funnel is currently working on. */
async function loadCampaign(ctx: BrainCtx, campaignId?: string) {
  if (!campaignId) return null;
  const { data } = await ctx.supabase
    .from("campaigns")
    .select(
      "id, campaign_title, campaign_theme, campaign_duration, landing_page_headline, landing_page_subheadline, guide_title, guide_intro, guide_sections, lead_magnet_content",
    )
    .eq("user_id", ctx.userId)
    .eq("id", campaignId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? null) as Record<string, any> | null;
}



function stripFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

async function generateImage(apiKey: string, prompt: string): Promise<string | null> {
  // The account's own OpenAI key first, gateway only as a fallback.
  const { openAiKey, openAiGenerate } = await import("./openai-image.server");
  if (openAiKey()) return openAiGenerate({ prompt, strict: false });
  try {
    const res = await fetch(GATEWAY_IMAGE, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json as string | undefined;
    return b64 ?? null;
  } catch {
    return null;
  }
}

async function uploadPng(userId: string, b64: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${userId}/magnet/${crypto.randomUUID()}.png`;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { error } = await supabaseAdmin.storage
      .from("scheduler-media")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (error) return null;
    const { data: signed } = await supabaseAdmin.storage
      .from("scheduler-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Generates the complete lead magnet kit: landing page copy, ebook pages and
 * AI hero / cover / feature imagery, styled with the user's brand_brain colours.
 */
export const generateMagnetKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profileInput.parse(d))
  .handler(async ({ data, context }): Promise<MagnetConfig> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const { supabase, userId } = context;

    const brains = await loadBrains({ userId, supabase }, data.projectId);
    const campaign = await loadCampaign({ userId, supabase }, data.campaignId);
    const brandName = brains.brandName;
    const primary = brains.primary || DEFAULT_PRIMARY;
    const secondary = brains.secondary || DEFAULT_SECONDARY;
    const visual = data.visual_style?.trim() || "clean editorial, generous white space, soft depth";

    const system =
      "You are a British direct-response copywriter and information designer. " +
      "Write in UK English (organisation, colour, whilst). Understated, direct, peer-over-coffee voice. " +
      "No American hype, no press-release cadence, no exclamation marks, no rhetorical questions as openers. " +
      "Never use: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, " +
      "game-changer, foster, unlock, supercharge, magic, effortless, seamless, level up, say goodbye to, " +
      "tired of, the secret to. " +
      "Never use antithesis phrasing (\"not X, it's Y\") or stacked negative lists (\"no X, no Y\"). " +
      "Say plainly what the thing does and who it is for; invent no claims. Return JSON only.";


    const campaignBlock = campaign
      ? `\nCAMPAIGN (ground every claim and angle in this campaign, not in generic marketing):
Campaign: ${campaign["campaign_title"] ?? ""}
Campaign theme: ${campaign["campaign_theme"] ?? ""}
Campaign length: ${campaign["campaign_duration"] === "30-day" ? "30-day launch, urgency-led" : "90-day system, steady authority"}
${campaign["landing_page_headline"] ? `Existing headline direction: ${campaign["landing_page_headline"]}` : ""}
${campaign["landing_page_subheadline"] ? `Existing sub-headline direction: ${campaign["landing_page_subheadline"]}` : ""}\n`
      : "";

    const prompt = `Create a lead magnet kit for ${brandName}.
${campaignBlock}
Goal: ${data.goal}
Target audience: ${data.audience}
Main offer: ${data.offer}
Tone: ${data.tone}
${brains.grounding ? `BRAND CONTEXT (every fact about the business, offer, proof and CTA must come from here; never invent testimonials, prices or results):\n${brains.grounding}` : [brains.brandVoice && `Brand voice notes: ${brains.brandVoice}`, brains.brandAudience && `Brand audience notes: ${brains.brandAudience}`].filter(Boolean).join("\n")}


Return JSON exactly in this shape:
{
  "landing": {
    "hero": { "eyebrow": "", "headline": "", "subheadline": "", "cta_label": "" },
    "hero_image_prompt": "",
    "features": [ { "title": "", "body": "", "image_prompt": "" } ],
    "optin": { "heading": "", "body": "", "button_label": "", "privacy_note": "" }
  },
  "ebook": {
    "title": "", "subtitle": "", "author_line": "",
    "cover_image_prompt": "",
    "pages": [ { "heading": "", "intro": "", "paragraphs": [""], "bullets": [""] } ]
  }
}

Rules: exactly 3 features. Exactly 4 ebook pages, each with 2-3 paragraphs of 40-70 words and 3 bullets.
Every image prompt must be a full art-direction brief of 40-70 words covering, in this order:
subject, setting, camera or composition (angle, framing, depth of field), lighting, mood, and colour direction.
Describe photography or abstract art only. State explicitly that the image contains no text, letters, numbers or logos.
Never describe screens, UI, charts or documents with readable writing on them.
Image prompts should suit this visual style: ${visual}. Build the palette around ${primary} and ${secondary}.
The ebook cover_image_prompt must work as a square, print-quality cover with clear negative space at the centre for a title.`;

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
      throw new Error(`Generation failed (${res.status}): ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content as string | undefined;
    if (!raw) throw new Error("No content returned. Try again.");

    let parsed: any;
    try {
      parsed = JSON.parse(stripFence(raw));
    } catch {
      throw new Error("Could not read the generated layout. Try again.");
    }

    {
      const g = brainFromGrounding(brains.grounding);
      const checked = cleanForWorkspace(parsed, { ...(brains.brain ?? {}), ...g.brain }, { kind: "lead_magnet", verifiedContext: `${g.verifiedContext}\n${prompt}` }, { projectId: brains.projectId ?? null, generator: "magnet_kit" });
      parsed = checked.value;
      for (const k of ["hero_image_prompt"] as const) {
        const v = parsed?.landing?.[k];
        if (typeof v === "string") parsed.landing[k] = validateImagePrompt(v, brains.brain ?? {}, `${brains.grounding}\n${data.offer}`).cleaned;
      }
      if (typeof parsed?.ebook?.cover_image_prompt === "string")
        parsed.ebook.cover_image_prompt = validateImagePrompt(parsed.ebook.cover_image_prompt, brains.brain ?? {}, `${brains.grounding}\n${data.offer}`).cleaned;
    }
    const features = Array.isArray(parsed?.landing?.features)
      ? parsed.landing.features.slice(0, 3)
      : [];
    const pages = Array.isArray(parsed?.ebook?.pages) ? parsed.ebook.pages.slice(0, 6) : [];

    const styleSuffix = `. Style: ${visual}. Colour palette built around ${primary} and ${secondary}. No text, no words, no logos anywhere in the image.`;

    let heroUrl: string | null = null;
    let coverUrl: string | null = null;
    const featureUrls: (string | null)[] = features.map(() => null);

    if (!data.skip_images) {
      const jobs: Promise<void>[] = [];

      const heroBrief =
        (typeof parsed?.landing?.hero_image_prompt === "string" && parsed.landing.hero_image_prompt.trim()) ||
        `Wide cinematic hero graphic for a landing page about "${data.offer}"`;
      const coverBrief =
        (typeof parsed?.ebook?.cover_image_prompt === "string" && parsed.ebook.cover_image_prompt.trim()) ||
        `Square premium ebook cover artwork for a guide titled "${parsed?.ebook?.title ?? data.offer}"`;

      jobs.push(
        (async () => {
          const b64 = await generateImage(
            apiKey,
            `${heroBrief} Wide 16:9 landing page hero composition${styleSuffix}`,
          );
          if (b64) heroUrl = await uploadPng(userId, b64);
        })(),
      );

      jobs.push(
        (async () => {
          const b64 = await generateImage(
            apiKey,
            `${coverBrief} Square print-quality ebook cover artwork with calm negative space in the centre${styleSuffix}`,
          );
          if (b64) coverUrl = await uploadPng(userId, b64);
        })(),
      );

      features.forEach((f: any, i: number) => {
        jobs.push(
          (async () => {
            const b64 = await generateImage(
              apiKey,
              `${f?.image_prompt || `A square graphic representing "${f?.title || "a benefit"}"`} Square 1:1 composition${styleSuffix}`,
            );
            if (b64) featureUrls[i] = await uploadPng(userId, b64);
          })(),
        );
      });

      await Promise.allSettled(jobs);
    }

    const config: MagnetConfig = {
      brand: {
        name: brandName,
        primary_color: primary,
        secondary_color: secondary,
        accent_color: brains.accent || null,
        font: brains.font || null,
        radius: 14,
        logo_url: brains.logoUrl || ((brains.brand?.logo_url as string | null) ?? null),
      },

      landing: {
        hero: {
          eyebrow: parsed?.landing?.hero?.eyebrow ?? "Free guide",
          headline: parsed?.landing?.hero?.headline ?? data.offer,
          subheadline: parsed?.landing?.hero?.subheadline ?? "",
          cta_label: parsed?.landing?.hero?.cta_label ?? "Get the guide",
        },
        hero_image_url: heroUrl,
        features: features.map((f: any, i: number) => ({
          title: f?.title ?? "",
          body: f?.body ?? "",
          image_prompt: f?.image_prompt ?? "",
          image_url: featureUrls[i],
        })),
        optin: {
          heading: parsed?.landing?.optin?.heading ?? "Get your copy",
          body: parsed?.landing?.optin?.body ?? "",
          button_label: parsed?.landing?.optin?.button_label ?? "Send it over",
          privacy_note:
            parsed?.landing?.optin?.privacy_note ?? "No spam. Unsubscribe whenever you like.",
        },
      },
      ebook: {
        title: parsed?.ebook?.title ?? data.offer,
        subtitle: parsed?.ebook?.subtitle ?? "",
        author_line: parsed?.ebook?.author_line ?? brandName,
        cover_image_url: coverUrl,
        pages: pages.map((p: any) => ({
          heading: p?.heading ?? "",
          intro: p?.intro ?? "",
          paragraphs: Array.isArray(p?.paragraphs) ? p.paragraphs.filter(Boolean) : [],
          bullets: Array.isArray(p?.bullets) ? p.bullets.filter(Boolean) : [],
        })),
      },
    };

    return config;
  });

/**
 * Reads the saved Strategy Profile (business brain) plus brand brain and maps
 * it into the Lead Magnet brief so the form arrives pre-filled.
 */
export const getMagnetPrefill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string; campaignId?: string } | undefined) =>
    z
      .object({ projectId: z.string().uuid().optional(), campaignId: z.string().uuid().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const brains = await loadBrains({ userId, supabase }, data.projectId);
    const { brain, brand } = brains;

    // The campaign this brief is being built for takes priority over the
    // permanent profile, so switching campaign changes the wording.
    let campaign: Record<string, unknown> | null = null;
    if (data.campaignId) {
      const { data: c } = await supabase
        .from("campaigns")
        .select("campaign_title, campaign_theme, landing_page_headline, landing_page_subheadline")
        .eq("id", data.campaignId)
        .eq("user_id", userId)
        .maybeSingle();
      campaign = (c as Record<string, unknown> | null) ?? null;
    }

    const join = (...parts: (string | null | undefined)[]) =>
      parts.map((p) => (p ?? "").trim()).filter(Boolean).join("\n\n").slice(0, 1200);

    // The selected client's own profile leads; account-level notes only fill gaps.
    const audience =
      join(brain?.audience?.ideal_customer, brain?.audience?.pain_points) ||
      join(brand?.target_audience as string | null);
    const offer =
      join(
        brain?.ctas?.current_offer,
        brain?.ctas?.offer,
        brain?.business?.products_services,
      ) ||
      join(
        campaign?.["landing_page_subheadline"] as string | null,
        campaign?.["campaign_theme"] as string | null,
      );
    const goal =
      (join(campaign?.["campaign_theme"] as string | null) ||
        join(brain?.marketing?.business_goals)).slice(0, 600);
    const tone = (join(brain?.brand?.tone_of_voice) || join(brand?.brand_voice as string | null)).slice(0, 400);
    const visual = join(brain?.brand?.colors, brain?.brand?.fonts).slice(0, 600);

    return {
      has_profile: Boolean(audience || offer || goal || tone),
      source: campaign ? ("campaign" as const) : audience || offer ? ("profile" as const) : ("none" as const),
      goal,
      audience,
      offer,
      tone,
      visual_style: visual,
      brand_name: brains.brandName === "Your brand" ? "" : brains.brandName,
      primary_color: brains.primary,
      secondary_color: brains.secondary,
      accent_color: brains.accent,
      font_preference: brains.font,
    };

  });

/**
 * Everything the Lead Funnel needs for one campaign: the campaign's own
 * wording, plus the client's permanent Brand DNA design tokens.
 */
export const getCampaignFunnelContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid().optional(),
        campaignId: z.string().uuid().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const brains = await loadBrains({ userId, supabase }, data.projectId);
    const campaign = await loadCampaign({ userId, supabase }, data.campaignId);
    const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const hasCopy = Boolean(
      campaign &&
        (s(campaign["landing_page_headline"]) ||
          s(campaign["guide_title"]) ||
          campaign["lead_magnet_content"]),
    );
    // The whole designed kit is stored alongside the guide, so revisiting a
    // campaign shows what was built instead of paying to build it again.
    const stored = (campaign?.["lead_magnet_content"] ?? null) as Record<string, unknown> | null;
    const savedKit: MagnetConfig | null =
      stored && typeof stored === "object" && stored["landing"]
        ? ({
            brand: (stored["brand"] ?? { name: "", primary_color: "", secondary_color: "" }) as MagnetConfig["brand"],
            landing: stored["landing"] as MagnetConfig["landing"],
            ebook: {
              title: String(stored["title"] ?? ""),
              subtitle: String(stored["subtitle"] ?? ""),
              author_line: String(stored["author_line"] ?? ""),
              cover_image_url: (stored["cover_image_url"] as string | null) ?? null,
              pages: (Array.isArray(stored["pages"]) ? stored["pages"] : []) as MagnetConfig["ebook"]["pages"],
            },
          } satisfies MagnetConfig)
        : null;

    return {
      saved_kit: savedKit,
      campaign: campaign
        ? {
            id: campaign["id"] as string,
            title: s(campaign["campaign_title"]),
            theme: s(campaign["campaign_theme"]),
            duration: s(campaign["campaign_duration"]) || "90-day",
            headline: s(campaign["landing_page_headline"]),
            subheadline: s(campaign["landing_page_subheadline"]),
            guide_title: s(campaign["guide_title"]),
            has_copy: hasCopy,
          }
        : null,
      brand: {
        name: brains.brandName === "Your brand" ? "" : brains.brandName,
        primary_color: brains.primary,
        secondary_color: brains.secondary,
        accent_color: brains.accent,
        font_preference: brains.font,
        logo_url: brains.logoUrl || ((brains.brand?.logo_url as string | null) ?? null),
      },
    };
  });

const guideSection = z.object({
  section_heading: z.string().max(300).default(""),
  section_body: z.string().max(8000).default(""),
});

/** Writes a generated kit back onto the campaign it was built for. */
export const saveMagnetToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        headline: z.string().max(300),
        subheadline: z.string().max(600),
        guideTitle: z.string().max(300),
        guideIntro: z.string().max(4000),
        guideSections: z.array(guideSection).max(20),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        leadMagnetContent: z.any(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: readErr } = await supabase
      .from("campaigns")
      .select("asset_status")
      .eq("user_id", userId)
      .eq("id", data.campaignId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("That campaign isn't here any more.");

    const status = {
      ...(((row as { asset_status?: Record<string, string> }).asset_status ?? {}) as Record<string, string>),
      lead_magnet: "ready",
      landing_page: "ready",
    };

    const { error } = await supabase
      .from("campaigns")
      .update({
        landing_page_headline: data.headline,
        landing_page_subheadline: data.subheadline,
        guide_title: data.guideTitle,
        guide_intro: data.guideIntro,
        guide_sections: data.guideSections,
        lead_magnet_content: data.leadMagnetContent,
        asset_status: status,
      })
      .eq("user_id", userId)
      .eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Everything the Lead Funnel page needs to show one joined-up funnel for a
 * campaign: the opt-in page, the guide and how many leads have come in.
 */
export const getCampaignFunnelLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campaignId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [campaignRes, pageRes] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id, guide_title, guide_sections, landing_page_headline")
        .eq("user_id", userId)
        .eq("id", data.campaignId)
        .maybeSingle(),
      supabase
        .from("landing_pages")
        .select("id, title, slug, status, updated_at")
        .eq("user_id", userId)
        .eq("campaign_id", data.campaignId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const leadsRes = await supabase
      .from("landing_page_leads")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", data.campaignId);

    const c = campaignRes.data as Record<string, unknown> | null;
    const sections = Array.isArray(c?.["guide_sections"]) ? (c!["guide_sections"] as unknown[]) : [];
    const page = pageRes.data as Record<string, unknown> | null;
    return {
      guideReady: Boolean((c?.["guide_title"] as string | null)?.trim() || sections.length > 0),
      headlineReady: Boolean((c?.["landing_page_headline"] as string | null)?.trim()),
      page: page
        ? {
            id: page["id"] as string,
            title: (page["title"] as string) || "Opt-in page",
            slug: page["slug"] as string,
            status: page["status"] as string,
          }
        : null,
      leads: leadsRes.count ?? 0,
    };
  });

/**
 * Makes a branded cover graphic for a campaign's guide and stores it on the
 * campaign record so the public guide and the PDF both use the same artwork.
 */
export const generateGuideCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ campaignId: z.string().uuid(), projectId: z.string().uuid().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Image generation isn't set up for this workspace.");

    const { data: c, error } = await supabase
      .from("campaigns")
      .select("id, campaign_title, campaign_theme, guide_title, guide_intro, project_id")
      .eq("user_id", userId)
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("That campaign isn't here any more.");

    const brains = await loadBrains(
      { userId, supabase },
      data.projectId ?? ((c.project_id as string | null) ?? undefined),
    );
    const title =
      ((c.guide_title as string | null) ?? "").trim() || ((c.campaign_title as string) ?? "Guide");
    const theme = ((c.campaign_theme as string | null) ?? "").trim();

    const prompt =
      `Premium print-quality cover artwork for a business guide titled "${title}". ` +
      `Subject matter: ${theme || title}. Portrait A4 proportions, generous calm negative space ` +
      `in the upper middle for a title to be placed over it, confident editorial composition, ` +
      `soft depth and texture. Colour palette built around ${brains.primary} and ${brains.secondary}` +
      `${brains.accent ? ` with ${brains.accent} accents` : ""}. ` +
      `No text, no words, no letters, no logos anywhere in the image.`;

    const b64 = await generateImage(apiKey, prompt);
    if (!b64) throw new Error("The cover image didn't come back — try again in a moment.");
    const url = await uploadPng(userId, b64);
    if (!url) throw new Error("Couldn't store the cover image — try again.");

    const { error: upErr } = await supabase
      .from("campaigns")
      .update({ guide_cover_url: url })
      .eq("user_id", userId)
      .eq("id", data.campaignId);
    if (upErr) throw new Error(upErr.message);

    return { coverUrl: url };
  });

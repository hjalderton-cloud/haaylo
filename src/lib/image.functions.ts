import { resolveImageBrief } from "./image-grounding";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { BrainData } from "./brain-schema";
import { buildCarouselDesigns, resolveCarouselBrand } from "./carousel-design";

/** Upload a base64 PNG (from generateBrandImage) into scheduler-media under the user's folder. */
export const uploadGeneratedImageToScheduler = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { b64: string; mime?: string }) =>
    z.object({
      b64: z.string().min(10).max(20_000_000),
      mime: z.string().max(64).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const mime = data.mime ?? "image/png";
    const ext = mime.includes("jpeg") ? "jpg" : "png";
    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("scheduler-media")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw new Error(error.message);
    return { path };
  });

const SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;

/** Keeps the model away from literal readings of slang, idiom and metaphor. */
const LITERALISM_GUARD =
  'Do not render literal interpretations of casual phrases, slang, jokes or metaphors (for example "babysitting" must not produce babies, toys or dummies). Interpret the idea in terms of the real product, service and setting described above.';

/** Pull hex codes out of the dedicated colour fields, falling back to the free-text field. */
function brandHexes(brain: BrainData): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    if (!v) return;
    for (const m of v.match(/#[0-9a-fA-F]{3,8}/g) ?? []) {
      const hex = m.toUpperCase();
      if (!out.includes(hex)) out.push(hex);
    }
  };
  push(brain.brand?.primary_color);
  push(brain.brand?.secondary_color);
  push(brain.brand?.accent_color);
  push(brain.brand?.colors);
  return out.slice(0, 3);
}

/**
 * Works out the kind of scene the business actually belongs in, so the image
 * never falls back to a generic laptop-on-a-desk startup shot.
 */
function settingLine(brain: BrainData): string {
  const hay = [
    brain.business?.industry,
    brain.business?.products_services,
    brain.business?.name,
    brain.audience?.ideal_customer,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const has = (...keys: string[]) => keys.some((k) => hay.includes(k));

  if (has("blind", "shutter", "curtain", "window", "interior", "furnish", "flooring", "kitchen", "bathroom", "home improvement", "conservatory", "decor"))
    return "Setting: a real, lived-in British home interior — living room, kitchen-diner, bedroom or bay window — shot as interior-design editorial photography. Show the actual product fitted and in use, with honest daylight coming through the window. Tidy but believable: real furniture, real textures, nothing staged like a showroom advert.";
  if (has("restaurant", "cafe", "coffee", "bakery", "food", "catering", "pub", "bar"))
    return "Setting: a genuine hospitality space or close-up food photography — natural light, real plates, real texture, no plastic-looking styling.";
  if (has("salon", "beauty", "hair", "aesthetic", "spa", "nail", "barber"))
    return "Setting: a warm, calm salon or treatment-room interior with soft natural light and real detail.";
  if (has("builder", "construction", "trade", "plumb", "electric", "roof", "landscap", "garden"))
    return "Setting: real on-site or finished-project photography — craftsmanship, materials and finish in natural daylight.";
  if (has("shop", "retail", "boutique", "store", "product"))
    return "Setting: clean product or in-store photography with natural light and real surfaces.";
  if (has("fitness", "gym", "coach", "wellbeing", "yoga", "health", "clinic", "dental", "therapy"))
    return "Setting: a real practice, studio or clinic space, warm and human, in natural light.";
  if (has("consult", "account", "legal", "agency", "marketing", "software", "saas", "tech", "finance", "recruit"))
    return "Setting: a calm, modern professional environment — real desks, meetings or workspace detail in natural light, never a glossy stock-photo boardroom.";
  return "Setting: a real, relevant environment for this business, photographed naturally rather than staged.";
}

/**
 * Context-aware prompt builder: post theme + Strategy Profile + Brand Assets,
 * plus a fixed premium-quality style block.
 */
export function buildContextPrompt(opts: {
  concept: string;
  brain: BrainData;
  platform?: string | undefined;
  useBrandColors?: boolean | undefined;
  referenceNote?: string | undefined;
}): { prompt: string; brandContext: string; hexes: string[] } {
  const { concept, brain } = opts;
  const useColors = opts.useBrandColors !== false;
  const hexes = useColors ? brandHexes(brain) : [];
  const primary = hexes[0];
  const secondary = hexes[1] ?? hexes[0];

  const ctx: string[] = [];
  if (brain.business?.name) ctx.push(`Brand: ${brain.business.name}`);
  if (brain.business?.industry) ctx.push(`Industry / niche: ${brain.business.industry}`);
  const resolved = resolveImageBrief(brain, { topic: concept });
  if (resolved.product)
    ctx.push(`Product/service this image must show, not an abstract stand-in: ${resolved.product}`);
  if (brain.business?.location) ctx.push(`Where they work: ${brain.business.location}`);
  if (brain.audience?.ideal_customer)
    ctx.push(`Audience the image must appeal to: ${brain.audience.ideal_customer.slice(0, 300)}`);
  if (brain.audience?.pain_points)
    ctx.push(`What that audience struggles with: ${brain.audience.pain_points.slice(0, 300)}`);
  if (brain.brand?.tone_of_voice)
    ctx.push(`Tone and mood to convey visually: ${brain.brand.tone_of_voice.slice(0, 300)}`);
  const typeface = (brain.brand?.fonts ?? brain.brand?.font_preference ?? "").trim();
  if (useColors && typeface)
    ctx.push(`Typography feel of the brand (for mood only, render no text): ${typeface.slice(0, 200)}`);
  const brandContext = ctx.join(". ");

  const accent = hexes[2];
  const palette = [primary, secondary !== primary ? secondary : "", accent && accent !== primary && accent !== secondary ? accent : ""]
    .filter(Boolean)
    .join(", ");
  const colourRule = palette
    ? `Colour: keep the scene naturally lit and true to life. The brand colours (${palette}) may appear only as small real-world details within the scene — a cushion, a throw, a piece of styling — never as coloured lighting, tints, gradients or washes over the photograph. Daylight stays white and natural.`
    : `Colour: natural daylight, true-to-life colour, restrained and understated.`;

  const prompt = [
    concept.trim(),
    "",
    "---",
    "Brand context:",
    brandContext || "(no brand context supplied)",
    "",
    `Setting: ${resolveImageBrief(brain, { topic: concept }).setting}`,
    "",
    "Style requirements:",
    "Photorealistic editorial photography taken on a full-frame camera: authentic materials and textures, accurate perspective and straight architectural lines, soft natural daylight, gentle shadows, shallow but believable depth of field. Leave calm negative space for copy.",
    colourRule,
    "Strictly avoid: AI-render plastic surfaces, waxy or distorted faces and hands, impossible geometry, over-saturated or neon lighting, HDR glow, cartoon or 3D-render styles, cheesy stock cliches (handshakes, thumbs-up, posed laughing models), floating or garbled lettering, watermarks and logos.",
    "Render no text, words, numbers or logos inside the image.",
    LITERALISM_GUARD,
    opts.platform ? aspectLine(opts.platform) : "",
    opts.referenceNote ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  return { prompt, brandContext, hexes };
}

function aspectLine(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes("instagram") || p.includes("tiktok")) return "Square 1:1 composition.";
  if (p.includes("linkedin") || p.includes("facebook") || p.includes("x") || p.includes("twitter"))
    return "Wide landscape 16:9 composition.";
  return "";
}

/**
 * Generate a branded image using Lovable AI Gateway (Gemini 2.5 Flash Image – "Nano Banana").
 * Pulls brand context (name, colours, tone, industry) plus optional logo/reference
 * assets from the user's Strategy Profile and includes them in the request.
 * Returns a base64 PNG.
 */
export const generateBrandImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    prompt: string;
    projectId?: string;
    size?: (typeof SIZES)[number];
    useLogo?: boolean;
    referenceAssetIds?: string[];
  }) =>
    z.object({
      prompt: z.string().trim().min(3).max(1000),
      projectId: z.string().uuid().optional(),
      size: z.enum(SIZES).optional(),
      useLogo: z.boolean().optional(),
      referenceAssetIds: z.array(z.string().uuid()).max(3).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    // Resolve project — always the workspace the user picked, never a default
    const projectId = data.projectId;
    if (!projectId) throw new Error("Pick a workspace first, then try again.");
    const { data: owned } = await context.supabase
      .from("projects").select("id").eq("id", projectId).maybeSingle();
    if (!owned) throw new Error("Pick a workspace first, then try again.");

    // Brain
    const { data: brainRow } = await context.supabase
      .from("business_brains").select("data").eq("project_id", projectId).maybeSingle();
    const brain = (brainRow?.data ?? {}) as BrainData;

    // Assets
    const { data: assets } = await context.supabase
      .from("brain_assets")
      .select("id, kind, storage_path, label")
      .eq("project_id", projectId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const wantIds = new Set(data.referenceAssetIds ?? []);
    const referenceUrls: string[] = [];

    for (const a of assets ?? []) {
      const isLogo = a.kind === "logo" && data.useLogo !== false;
      const isRef = wantIds.has(a.id);
      if (!isLogo && !isRef) continue;
      const { data: signed } = await supabaseAdmin.storage
        .from("scheduler-media").createSignedUrl(a.storage_path, 60 * 10);
      if (signed?.signedUrl) referenceUrls.push(signed.signedUrl);
      if (referenceUrls.length >= 4) break;
    }

    const built = buildContextPrompt({
      concept: data.prompt,
      brain,
      referenceNote: referenceUrls.length
        ? "Reference images are attached (logo / brand assets). Match their style, colours and identity — do NOT distort the logo."
        : undefined,
    });
    const brandContext = built.brandContext;
    const fullPrompt = built.prompt;

    // Build OpenRouter-style content array (Gemini image model)
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } };
    const content: ContentPart[] = [{ type: "text", text: fullPrompt }];
    for (const url of referenceUrls) content.push({ type: "image_url", image_url: { url } });

    // Generate — the account's own OpenAI key first, gateway only as a fallback.
    const { openAiKey, openAiGenerate, openAiEdit } = await import("./openai-image.server");
    let b64: string | undefined;

    if (openAiKey()) {
      const size = (data.size ?? "1024x1024") as "1024x1024" | "1024x1536" | "1536x1024";
      b64 =
        (referenceUrls.length
          ? await openAiEdit({ prompt: fullPrompt, imageUrls: referenceUrls, size })
          : await openAiGenerate({ prompt: fullPrompt, size })) ?? undefined;
    } else {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content }],
          modalities: ["image", "text"],
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429) throw new Error("Rate limited — try again in a moment.");
        if (res.status === 402) throw new Error("Out of AI credits. Top up in Settings.");
        throw new Error(`Image generation failed (${res.status}): ${txt.slice(0, 200)}`);
      }

      const json = await res.json();
      b64 = json?.data?.[0]?.b64_json as string | undefined;
    }
    if (!b64) throw new Error("No image returned. Try a different prompt.");

    return {
      b64,
      mime: "image/png",
      brandContextUsed: brandContext,
      referenceCount: referenceUrls.length,
    };
  });

/**
 * One-click graphic for a written post: reads the caption, writes an optimised
 * visual prompt, generates a brand-consistent image and stores it in the
 * scheduler-media bucket. Returns a signed URL ready for the calendar/Zernio.
 */
export const generatePostGraphic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caption: string; title?: string; projectId?: string; platform?: string }) =>
    z.object({
      caption: z.string().trim().min(10).max(8000),
      title: z.string().max(300).optional(),
      projectId: z.string().uuid().optional(),
      platform: z.string().max(40).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const projectId = data.projectId;
    if (!projectId) throw new Error("Pick a workspace first, then try again.");
    const { data: owned } = await context.supabase
      .from("projects").select("id").eq("id", projectId).maybeSingle();
    if (!owned) throw new Error("Pick a workspace first, then try again.");

    const { data: brainRow } = await context.supabase
      .from("business_brains").select("data").eq("project_id", projectId).maybeSingle();
    const brain = (brainRow?.data ?? {}) as BrainData;

    // 1. Caption -> concise visual concept
    let visualPrompt = data.caption.slice(0, 400);
    try {
      const audience = brain.audience?.ideal_customer ?? "";
      const tone = brain.brand?.tone_of_voice ?? "";
      const offering = brain.business?.products_services ?? "";
      const industry = brain.business?.industry ?? "";
      const pr = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.7-flash",
          messages: [
            {
              role: "system",
              content:
                "You expand a social media caption into one short photography brief (max 60 words) for this specific business. Work out which of the business's real products or services the caption is about, then describe a photograph showing that product or service in its true setting, being used by the sort of customer this business serves. Never restate the caption's wording and never illustrate slang, idioms, jokes or metaphors literally. Describe one photorealistic scene: subject, room or location, camera angle, natural lighting. No abstract or symbolic stand-ins, no laptops or office desks unless the business genuinely sells them. No text, words, letters or logos in the image. Return only the brief." +
                (industry ? `\nIndustry: ${industry.slice(0, 200)}.` : "") +
                (offering ? `\nThe products and services to picture: ${offering.slice(0, 400)}.` : "") +
                (audience ? `\nThe image must appeal to: ${audience.slice(0, 200)}.` : "") +
                (tone ? `\nVisual mood should match this tone of voice: ${tone.slice(0, 200)}.` : ""),
            },
            { role: "user", content: `${data.title ? data.title + "\n\n" : ""}${data.caption.slice(0, 2500)}` },
          ],
        }),
      });
      if (pr.ok) {
        const pj = await pr.json();
        const t = pj?.choices?.[0]?.message?.content as string | undefined;
        if (t && t.trim().length > 10) visualPrompt = t.trim().slice(0, 600);
      }
    } catch { /* fall back to the caption itself */ }

    // Brand assets from this workspace, used as style references
    const brandRefUrls: string[] = [];
    {
      const { data: assets } = await context.supabase
        .from("brain_assets")
        .select("kind, storage_path")
        .eq("project_id", projectId)
        .in("kind", ["logo", "brand_guidelines"]);
      if (assets?.length) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (const a of assets) {
          const { data: signedRef } = await supabaseAdmin.storage
            .from("scheduler-media").createSignedUrl(a.storage_path as string, 60 * 10);
          if (signedRef?.signedUrl) brandRefUrls.push(signedRef.signedUrl);
          if (brandRefUrls.length >= 2) break;
        }
      }
    }

    const built = buildContextPrompt({
      concept: visualPrompt,
      brain,
      platform: data.platform ?? undefined,
      ...(brandRefUrls.length
        ? {
            referenceNote:
              "Brand reference images are attached (logo and brand guidelines). Match their colours and visual style. Do not copy or draw the logo itself into the image.",
          }
        : {}),
    });
    const fullPrompt = built.prompt;

    // 2. Generate — the account's own OpenAI key first, gateway only as a fallback.
    const { openAiKey, openAiGenerate, openAiEdit, sizeForPlatform } = await import("./openai-image.server");
    let b64: string | undefined;
    if (openAiKey()) {
      const size = sizeForPlatform(data.platform);
      b64 =
        (brandRefUrls.length
          ? await openAiEdit({ prompt: fullPrompt, imageUrls: brandRefUrls, size })
          : await openAiGenerate({ prompt: fullPrompt, size })) ?? undefined;
    } else {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: fullPrompt },
                ...brandRefUrls.map((url) => ({ type: "image_url", image_url: { url } })),
              ],
            },
          ],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429) throw new Error("Rate limited — try again in a moment.");
        if (res.status === 402) throw new Error("Out of AI credits. Top up in Settings.");
        throw new Error(`Image generation failed (${res.status}): ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      b64 = json?.data?.[0]?.b64_json as string | undefined;
    }
    if (!b64) throw new Error("No image returned. Try again.");

    // 3. Store + sign
    const path = `${context.userId}/generated/${crypto.randomUUID()}.png`;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from("scheduler-media")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: signed } = await supabaseAdmin.storage
      .from("scheduler-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    return { path, url: signed?.signedUrl ?? "", visualPrompt };
  });

/**
 * Refine an existing generated graphic with a text instruction.
 * Sends the original image back into the Gemini image model alongside the
 * edit prompt, stores the result, and returns a fresh signed URL.
 */
export const refinePostGraphic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { imagePath?: string; imageUrl?: string; instruction: string; projectId?: string; destination?: "scheduler" | "landing" }) =>
    z.object({
      imagePath: z.string().min(3).max(500).optional(),
      imageUrl: z.string().url().max(2000).optional(),
      instruction: z.string().trim().min(3).max(500),
      projectId: z.string().uuid().optional(),
      destination: z.enum(["scheduler", "landing"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    if (!data.imagePath && !data.imageUrl) throw new Error("No image supplied to refine.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve the source image bytes
    let sourceUrl = data.imageUrl ?? "";
    if (data.imagePath) {
      // Guard: users may only refine their own files
      if (!data.imagePath.startsWith(`${context.userId}/`)) throw new Error("That image does not belong to you.");
      const sourceBucket = data.destination === "landing" ? "landing-media" : "scheduler-media";
      const { data: signed, error } = await supabaseAdmin.storage
        .from(sourceBucket).createSignedUrl(data.imagePath, 60 * 10);
      if (error || !signed?.signedUrl) throw new Error("Could not load the original image.");
      sourceUrl = signed.signedUrl;
    }

    // Brand guardrails
    const projectId = data.projectId;
    if (!projectId) throw new Error("Pick a workspace first, then try again.");
    const { data: ownedProject } = await context.supabase
      .from("projects").select("id").eq("id", projectId).maybeSingle();
    if (!ownedProject) throw new Error("Pick a workspace first, then try again.");
    const { data: brainRow } = await context.supabase
      .from("business_brains").select("data").eq("project_id", projectId).maybeSingle();
    const brain = (brainRow?.data ?? {}) as BrainData;

    const brandRefUrls: string[] = [];
    const { data: assets } = await context.supabase
      .from("brain_assets")
      .select("kind, storage_path")
      .eq("project_id", projectId)
      .in("kind", ["logo", "brand_guidelines"]);
    for (const asset of assets ?? []) {
      const { data: signedRef } = await supabaseAdmin.storage
        .from("scheduler-media").createSignedUrl(asset.storage_path, 60 * 10);
      if (signedRef?.signedUrl) brandRefUrls.push(signedRef.signedUrl);
      if (brandRefUrls.length >= 2) break;
    }

    const editPrompt = buildContextPrompt({
      concept:
        `Edit this image. ${data.instruction}\n` +
        `Keep the same overall subject, composition and identity unless the instruction asks otherwise.`,
      brain,
      referenceNote: brandRefUrls.length
        ? "Brand reference images are attached. Keep the result consistent with their colours and visual identity."
        : undefined,
    }).prompt;

    // Refine — the account's own OpenAI key first, gateway only as a fallback.
    const { openAiKey, openAiEdit } = await import("./openai-image.server");
    let b64: string | undefined;
    if (openAiKey()) {
      b64 = (await openAiEdit({
        prompt: editPrompt,
        imageUrls: [sourceUrl, ...brandRefUrls],
      })) ?? undefined;
    } else {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: [
            { type: "text", text: editPrompt },
            { type: "image_url", image_url: { url: sourceUrl } },
            ...brandRefUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ] }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 429) throw new Error("Rate limited — try again in a moment.");
        if (res.status === 402) throw new Error("Out of AI credits. Top up in Settings.");
        throw new Error(`Image refine failed (${res.status}): ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      b64 = json?.data?.[0]?.b64_json as string | undefined;
    }
    if (!b64) throw new Error("No refined image returned. Try rewording the instruction.");

    const bucket = data.destination === "landing" ? "landing-media" : "scheduler-media";
    const path = `${context.userId}/generated/${crypto.randomUUID()}.png`;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: signed } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    return { path, url: signed?.signedUrl ?? "" };
  });

/**
 * Store a finished Design studio export (data URL PNG) in scheduler-media and
 * return a long-lived signed URL so it can be attached to a scheduled post.
 */
export const saveStudioDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dataUrl: string }) =>
    z.object({ dataUrl: z.string().min(32).max(25_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const match = /^data:(image\/(png|jpeg));base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Unsupported image data");
    const mime = match[1]!;
    const b64 = match[3]!;
    const ext = mime.includes("jpeg") ? "jpg" : "png";
    const path = `${context.userId}/studio/${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("scheduler-media")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw new Error(error.message);
    const { data: signed } = await supabaseAdmin.storage
      .from("scheduler-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return { path, url: signed?.signedUrl ?? "" };
  });

/**
 * Build a full on-brand carousel from a slide-script post: one square image per
 * slide, with the slide wording rendered on it. Slide 1 is the post image;
 * the rest are returned for the strip underneath.
 */
export const generatePostCarousel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    slides: { heading: string; body: string }[];
    projectId: string;
    title?: string;
  }) =>
    z.object({
      slides: z
        .array(
          z.object({
            heading: z.string().trim().max(200).default(""),
            body: z.string().trim().max(1200).default(""),
          }),
        )
        .min(2)
        .max(10),
      projectId: z.string().uuid(),
      title: z.string().max(300).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!project) throw new Error("That workspace isn't yours.");

    const [{ data: brainRow }, { data: assets }] = await Promise.all([
      context.supabase.from("business_brains").select("data").eq("project_id", data.projectId).maybeSingle(),
      context.supabase
        .from("brain_assets")
        .select("kind, storage_path, created_at")
        .eq("project_id", data.projectId)
        .in("kind", ["logo", "brand_guidelines"])
        .order("created_at", { ascending: false }),
    ]);
    const brain = (brainRow?.data ?? {}) as BrainData;
    const logo = assets?.find((asset) => asset.kind === "logo");
    const guide = assets?.find((asset) => asset.kind === "brand_guidelines");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sign = async (path?: string) => {
      if (!path) return null;
      const { data: signed } = await supabaseAdmin.storage.from("scheduler-media").createSignedUrl(path, 60 * 60);
      return signed?.signedUrl ?? null;
    };
    const [logoUrl, brandGuideUrl] = await Promise.all([sign(logo?.storage_path), sign(guide?.storage_path)]);
    const brand = resolveCarouselBrand({
      name: brain.business?.name,
      logoUrl,
      primary: brain.brand?.primary_color,
      secondary: brain.brand?.secondary_color,
      accent: brain.brand?.accent_color,
      colours: brain.brand?.colors,
      fonts: brain.brand?.fonts,
      fontPreference: brain.brand?.font_preference,
    });
    return {
      designs: buildCarouselDesigns(data.slides, brand),
      brand: { ...brand, brandGuideUrl },
    };
  });

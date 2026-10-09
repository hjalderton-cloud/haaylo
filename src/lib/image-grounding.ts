import type { BrainData } from "./brain-schema";

/**
 * Resolves what an image should show *before* any image prompt is written:
 * the one relevant product/service, the campaign objective, the setting,
 * the audience, the brand colours and the visual style. Every image writer
 * uses this so prompts never fall back to generic marketing imagery when
 * verified product or setting information exists.
 */
export type ResolvedImageBrief = {
  product: string | null;
  objective: string | null;
  setting: string;
  audience: string | null;
  colours: string[];
  style: string;
  /** Prompt-ready block. */
  block: string;
};

const STOP = new Set(["the", "and", "for", "with", "your", "our", "from", "that", "this", "into", "free", "new", "more", "about", "what", "will", "have", "are"]);
const tokens = (t: string) =>
  t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/s$/, ""));

/** Available product/service lines (coming-soon / unavailable lines are excluded). */
export function availableProducts(brain: BrainData): string[] {
  const raw = brain.business?.products_services ?? "";
  return raw
    .split(/\n|;|·|•/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/\[(coming soon|unavailable|not offered)\]/i.test(l))
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").replace(/\[(available|beta)\]/gi, "").trim())
    .filter((l) => l.length > 2);
}

const clean = (l: string) => l.replace(/[£$€]\s?\d[\d,.]*(\s*\/\s*\w+)?/g, "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 240);

export function pickProduct(brain: BrainData, topic: string): string | null {
  const lines = availableProducts(brain);
  const fallback = [brain.business?.name, brain.business?.industry].filter(Boolean).join(", ").slice(0, 160) || null;
  if (!lines.length) return fallback;
  const want = new Set(tokens(topic));
  let best = lines[0]!;
  let bestScore = 0;
  for (const l of lines) {
    const score = tokens(l).filter((w) => want.has(w)).length;
    if (score > bestScore) { best = l; bestScore = score; }
  }
  // No line matches the topic: show the business itself rather than an arbitrary (often priced) line.
  if (bestScore === 0) return fallback ?? clean(best);
  return clean(best);
}

export function settingFor(brain: BrainData, product: string | null): string {
  const hay = [product, brain.business?.industry, brain.business?.industry_descriptors, brain.business?.products_services, brain.business?.name]
    .filter(Boolean).join(" ").toLowerCase();
  const has = (...k: string[]) => k.some((x) => hay.includes(x));
  const loc = brain.business?.location?.trim() ?? "";
  const where = loc && loc.length <= 40 ? ` Location feel: ${loc}.` : "";
  if (has("blind", "shutter", "curtain", "window", "flyscreen", "awning", "conservatory", "interior", "flooring", "kitchen", "bathroom", "decor"))
    return `A real, lived-in British home: living room, bedroom, kitchen-diner, bay window, conservatory or patio door, whichever fits the product. The product is fitted and in use, with honest daylight through the window. Tidy but believable, never a showroom advert.${where}`;
  if (has("restaurant", "cafe", "coffee", "bakery", "food", "catering", "pub"))
    return `A genuine hospitality space or close-up food photography with real plates and texture.${where}`;
  if (has("salon", "beauty", "hair", "spa", "nail", "barber"))
    return `A calm salon or treatment room with real detail.${where}`;
  if (has("builder", "construction", "plumb", "electric", "roof", "landscap", "garden"))
    return `Real on-site or finished-project photography showing craftsmanship and materials.${where}`;
  if (has("fitness", "gym", "coach", "yoga", "clinic", "dental", "therapy"))
    return `A real practice, studio or clinic space, warm and human.${where}`;
  if (has("software", "saas", "platform", "marketing", "agency", "consult", "account", "recruit", "tech", "ai"))
    return `A small-business owner's real working day: a kitchen table, studio or shop counter with a laptop or phone showing work in progress, coffee, notebook. Calm and modern, never a glossy corporate boardroom or abstract tech graphic.${where}`;
  return `A real, relevant environment for this business, photographed naturally.${where}`;
}

export function brandColours(brain: BrainData): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    for (const m of (v ?? "").match(/#[0-9a-fA-F]{6}\b|\b(black|white|gold|pink|navy|cream|grey|green|blue|red|teal|silver|beige|purple|orange|yellow)\b/gi) ?? [])
      if (!out.includes(m.toLowerCase())) out.push(m.toLowerCase());
  };
  push(brain.brand?.primary_color); push(brain.brand?.secondary_color); push(brain.brand?.accent_color); push(brain.brand?.colors);
  return out.slice(0, 4);
}

export function resolveImageBrief(brain: BrainData, opts: { topic: string; objective?: string | null }): ResolvedImageBrief {
  const product = pickProduct(brain, `${opts.topic} ${opts.objective ?? ""}`);
  const setting = settingFor(brain, product);
  const audience = brain.audience?.ideal_customer?.trim().slice(0, 240) || null;
  const colours = brandColours(brain);
  const objective = opts.objective?.trim().slice(0, 240) || null;
  const style = "Photorealistic editorial photography, natural daylight, true-to-life colour, authentic materials, believable people if any.";
  const block = [
    "RESOLVED IMAGE BRIEF (use this; do not substitute generic marketing imagery):",
    product ? `- Product/service to show: ${product}` : "- Product/service: none saved; show the business's real work setting",
    objective ? `- Campaign objective: ${objective}` : "",
    `- Setting: ${setting}`,
    audience ? `- Audience it must feel relevant to: ${audience}` : "",
    colours.length ? `- Brand colours (${colours.join(", ")}): only as small real objects in the scene, never as lighting, tints or washes` : "",
    `- Visual style: ${style}`,
  ].filter(Boolean).join("\n");
  return { product, objective, setting, audience, colours, style, block };
}

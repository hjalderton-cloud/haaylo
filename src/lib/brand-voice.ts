// Shared prompt blocks that force every post writer in Haaylo to use the
// owner's real example posts and their saved calls to action. Pure functions —
// safe to import from server functions and from client components alike.

/* eslint-disable @typescript-eslint/no-explicit-any */

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type BrandVoice = {
  website: string;
  phrases: string;
  samples: string;
  ctaPrimary: string;
  ctaSecondary: string;
  ctaAlternative: string;
  ctaOffer: string;
  bridgeLine: string;
  commentCta: string;
};

/** Pulls the voice and call-to-action fields out of a Strategy Profile record. */
export function extractBrandVoice(brain: any, sampleLimit = 3000): BrandVoice {
  return {
    website: s(brain?.business?.website),
    phrases: s(brain?.founder?.signature_phrases),
    samples: s(brain?.founder?.sample_posts).slice(0, sampleLimit),
    ctaPrimary: s(brain?.ctas?.primary),
    ctaSecondary: s(brain?.ctas?.secondary),
    ctaAlternative: s(brain?.ctas?.alternative),
    ctaOffer: s(brain?.ctas?.offer),
    bridgeLine: s(brain?.ctas?.bridge_line),
    commentCta: s(brain?.ctas?.comment_cta),
  };
}

/** The owner's real calls to action, rendered for the prompt. */
export function ctaBlock(v: BrandVoice): string {
  const lines = [
    v.ctaPrimary && `Primary call to action: ${v.ctaPrimary}`,
    v.ctaSecondary && `Secondary call to action: ${v.ctaSecondary}`,
    v.ctaAlternative && `Alternative call to action: ${v.ctaAlternative}`,
    v.ctaOffer && `Offer call to action: ${v.ctaOffer}`,
    v.bridgeLine && `Bridge lines into the call to action (pick one that fits):\n${v.bridgeLine}`,
    v.website && `Website: ${v.website}`,
  ].filter(Boolean);
  if (!lines.length) return "";
  return `Calls to action — use these exactly as written, never invent new ones:
${lines.join("\n")}
${v.commentCta ? `Comment call to action (only where it fits): ${v.commentCta}` : "Never ask people to comment a keyword."}`;
}

/** Real posts the owner has written, used as style examples. */
export function voiceBlock(v: BrandVoice): string {
  return [
    v.phrases && `Signature phrases: ${v.phrases}`,
    v.samples &&
      `THESE ARE THE TEMPLATE. Posts the owner has actually written:\n"""\n${v.samples}\n"""\n` +
        `Match these exactly: the same opening hooks (seasonal, everyday, spoken-out-loud observations), the same short one- or two-sentence paragraphs with blank lines between them, the same use of emoji and tick/check bullet lists where they use them, the same sentence length, the same plain everyday words, and the same closing block with the phone number and website laid out the same way. ` +
        `Never write in a formal, explanatory or report-like register. If a sentence sounds like a brochure, a consultant or an essay ("Understanding the cost of…", "Our approach to…", "This allows us to…"), rewrite it as the owner would say it out loud. ` +
        `Speak directly to the reader as "you". Lead with a real-life moment or a concrete product detail, never with an abstract concept.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The non-negotiable sign-off rule appended to every post-writing prompt. */
export const SIGN_OFF_RULE =
  "Every post must end with a clear call to action taken from the list above, using the owner's own wording. Where the example posts close with contact details (phone number, website), close the same way and repeat those details exactly as written. Never invent a phone number, email, link or offer.";

/** Voice + CTA + sign-off rule, ready to append to a prompt. Empty when nothing is saved. */
export function voiceAndCtaPrompt(brain: any, sampleLimit = 3000): string {
  const v = extractBrandVoice(brain, sampleLimit);
  const parts = [voiceBlock(v), ctaBlock(v)].filter(Boolean);
  if (!parts.length) return "";
  return `${parts.join("\n")}\n${SIGN_OFF_RULE}`;
}

// Server-only: generates lead magnet concepts and nurture email sequences
// in the project's Strategy Profile voice via the AI gateway.
import { enforceUkEnglish } from "@/lib/first-post-ideas.server";
import { runCompliant, brainFromGrounding, type ContentKind } from "@/lib/brand-compliance.server";

const BANNED = [
  "crucial", "tapestry", "dive deep", "more than just", "look no further",
  "elevate", "testament", "game-changer", "foster", "unlock", "supercharge",
];


/** Wraps the central brand context (loadBrandContext().prompt) for this prompt. */
function groundingBlock(grounding: string): string {
  return grounding.trim() ? `\nSTRATEGY PROFILE (ground every business fact in this):\n${grounding.trim()}\n` : "";
}


const VOICE_RULES =
  "British English only (organisation, colour, whilst). Understated, direct, peer-over-coffee voice. " +
  "No American hype, no press-release cadence. " +
  `Never use: ${BANNED.join(", ")}. Never use antithesis phrasing such as "not X, it's Y". ` +
  "Use ## headers, **bold** for key points, - for bullets. No markdown code fences.";

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
    console.error("[funnel] request failed", err);
    throw new Error("Could not reach the AI. Try again in a moment.");
  }

  if (!response.ok) {
    const body = await response.text();
    console.error("[funnel] gateway error", response.status, body.slice(0, 400));
    if (response.status === 429) throw new Error("The AI is busy right now. Try again in a moment.");
    if (response.status === 402) throw new Error("AI credits have run out — top up to keep generating.");
    throw new Error("The AI could not finish that. Try again.");
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = (payload.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("The AI came back empty. Try again.");
  return enforceUkEnglish(text);
}

export type FunnelInputs = {
  problem: string;
  offer: string;
  magnetType: string;
  price: string;
};

export async function generateLeadMagnet(grounding: string, inputs: FunnelInputs): Promise<string> {
  const system = `You are a lead generation expert for small British businesses. You create specific, high-value lead magnets that convert. ${VOICE_RULES}`;
  const prompt = `${groundingBlock(grounding)}
Design a lead magnet:
Problem it solves: ${inputs.problem}
Format: ${inputs.magnetType}

## Lead Magnet Concept
- 3 title options (specific and irresistible — include a number or clear promise)
- Subtitle / one-line description
- Why this will convert for this audience

## Exact Contents / Structure
- Every section or page to include (be very specific)
- The quick win to deliver on page 1

## Opt-in Page Copy
- Headline
- 3 benefit bullets (what they'll get / feel / be able to do)
- Button text
- Trust line below button

## Delivery & Follow-up
- How to deliver it
- What to do in the first email after download

Grounding rules: this may create a new lead magnet concept from the inputs above, but every fact about the business, offer, proof, customer result, timeline, guarantee or CTA must come from the STRATEGY PROFILE. Do not invent case studies, testimonials, guarantees, prices or service details.`;

  return complyText(grounding, system, prompt, "funnel", "funnel.lead_magnet");
}

export async function generateEmailSequence(grounding: string, inputs: FunnelInputs): Promise<string> {
  const system = `You are an email copywriter who writes nurture sequences that build trust and turn leads into clients — never pushy or salesy. Write every email in full, ready to send. ${VOICE_RULES} Use ## Email N headers.`;
  const prompt = `${groundingBlock(grounding)}
Write a 5-email nurture sequence:
Problem: ${inputs.problem}
What we sell: ${inputs.offer}
Price point: ${inputs.price || "premium"}

Email arc: Welcome & deliver → Pure value → Problem agitation → Case study / social proof → Offer

For each email include: Subject line (and one alternative), preview text, then the full body. Sign off as the business. Keep each email under 200 words. Every fact about the business, results or pricing must come from the STRATEGY PROFILE — do not invent proof.`;

  return complyText(grounding, system, prompt, "email_body", "funnel.email_sequence");
}

/** Generate → brand checks → one targeted rewrite. Unresolved issues are appended as an editor's note, never hidden. */
async function complyText(grounding: string, system: string, prompt: string, kind: ContentKind, generator: string): Promise<string> {
  const { brain, verifiedContext } = brainFromGrounding(grounding);
  const { value, report } = await runCompliant({
    generate: (feedback) => callGateway(system, feedback ? `${prompt}\n\n${feedback}` : prompt),
    brain,
    options: { kind, verifiedContext },
    log: { projectId: null, generator },
  });
  if (report.status !== "needs_review") return value;
  return `${value}\n\n---\nHaaylo brand check: please review before using.\n${report.violations.map((v) => `- ${v}`).join("\n")}`;
}

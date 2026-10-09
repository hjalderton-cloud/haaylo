// Server-only: drafts comment replies and DMs in the project's Brain voice.
import { enforceUkEnglish } from "@/lib/first-post-ideas.server";

const BANNED = [
  "crucial", "tapestry", "dive deep", "more than just", "look no further",
  "elevate", "testament", "game-changer", "foster", "unlock", "supercharge",
];

export type LeadReplyDraft = { replies: string[]; dm: string };

function fallback(keyword: string, link: string): LeadReplyDraft {
  return {
    replies: [
      "Just sent it over 👍",
      "Sent — check your messages.",
      "On its way to your DMs now.",
    ],
    dm: link
      ? `Hi — you commented "${keyword}", so here it is: ${link}\n\nAny questions, just reply here.`
      : `Hi — you commented "${keyword}", so here's the link I promised. Any questions, just reply here.`,
  };
}

function clean(text: string): string {
  let out = enforceUkEnglish(text.trim().replace(/^["'\s]+|["'\s]+$/g, ""));
  for (const word of BANNED) {
    if (out.toLowerCase().includes(word)) return "";
  }
  if (/\bnot just\b|\bisn'?t just\b|\bwe'?re not\b.*\bwe'?re\b/i.test(out)) return "";
  return out;
}

function brainLine(brain: Record<string, unknown>, path: string[]): string {
  let node: unknown = brain;
  for (const key of path) {
    if (!node || typeof node !== "object") return "";
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" ? node : "";
}

export async function draftLeadReplies(
  brain: Record<string, unknown>,
  keyword: string,
  offerLink: string,
): Promise<LeadReplyDraft> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return fallback(keyword, offerLink);

  const context = [
    brainLine(brain, ["business", "name"]) && `Business: ${brainLine(brain, ["business", "name"])}`,
    brainLine(brain, ["business", "what_you_do"]) && `What they do: ${brainLine(brain, ["business", "what_you_do"])}`,
    brainLine(brain, ["brand", "tone_of_voice"]) && `Tone of voice: ${brainLine(brain, ["brand", "tone_of_voice"])}`,
    brainLine(brain, ["offer", "current_offer"]) && `Current offer: ${brainLine(brain, ["offer", "current_offer"])}`,
  ].filter(Boolean).join("\n");

  const system =
    "You write short social replies for a British business. British English only. " +
    "Understated, direct, peer-over-coffee voice. No American hype, no press-release cadence. " +
    "Never use: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, " +
    "game-changer, foster, unlock, supercharge. Never use antithesis phrasing such as \"not X, it's Y\". " +
    "Return strict JSON only.";

  const prompt =
    `${context ? context + "\n\n" : ""}Someone has commented the keyword "${keyword}" on a post to request something.\n` +
    `Write:\n` +
    `1. "replies": three public comment replies, each under 12 words, casual, acknowledging you've sent it.\n` +
    `2. "dm": one direct message under 60 words delivering ${offerLink ? `this link: ${offerLink}` : "the promised resource"}, ` +
    `warm and human, ending with an easy opening to reply.\n\n` +
    `JSON shape: {"replies": ["...","...","..."], "dm": "..."}`;

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
    console.error("[leads-ai] request failed", err);
    return fallback(keyword, offerLink);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error("[leads-ai] gateway error", response.status, body.slice(0, 400));
    if (response.status === 429) throw new Error("The AI is busy right now. Try again in a moment.");
    if (response.status === 402) throw new Error("AI credits have run out — top up to keep generating.");
    return fallback(keyword, offerLink);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) return fallback(keyword, offerLink);

  try {
    const parsed = JSON.parse(match[0]) as { replies?: unknown; dm?: unknown };
    const replies = Array.isArray(parsed.replies)
      ? parsed.replies.map((r) => clean(String(r))).filter(Boolean).slice(0, 3)
      : [];
    const dm = typeof parsed.dm === "string" ? clean(parsed.dm) : "";
    if (!replies.length || !dm) return fallback(keyword, offerLink);
    return { replies, dm };
  } catch {
    return fallback(keyword, offerLink);
  }
}

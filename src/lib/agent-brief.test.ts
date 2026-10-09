import { describe, expect, it } from "vitest";
import { blueprintSchema, coerceBlueprint } from "./agent-brief.functions";

/** The exact reply shape that used to fail with "couldn't put a plan together". */
const REAL_REPLY = {
  title: "Haaylo: Your Marketing Brain",
  goal: "Secure 25 founding members for the waitlist by 28th August.",
  duration: "30-day",
  audience: "Freelance social media managers juggling multiple small clients.",
  channels: ["LinkedIn", "Instagram"],
  theme: "Haaylo as the answer to repeated briefing and context switching.",
  assets: {
    socialPosts: true,
    landingPage: true,
    leadMagnet: false,
    emailSequence: true,
    imagePack: true,
    blog: false,
  },
  assetSummary: "5 LinkedIn posts, 3 Instagram posts, 1 landing page, 3 emails.",
  grounding: "Uses the stated USP and the Lily audience profile.",
};

describe("coerceBlueprint", () => {
  it("accepts an asset summary written as one sentence", () => {
    const parsed = blueprintSchema.safeParse(coerceBlueprint(REAL_REPLY));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.assetSummary).toEqual([
      "5 LinkedIn posts",
      "3 Instagram posts",
      "1 landing page",
      "3 emails",
    ]);
  });

  it("normalises a duration written in plain words", () => {
    for (const [input, expected] of [
      ["30 days", "30-day"],
      ["1 month", "30-day"],
      ["3 months", "90-day"],
      ["13 weeks", "90-day"],
      ["90-day", "90-day"],
    ] as const) {
      const out = coerceBlueprint({ ...REAL_REPLY, duration: input }) as { duration: string };
      expect(out.duration).toBe(expected);
    }
  });

  it("drops channels it does not support and keeps the rest", () => {
    const out = coerceBlueprint({
      ...REAL_REPLY,
      channels: ["linkedin", "TikTok", "Email"],
    }) as { channels: string[] };
    expect(out.channels).toEqual(["LinkedIn", "Email"]);
  });

  it("trims over-long text instead of rejecting the plan", () => {
    const parsed = blueprintSchema.safeParse(
      coerceBlueprint({ ...REAL_REPLY, theme: "x".repeat(900), title: "y".repeat(300) }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.theme.length).toBe(600);
  });
});

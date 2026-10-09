import { describe, expect, it } from "vitest";
import { formatStepDetails, summariseResult, TOOL_LABEL } from "./agent-step-presentation";

describe("goal step presentation", () => {
  it("uses plain labels and factual counts", () => {
    expect(TOOL_LABEL.fetch_brand_context).toBe("Read your Brand DNA");
    expect(summariseResult("create_social_content", { posts: [{}, {}, {}] })).toBe("3 posts drafted");
    expect(summariseResult("create_social_content", { posts: [{}] })).toBe("1 post drafted");
  });
  it("does not expose records as summary text", () => {
    expect(summariseResult("fetch_brand_context", { private: "brand details" })).toBe("");
    expect(summariseResult("create_campaign", null)).toBe("");
    expect(summariseResult("create_campaign", { campaign_title: "Launch" })).toBe("Launch");
  });
  it("caps detailed payloads and retains errors", () => {
    expect(formatStepDetails({}, "x".repeat(6000), null).length).toBeLessThan(4100);
    expect(formatStepDetails({}, null, "Failed")).toContain("Failed");
  });
});
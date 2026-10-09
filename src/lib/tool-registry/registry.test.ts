import { describe, it, expect } from "vitest";
import { catalogue, getTool, listToolNames } from "./catalogue";
import {
  fetchBrandContextInput,
  fetchStrategyInput,
  fetchPreviousContentInput,
  createSocialContentInput,
  createCampaignInput,
} from "./schemas";

const TEST_UUID = "00000000-0000-0000-0000-000000000000";

describe("tool registry catalogue", () => {
  it("has exactly 18 tools", () => {
    expect(catalogue).toHaveLength(18);
  });

  it("has unique names", () => {
    const names = catalogue.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every tool requires a workspace", () => {
    for (const tool of catalogue) {
      expect(tool.workspaceRequired).toBe(true);
    }
  });

  it("every tool has a backing action and file", () => {
    for (const tool of catalogue) {
      expect(tool.backingAction).toBeTruthy();
      expect(tool.backingFile).toBeTruthy();
    }
  });

  it("every tool has permissions", () => {
    for (const tool of catalogue) {
      expect(tool.permissions).toContain("authenticated");
      expect(tool.permissions).toContain("workspace_owner");
    }
  });
});

describe("risk and approval", () => {
  it("HIGH risk tools always require approval", () => {
    for (const tool of catalogue) {
      if (tool.risk === "HIGH") {
        expect(tool.approval).toBe("always");
      }
    }
  });

  it("MEDIUM risk tools require approval by default", () => {
    for (const tool of catalogue) {
      if (tool.risk === "MEDIUM") {
        expect(tool.approval).toBe("default");
      }
    }
  });

  it("LOW risk tools never require approval", () => {
    for (const tool of catalogue) {
      if (tool.risk === "LOW") {
        expect(tool.approval).toBe("never");
      }
    }
  });
});

describe("availability", () => {
  it("16 tools are executable", () => {
    const executable = catalogue.filter((t) => t.available);
    expect(executable).toHaveLength(16);
  });

  it("unavailable tools have a reason", () => {
    for (const tool of catalogue) {
      if (!tool.available) {
        expect(tool.unavailableReason).toBeTruthy();
      }
    }
  });

  it("only create_image and create_content_calendar are unavailable", () => {
    const blocked = catalogue.filter((t) => !t.available).map((t) => t.name).sort();
    expect(blocked).toEqual(["create_content_calendar", "create_image"]);
  });

  it("every executable non-LOW tool requires approval", () => {
    for (const tool of catalogue) {
      if (tool.available && tool.risk !== "LOW") {
        expect(tool.approval === "default" || tool.approval === "always").toBe(true);
      }
    }
  });

  it("create_content_calendar is unavailable with no backing action", () => {
    const tool = getTool("create_content_calendar");
    expect(tool).toBeDefined();
    expect(tool!.available).toBe(false);
    expect(tool!.backingAction).toBe("(none)");
  });

  it("schedule_content and publish_content always need approval", () => {
    expect(getTool("schedule_content")!.approval).toBe("always");
    expect(getTool("publish_content")!.approval).toBe("always");
  });
});

describe("schema validation", () => {
  it("every schema rejects missing workspaceId", () => {
    const schemas = [
      fetchBrandContextInput,
      fetchStrategyInput,
      fetchPreviousContentInput,
      createSocialContentInput,
      createCampaignInput,
    ];
    for (const schema of schemas) {
      const result = schema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join("."));
        expect(paths).toContain("workspaceId");
      }
    }
  });

  it("fetch_brand_context accepts workspaceId only", () => {
    const result = fetchBrandContextInput.safeParse({ workspaceId: TEST_UUID });
    expect(result.success).toBe(true);
  });

  it("fetch_strategy accepts workspaceId only", () => {
    const result = fetchStrategyInput.safeParse({ workspaceId: TEST_UUID });
    expect(result.success).toBe(true);
  });

  it("create_social_content requires caption", () => {
    const noCaption = createSocialContentInput.safeParse({ workspaceId: TEST_UUID });
    expect(noCaption.success).toBe(false);

    const withCaption = createSocialContentInput.safeParse({
      workspaceId: TEST_UUID,
      caption: "A test post",
    });
    expect(withCaption.success).toBe(true);
  });

  it("create_social_content defaults platform to linkedin", () => {
    const result = createSocialContentInput.parse({
      workspaceId: TEST_UUID,
      caption: "Test",
    });
    expect(result.platform).toBe("linkedin");
  });

  it("fetch_previous_content accepts optional filters", () => {
    const result = fetchPreviousContentInput.safeParse({
      workspaceId: TEST_UUID,
      status: "draft",
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  it("create_campaign requires title, theme and duration", () => {
    const minimal = createCampaignInput.safeParse({
      workspaceId: TEST_UUID,
      title: "Launch",
      theme: "Founding member offer",
      duration: "30-day",
      assets: {},
    });
    expect(minimal.success).toBe(true);
  });
});

describe("helpers", () => {
  it("getTool returns a tool by name", () => {
    const tool = getTool("fetch_brand_context");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("fetch_brand_context");
  });

  it("getTool returns undefined for unknown name", () => {
    expect(getTool("nonexistent_tool")).toBeUndefined();
  });

  it("listToolNames returns 18 names", () => {
    expect(listToolNames()).toHaveLength(18);
  });
});

import { describe, it, expect } from "vitest";
import {
  stableStringify,
  fingerprint,
  assertApprovalUsable,
  summarise,
  type ApprovalRow,
} from "./approvals.server";

const USER = "11111111-1111-1111-1111-111111111111";
const WS = "22222222-2222-2222-2222-222222222222";

function row(patch: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    user_id: USER,
    project_id: WS,
    tool_name: "create_campaign",
    risk: "MEDIUM",
    summary: "Create the campaign \"Launch\"",
    input: { workspaceId: WS, title: "Launch" },
    input_hash: "hash-a",
    status: "approved",
    reason: null,
    error: null,
    result: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    decided_at: new Date().toISOString(),
    executed_at: null,
    created_at: new Date().toISOString(),
    ...patch,
  };
}

const ARGS = { userId: USER, workspaceId: WS, toolName: "create_campaign", hash: "hash-a" };

describe("stable fingerprinting", () => {
  it("ignores key order", () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableStringify({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("drops undefined values", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it("same inputs give the same hash", async () => {
    const one = await fingerprint("create_campaign", WS, { title: "Launch", theme: "x" });
    const two = await fingerprint("create_campaign", WS, { theme: "x", title: "Launch" });
    expect(one).toBe(two);
  });

  it("changed inputs give a different hash", async () => {
    const one = await fingerprint("create_campaign", WS, { title: "Launch" });
    const two = await fingerprint("create_campaign", WS, { title: "Launch 2" });
    expect(one).not.toBe(two);
  });

  it("changed tool or workspace gives a different hash", async () => {
    const base = await fingerprint("create_campaign", WS, { title: "Launch" });
    expect(await fingerprint("save_asset", WS, { title: "Launch" })).not.toBe(base);
    expect(await fingerprint("create_campaign", USER, { title: "Launch" })).not.toBe(base);
  });
});

describe("approval fails closed", () => {
  it("accepts a matching approved row", () => {
    expect(() => assertApprovalUsable(row(), ARGS)).not.toThrow();
  });

  it("rejects a missing approval", () => {
    expect(() => assertApprovalUsable(null, ARGS)).toThrow(/not been approved/);
  });

  it("rejects a pending approval", () => {
    expect(() => assertApprovalUsable(row({ status: "pending" }), ARGS)).toThrow(/waiting/);
  });

  it("rejects a turned-down approval", () => {
    expect(() => assertApprovalUsable(row({ status: "rejected" }), ARGS)).toThrow(/turned down/);
  });

  it("rejects an already-used approval", () => {
    expect(() => assertApprovalUsable(row({ status: "executed" }), ARGS)).toThrow(/already been used/);
  });

  it("rejects another user's approval", () => {
    expect(() => assertApprovalUsable(row({ user_id: "other" }), ARGS)).toThrow(/someone else/);
  });

  it("rejects a different workspace", () => {
    expect(() => assertApprovalUsable(row({ project_id: "other" }), ARGS)).toThrow(/different workspace/);
  });

  it("rejects a different tool", () => {
    expect(() => assertApprovalUsable(row({ tool_name: "publish_content" }), ARGS)).toThrow(
      /different action/,
    );
  });

  it("rejects changed inputs", () => {
    expect(() => assertApprovalUsable(row({ input_hash: "hash-b" }), ARGS)).toThrow(/details changed/);
  });

  it("rejects an expired approval", () => {
    const stale = row({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(() => assertApprovalUsable(stale, ARGS)).toThrow(/expired/);
  });
});

describe("summaries", () => {
  it("names the campaign being created", () => {
    expect(summarise("create_campaign", { title: "Spring launch" })).toContain("Spring launch");
  });

  it("describes publishing in plain words", () => {
    expect(summarise("publish_content", {})).toMatch(/connected accounts/);
  });
});

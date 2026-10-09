import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getTool } from "./catalogue";
import { assertOwnedWorkspace } from "./guards";

/**
 * Stage 2 — the approval workflow.
 *
 * MEDIUM and HIGH risk tools cannot run on the Agent's say-so. The Agent raises
 * a request; the person approves or turns it down on the Approvals screen; only
 * then can the tool run, and only with the exact inputs that were approved.
 *
 * Nothing here trusts a caller-supplied "approved" flag: approval lives in the
 * database, bound to the user, workspace, tool and a hash of the inputs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

const APPROVAL_COLUMNS =
  "id, user_id, project_id, tool_name, risk, summary, input, input_hash, status, reason, error, result, expires_at, decided_at, executed_at, created_at";

function toolOrThrow(name: string) {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool "${name}".`);
  if (!tool.available) {
    throw new Error(tool.unavailableReason ?? "That action cannot run yet.");
  }
  return tool;
}

/** Raise an approval request for a tool the Agent wants to run. */
export const requestToolApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tool: z.string().min(1),
        workspaceId: z.string().uuid(),
        input: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const tool = toolOrThrow(data.tool);
    if (tool.approval === "never") {
      throw new Error("That action does not need approval.");
    }
    await assertOwnedWorkspace(ctx, data.workspaceId);

    const parsed = tool.inputSchema.parse({
      ...data.input,
      workspaceId: data.workspaceId,
    }) as Record<string, unknown>;

    const { fingerprint, summarise, APPROVAL_TTL_MS } = await import("./approvals.server");
    const hash = await fingerprint(tool.name, data.workspaceId, parsed);

    const { data: row, error } = await ctx.supabase
      .from("agent_approvals")
      .insert({
        user_id: ctx.userId,
        project_id: data.workspaceId,
        tool_name: tool.name,
        risk: tool.risk,
        summary: summarise(tool.name, parsed),
        input: parsed,
        input_hash: hash,
        status: "pending",
        expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
      })
      .select(APPROVAL_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row as never;
  });

/** Everything waiting on the person, plus recent decisions. */
export const listToolApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected", "executed", "failed"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    let q = ctx.supabase
      .from("agent_approvals")
      .select(APPROVAL_COLUMNS)
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as never;
  });

/** Approve or turn down a pending request. Approving does not run anything. */
export const decideToolApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        approvalId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().max(600).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: existing, error: readErr } = await ctx.supabase
      .from("agent_approvals")
      .select(APPROVAL_COLUMNS)
      .eq("user_id", ctx.userId)
      .eq("id", data.approvalId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing) throw new Error("That request is no longer here.");
    if (existing.status !== "pending") throw new Error("That request has already been decided.");

    const { data: row, error } = await ctx.supabase
      .from("agent_approvals")
      .update({
        status: data.decision === "approve" ? "approved" : "rejected",
        reason: data.reason ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq("user_id", ctx.userId)
      .eq("id", data.approvalId)
      .eq("status", "pending")
      .is("executed_at", null)
      .select(APPROVAL_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row as never;
  });

/**
 * Run a tool.
 *
 * LOW risk tools run straight away. Anything else needs an approval row that is
 * approved, unexpired, unused, and raised for these exact inputs. The approval
 * is marked used as soon as it runs, so it cannot be replayed.
 */
export const runRegistryTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tool: z.string().min(1),
        workspaceId: z.string().uuid(),
        input: z.record(z.string(), z.unknown()).default({}),
        approvalId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const tool = toolOrThrow(data.tool);
    await assertOwnedWorkspace(ctx, data.workspaceId);

    const parsed = tool.inputSchema.parse({
      ...data.input,
      workspaceId: data.workspaceId,
    }) as Record<string, unknown>;

    const { executeTool } = await import("./runners.server");

    if (tool.approval === "never") {
      const result = await executeTool(ctx, tool.name, parsed);
      return { ok: true, result } as never;
    }

    const approvalsMod = await import("./approvals.server");
    const checkUsable: typeof approvalsMod.assertApprovalUsable = approvalsMod.assertApprovalUsable;
    const hash = await approvalsMod.fingerprint(tool.name, data.workspaceId, parsed);

    if (!data.approvalId) throw new Error("That action needs your approval first.");

    const { data: approval, error } = await ctx.supabase
      .from("agent_approvals")
      .select(APPROVAL_COLUMNS)
      .eq("user_id", ctx.userId)
      .eq("id", data.approvalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    checkUsable(approval, {
      userId: ctx.userId,
      workspaceId: data.workspaceId,
      toolName: tool.name,
      hash,
    });

    // Atomically consume this approval before executing; concurrent clicks fail closed.
    const claimed = await ctx.supabase.from("agent_approvals")
      .update({ executed_at: new Date().toISOString() })
      .eq("id", data.approvalId).eq("user_id", ctx.userId)
      .eq("status", approval.status).is("executed_at", null).select("id").maybeSingle();
    if (claimed.error) throw new Error(claimed.error.message);
    if (!claimed.data) throw new Error("That action is already running or has been dealt with.");
    try {
      const result = await executeTool(ctx, tool.name, parsed);
      await ctx.supabase
        .from("agent_approvals")
        .update({
          status: "executed",
          executed_at: new Date().toISOString(),
          result: (result ?? null) as never,
          error: null,
        })
        .eq("user_id", ctx.userId)
        .eq("id", data.approvalId);
      return { ok: true, result } as never;
    } catch (err) {
      const message = err instanceof Error ? err.message : "That action could not be completed.";
      await ctx.supabase
        .from("agent_approvals")
        .update({
          status: "failed",
          executed_at: new Date().toISOString(),
          error: message,
        })
        .eq("user_id", ctx.userId)
        .eq("id", data.approvalId);
      throw new Error(message);
    }
  });

/** Approve and run in one step, straight from the Approvals screen. */
export const approveAndRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ approvalId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: approval, error } = await ctx.supabase
      .from("agent_approvals")
      .select(APPROVAL_COLUMNS)
      .eq("user_id", ctx.userId)
      .eq("id", data.approvalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!approval) throw new Error("That request is no longer here.");
    if (approval.status !== "pending" && approval.status !== "approved") {
      throw new Error("That request has already been dealt with.");
    }
    const tool = toolOrThrow(approval.tool_name as string);
    await assertOwnedWorkspace(ctx, approval.project_id as string);

    const input = (approval.input ?? {}) as Record<string, unknown>;
    const { fingerprint } = await import("./approvals.server");
    const hash = await fingerprint(tool.name, approval.project_id as string, input);
    if (hash !== approval.input_hash) {
      throw new Error("The details of that request no longer match — ask again.");
    }
    if (approval.expires_at && Date.parse(approval.expires_at as string) < Date.now()) {
      throw new Error("That request has expired — ask again.");
    }

    const { executeTool } = await import("./runners.server");
    const stamp = new Date().toISOString();
    // Atomically consume this approval before executing; concurrent clicks fail closed.
    const claimed = await ctx.supabase.from("agent_approvals")
      .update({ executed_at: new Date().toISOString() })
      .eq("id", data.approvalId).eq("user_id", ctx.userId)
      .eq("status", approval.status).is("executed_at", null).select("id").maybeSingle();
    if (claimed.error) throw new Error(claimed.error.message);
    if (!claimed.data) throw new Error("That action is already running or has been dealt with.");

    try {
      const result = await executeTool(ctx, tool.name, input);
      await ctx.supabase
        .from("agent_approvals")
        .update({
          status: "executed",
          decided_at: approval.decided_at ?? stamp,
          executed_at: stamp,
          result: (result ?? null) as never,
          error: null,
        })
        .eq("user_id", ctx.userId)
        .eq("id", data.approvalId);
      return { ok: true, result } as never;
    } catch (err) {
      const message = err instanceof Error ? err.message : "That action could not be completed.";
      await ctx.supabase
        .from("agent_approvals")
        .update({
          status: "failed",
          decided_at: approval.decided_at ?? stamp,
          executed_at: stamp,
          error: message,
        })
        .eq("user_id", ctx.userId)
        .eq("id", data.approvalId);
      throw new Error(message);
    }
  });

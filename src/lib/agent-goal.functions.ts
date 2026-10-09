import { readGoalTrail, approvalStepState } from "./agent-goal-state";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnedWorkspace } from "./tool-registry/guards";

/**
 * Goal CRUD for the multi-step goal agent.
 *
 * A goal is a natural-language aim the agent works towards across one or more
 * streaming runs. Each tool call the agent makes is logged as a step row, so the
 * user always has a trail of what the agent did — including actions it paused
 * for approval. The streaming route (`src/routes/api/agent-goal.ts`) writes the
 * step rows as it runs; these functions own the non-streaming reads and writes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

const GOAL_COLUMNS = "id, user_id, project_id, goal, status, summary, created_at, updated_at";
const STEP_COLUMNS =
  "id, goal_id, user_id, project_id, tool_name, input, status, result, error, approval_id, created_at";

export type GoalRow = {
  id: string;
  user_id: string;
  project_id: string;
  goal: string;
  status: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalStepRow = {
  id: string;
  goal_id: string;
  user_id: string;
  project_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  status: string;
  result: unknown;
  error: string | null;
  approval_id: string | null;
  created_at: string;
};

export type GoalWithSteps = GoalRow & { steps: GoalStepRow[] };

/** Create a new goal row (status "running"). Returns the new id. */
export const createGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), goal: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { data: row, error } = await ctx.supabase
      .from("agent_goals")
      .insert({
        user_id: ctx.userId,
        project_id: data.workspaceId,
        goal: data.goal,
        status: "running",
      })
      .select(GOAL_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row as GoalRow;
  });

/** List goals for a workspace, newest first. */
export const listGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    // A goal left "running" with no movement for 15 minutes is a dead session;
    // quietly mark it stopped so the list tells the truth. Continue still works.
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await ctx.supabase
      .from("agent_goals")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .eq("status", "running")
      .lt("updated_at", staleBefore);
    const { data: rows, error } = await ctx.supabase
      .from("agent_goals")
      .select(GOAL_COLUMNS)
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as GoalRow[];
  });

/** One goal with its step trail. */
export const getGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), goalId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const [goalRes, stepsRes] = await Promise.all([
      ctx.supabase
        .from("agent_goals")
        .select(GOAL_COLUMNS)
        .eq("user_id", ctx.userId)
        .eq("id", data.goalId)
        .eq("project_id", data.workspaceId)
        .maybeSingle(),
      readGoalTrail(ctx, data.workspaceId, data.goalId),
    ]);
    if (goalRes.error) throw new Error(goalRes.error.message);
    if (!goalRes.data) throw new Error("That goal is no longer here.");
    return {
      ...(goalRes.data as GoalRow),
      steps: stepsRes as GoalStepRow[],
    } as GoalWithSteps as never;
  });

/** Server-side helper (not a server fn): write a step row. Used by the route. */
export async function logGoalStep(
  ctx: Ctx,
  args: {
    goalId: string;
    workspaceId: string;
    toolName: string;
    input: Record<string, unknown>;
    status: GoalStepRow["status"];
    result?: unknown;
    error?: string | null;
    approvalId?: string | null;
  },
): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("agent_goal_steps")
    .insert({
      goal_id: args.goalId,
      user_id: ctx.userId,
      project_id: args.workspaceId,
      tool_name: args.toolName,
      input: args.input,
      status: args.status,
      result: (args.result ?? null) as never,
      error: args.error ?? null,
      approval_id: args.approvalId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Server-side helper: mark a goal's status and summary. */
export async function setGoalStatus(
  ctx: Ctx,
  goalId: string,
  status: GoalRow["status"],
  summary?: string | null,
): Promise<void> {
  const { error } = await ctx.supabase
    .from("agent_goals")
    .update({
      status,
      ...(summary !== undefined ? { summary } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", ctx.userId)
    .eq("id", goalId)
    .eq("status", "running");
  if (error) throw new Error(error.message);
}

/** Mark the step tied to an approval as approved+executed (or rejected). */
export const finishGoalStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        approvalId: z.string().uuid(),
        status: z.enum(["ok", "approved", "rejected", "error"]),
        result: z.unknown().optional(),
        error: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const approval = await ctx.supabase.from("agent_approvals").select("status,result,error,expires_at").eq("user_id", ctx.userId).eq("project_id", data.workspaceId).eq("id", data.approvalId).single();
    if (approval.error) throw new Error(approval.error.message);
    const { error } = await ctx.supabase
      .from("agent_goal_steps")
      .update({
        ...approvalStepState(approval.data),
      })
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .eq("approval_id", data.approvalId);
    if (error) throw new Error(error.message);
    return { ok: true } as never;
  });

/** Remove a goal and its step trail. Approvals and anything created stay put. */
export const deleteGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), goalId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { error } = await ctx.supabase
      .from("agent_goals")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .eq("id", data.goalId);
    if (error) throw new Error(error.message);
    return { ok: true } as never;
  });

/** Stop a running goal. It is paused, not failed, so it can be picked up again. */
export const cancelGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), goalId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const { error } = await ctx.supabase
      .from("agent_goals")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .eq("id", data.goalId);
    if (error) throw new Error(error.message);
    return { ok: true } as never;
  });

/** Pick a paused or stopped goal back up. */
export const resumeGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), goalId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOwnedWorkspace(ctx, data.workspaceId);
    const steps = await readGoalTrail(ctx, data.workspaceId, data.goalId);
    if (steps.some((s: GoalStepRow) => s.status === "awaiting_approval")) throw new Error("Approve or turn down the waiting actions before continuing.");
    const { error } = await ctx.supabase
      .from("agent_goals")
      .update({ status: "running", summary: null, updated_at: new Date().toISOString() })
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .eq("id", data.goalId);
    if (error) throw new Error(error.message);
    return { ok: true } as never;
  });

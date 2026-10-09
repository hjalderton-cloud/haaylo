import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GOAL_KEYS = ["leads", "launch", "visibility", "bookings", "event", "nurture", "sell"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctxOf = (context: any) => ({ userId: context.userId as string, supabase: context.supabase });

export const getOrchestratorDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { defaultsFor, latestRun } = await import("./marketing-orchestrator.server");
    const ctx = ctxOf(context);
    const [defaults, run] = await Promise.all([defaultsFor(ctx, data.workspaceId), latestRun(ctx, data.workspaceId)]);
    return { defaults, run };
  });

export const startOrchestration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        goal: z.enum(GOAL_KEYS),
        offer: z.string().trim().max(200).default(""),
        launchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
        platforms: z.array(z.string().trim().toLowerCase().max(20)).max(8).default([]),
        postsPerWeek: z.number().int().min(1).max(7).default(3),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { startRun } = await import("./marketing-orchestrator.server");
    return startRun(ctxOf(context), data);
  });

export const stepOrchestration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { stepRun } = await import("./marketing-orchestrator.server");
    return stepRun(ctxOf(context), data.runId);
  });

const idIn = (key: string) => (d: unknown) => z.object({ [key]: z.string().uuid() }).parse(d) as Record<string, string>;

export const getRunReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idIn("runId"))
  .handler(async ({ data, context }) => {
    const { runReview } = await import("./marketing-orchestrator.server");
    return runReview(ctxOf(context), data["runId"]!);
  });

export const approveAllCompliant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idIn("runId"))
  .handler(async ({ data, context }) => {
    const { approveCompliant } = await import("./marketing-orchestrator.server");
    return approveCompliant(ctxOf(context), data["runId"]!);
  });

export const approveOnePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idIn("postId"))
  .handler(async ({ data, context }) => {
    const { approvePost } = await import("./marketing-orchestrator.server");
    return approvePost(ctxOf(context), data["postId"]!);
  });

export const regenerateOnePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idIn("postId"))
  .handler(async ({ data, context }) => {
    const { regeneratePost } = await import("./marketing-orchestrator.server");
    return regeneratePost(ctxOf(context), data["postId"]!);
  });

export const approveOneVisual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idIn("itemId"))
  .handler(async ({ data, context }) => {
    const { approveVisual } = await import("./marketing-orchestrator.server");
    return approveVisual(ctxOf(context), data["itemId"]!);
  });

export const editOnePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid(), caption: z.string().trim().min(1).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { editPost } = await import("./marketing-orchestrator.server");
    return editPost(ctxOf(context), data.postId, data.caption);
  });

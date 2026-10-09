import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateNinetyDayPlan, type StrategyPlan } from "@/lib/strategy.server";

const planSchema = z.object({
  name: z.string().max(120).optional(),
  goal: z.string().max(1000).default(""),
  pillars: z
    .array(
      z.object({
        name: z.string().max(120),
        description: z.string().max(500).default(""),
        topics: z.array(z.string().max(300)).max(12).default([]),
      }),
    )
    .max(6)
    .default([]),
  weeks: z
    .array(
      z.object({
        week: z.number().int().min(1).max(13),
        theme: z.string().max(200),
        focus: z.string().max(500).default(""),
        pillar: z.string().max(120).default(""),
      }),
    )
    .max(13)
    .default([]),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

async function requireOwnedProject(context: Ctx, projectId: string): Promise<string> {
  const { data: project, error } = await context.supabase
    .from("projects")
    .select("id")
    .eq("user_id", context.userId)
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project?.id) throw new Error("That workspace is not available.");
  return project.id as string;
}

async function loadBrain(context: Ctx, projectId: string | null): Promise<Record<string, unknown>> {
  if (!projectId) return {};
  const { data: row } = await context.supabase
    .from("business_brains")
    .select("data")
    .eq("project_id", projectId)
    .maybeSingle();
  return (row?.data as Record<string, unknown> | undefined) ?? {};
}

function scoped(query: any, projectId: string | null) {
  return projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
}

export const getStrategyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) =>
    z.object({ projectId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx: Ctx = { userId: context.userId, supabase: context.supabase };
    const projectId = await requireOwnedProject(ctx, data.projectId);
    const { data: row } = await scoped(
      context.supabase.from("strategy_plans").select("plan, updated_at").eq("user_id", context.userId),
      projectId,
    ).maybeSingle();
    return {
      plan: (row?.plan as StrategyPlan | undefined) ?? null,
      updatedAt: (row?.updated_at as string | undefined) ?? null,
    };
  });

export const saveStrategyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ plan: planSchema, projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx: Ctx = { userId: context.userId, supabase: context.supabase };
    const projectId = await requireOwnedProject(ctx, data.projectId);
    await writePlan(ctx, projectId, data.plan);
    return { ok: true };
  });

async function writePlan(ctx: Ctx, projectId: string | null, plan: unknown) {
  const { data: existing } = await scoped(
    ctx.supabase.from("strategy_plans").select("id").eq("user_id", ctx.userId),
    projectId,
  ).maybeSingle();
  const stamp = new Date().toISOString();
  const { error } = existing?.id
    ? await ctx.supabase.from("strategy_plans").update({ plan, updated_at: stamp }).eq("id", existing.id)
    : await ctx.supabase
        .from("strategy_plans")
        .insert({ user_id: ctx.userId, project_id: projectId, plan, updated_at: stamp });
  if (error) throw new Error(error.message);
}

export const generateStrategyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        goal: z.string().max(500).default(""),
        name: z.string().max(120).optional(),
        postsPerWeek: z.number().int().min(1).max(14).default(3),
        projectId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx: Ctx = { userId: context.userId, supabase: context.supabase };
    const projectId = await requireOwnedProject(ctx, data.projectId);
    const brain = await loadBrain(ctx, projectId);
    const hasBrain = Object.values(brain).some(
      (s) => s && typeof s === "object" && Object.values(s as object).some((v) => typeof v === "string" && v.trim()),
    );
    if (!hasBrain) {
      throw new Error("Set up your Strategy Profile first — the plan is built from it.");
    }
    const { loadBrandContext } = await import("@/lib/brand-context.server");
    const { prompt: grounding } = await loadBrandContext(ctx, projectId);
    const plan = await generateNinetyDayPlan(grounding, data);
    await writePlan(ctx, projectId, plan);
    const { fileStrategy } = await import("@/lib/packages.server");
    await fileStrategy(ctx, projectId, plan as never);
    return { plan };
  });

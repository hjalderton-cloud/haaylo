import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AgentSettingsRow = {
  id: string;
  user_id: string;
  project_id: string;
  mode: "draft" | "review" | "auto";
  cadence: "weekly" | "daily";
  platforms: string[];
  posts_per_run: number;
  approval_email: string | null;
  active: boolean;
  paused: boolean;
  tone_override: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentRunRow = {
  id: string;
  kind: string;
  status: string;
  summary: string | null;
  post_ids: string[];
  created_at: string;
};

const settingsInput = z.object({
  project_id: z.string().uuid().nullable().optional(),
  mode: z.enum(["draft", "review", "auto"]).default("review"),
  cadence: z.enum(["weekly", "daily"]).default("weekly"),
  platforms: z.array(z.string().min(1).max(40)).min(1).max(6).default(["linkedin"]),
  posts_per_run: z.number().int().min(1).max(7).default(3),
  approval_email: z.string().email().nullish(),
  active: z.boolean().default(false),
  paused: z.boolean().default(false),
  tone_override: z.string().max(1200).nullish(),
});


// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveProjectId(supabase: any, userId: string, projectId?: string | null): Promise<string | null> {
  if (projectId) return projectId;
  const { data: p } = await supabase
    .from("projects").select("id").eq("user_id", userId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  return p?.id ?? null;
}

/** Returns the agent settings for a workspace (one row per project). */
export const getAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string | null }) => z.object({ projectId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<AgentSettingsRow | null> => {
    const projectId = await resolveProjectId(context.supabase, context.userId, data.projectId);
    if (!projectId) return null;
    const { data: row } = await context.supabase
      .from("agent_settings")
      .select("*")
      .eq("user_id", context.userId)
      .eq("project_id", projectId)
      .maybeSingle();
    return (row as AgentSettingsRow) ?? null;
  });

/** Upserts agent settings for a workspace. */
export const saveAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settingsInput.parse(d))
  .handler(async ({ data, context }): Promise<AgentSettingsRow> => {
    const projectId = await resolveProjectId(context.supabase, context.userId, data.project_id);
    if (!projectId) throw new Error("No workspace found");
    const row = { ...data, project_id: projectId, user_id: context.userId };
    const { data: saved, error } = await context.supabase
      .from("agent_settings")
      .upsert(row, { onConflict: "user_id,project_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved as AgentSettingsRow;
  });

/** Lists recent agent runs for a workspace. */
export const listAgentRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string | null }) => z.object({ projectId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<AgentRunRow[]> => {
    const projectId = await resolveProjectId(context.supabase, context.userId, data.projectId);
    if (!projectId) return [];
    const { data: rows, error } = await context.supabase
      .from("agent_runs")
      .select("id, kind, status, summary, post_ids, created_at")
      .eq("user_id", context.userId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (rows ?? []) as AgentRunRow[];
  });

/** Lets the user trigger a plan run on demand. Drafts only — never publishes. */
export const triggerAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string | null }) => z.object({ projectId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; drafted?: number; error?: string }> => {
    const projectId = await resolveProjectId(context.supabase, context.userId, data.projectId);
    if (!projectId) return { ok: false, error: "No workspace found" };
    const { data: settings } = await context.supabase
      .from("agent_settings")
      .select("*")
      .eq("user_id", context.userId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!settings) return { ok: false, error: "Save your agent settings first" };
    if (settings.paused) return { ok: false, error: "The agent is paused. Resume it in settings." };

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "AI is not configured" };

    const { data: run } = await context.supabase
      .from("agent_runs")
      .insert({
        user_id: context.userId,
        project_id: projectId,
        kind: "weekly_plan",
        status: "running",
        summary: "Drafting posts",
      })
      .select("id")
      .single();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runWeeklyPlan } = await import("./agent.server");
    const result = await runWeeklyPlan(supabaseAdmin, settings as never, key, run?.id ?? null);

    if (run?.id) {
      await context.supabase
        .from("agent_runs")
        .update({
          status: result.drafted.length ? "drafted" : "failed",
          summary: result.error ?? `Agent drafted ${result.drafted.length} posts for your review`,
        })
        .eq("id", run.id);
    }

    await context.supabase
      .from("agent_settings")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", settings.id);

    return {
      ok: result.drafted.length > 0,
      drafted: result.drafted.length,
      error: result.error,
    };
  });

/** The user's live social accounts, so the UI can say where a post will land. */
export const listAgentAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listLiveConnections } = await import("./agent-publish.server");
    const connections = await listLiveConnections(context.supabase, context.userId);
    return { accounts: connections.map((c) => ({ id: c.id, provider: c.provider, name: c.display_name })) };
  });


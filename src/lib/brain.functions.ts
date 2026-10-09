import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { BrainData } from "./brain-schema";

// ---------- projects ----------

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, name, is_default, created_at")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string }) => z.object({ name: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: proj, error } = await context.supabase
      .from("projects")
      .insert({ user_id: context.userId, name: data.name, is_default: false })
      .select("id, name, is_default")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("business_brains").insert({ project_id: proj.id, data: {} });
    return proj;
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name: string }) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").update({ name: data.name }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("projects").select("is_default").eq("id", data.id).maybeSingle();
    if (row?.is_default) throw new Error("Can't delete the default workspace");
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // unset old default, set new
    await context.supabase
      .from("projects")
      .update({ is_default: false })
      .eq("user_id", context.userId)
      .eq("is_default", true);
    const { error } = await context.supabase
      .from("projects")
      .update({ is_default: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDefaultProjectId(supabase: any, userId: string, isAnonymous = false): Promise<string> {
  if (isAnonymous) {
    throw new Error("Sign in required to access workspaces");
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("is_default", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data.id;

  // Fall back to any existing project for this user
  const { data: any1 } = await supabase
    .from("projects")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (any1) {
    await supabase.from("projects").update({ is_default: true }).eq("id", any1.id);
    return any1.id;
  }

  // Auto-create a default workspace on first access
  const { data: created, error: insErr } = await supabase
    .from("projects")
    .insert({ user_id: userId, name: "My Workspace", is_default: true })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  await supabase.from("business_brains").insert({ project_id: created.id, data: {} });
  return created.id;
}

// ---------- brain ----------

export const getBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string }) => z.object({ projectId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    // Anonymous users have no persisted workspace — return an empty brain
    // instead of throwing so the client can render State A (welcome).
    if (context.claims?.is_anonymous && !data.projectId) {
      return { projectId: "", data: {} as BrainData, updated_at: null };
    }
    const projectId = data.projectId ?? (await getDefaultProjectId(context.supabase, context.userId, !!context.claims?.is_anonymous));
    const { data: row, error } = await context.supabase
      .from("business_brains")
      .select("data, updated_at")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      projectId,
      data: (row?.data ?? {}) as BrainData,
      updated_at: row?.updated_at ?? null,
    };
  });

export const updateBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string; data: BrainData }) =>
    z.object({ projectId: z.string().uuid().optional(), data: z.record(z.string(), z.any()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const projectId = data.projectId ?? (await getDefaultProjectId(context.supabase, context.userId, !!context.claims?.is_anonymous));
    // upsert
    const { error } = await context.supabase
      .from("business_brains")
      .upsert({ project_id: projectId, data: data.data as unknown as BrainData }, { onConflict: "project_id" });
    if (error) throw new Error(error.message);
    return { ok: true, projectId };
  });

// ---------- history ----------

export const listHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string; module?: string; q?: string; limit?: number }) =>
    z.object({
      projectId: z.string().uuid().optional(),
      module: z.string().max(40).optional(),
      q: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const projectId = data.projectId ?? (await getDefaultProjectId(context.supabase, context.userId, !!context.claims?.is_anonymous));
    let q = context.supabase
      .from("marketing_history")
      .select("id, module, title, created_at, tokens")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.module) q = q.eq("module", data.module);
    if (data.q) {
      const safe = data.q.replace(/[%,()]/g, "");
      q = q.or(`title.ilike.%${safe}%,output.ilike.%${safe}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getHistoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("marketing_history")
      .select("id, module, title, prompt, output, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- director ----------

type Recommendation = {
  title: string;
  why: string;
  module: "brand_voice" | "strategy" | "content" | "funnel" | "analytics" | "scheduler";
  cta: string;
  href: string;
  effort: "5 min" | "15 min" | "30 min" | "1 hour";
};

export const getDirector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string; refresh?: boolean }) =>
    z.object({ projectId: z.string().uuid().optional(), refresh: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const projectId = data.projectId ?? (await getDefaultProjectId(context.supabase, context.userId, !!context.claims?.is_anonymous));

    // use cached if < 24h and not refresh
    if (!data.refresh) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await context.supabase
        .from("director_recommendations")
        .select("id, recommendations, generated_at, completed_keys")
        .eq("project_id", projectId)
        .gte("generated_at", since)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached) return {
        projectId,
        id: cached.id as string,
        generated_at: cached.generated_at,
        recommendations: cached.recommendations as Recommendation[],
        completed_keys: (cached.completed_keys ?? []) as string[],
      };
    }

    // load brain + recent history
    const [{ data: brainRow }, { data: history }] = await Promise.all([
      context.supabase.from("business_brains").select("data").eq("project_id", projectId).maybeSingle(),
      context.supabase
        .from("marketing_history")
        .select("module, title, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const { brainToPromptContext } = await import("./brain-schema");
    const brainCtx = brainToPromptContext((brainRow?.data ?? {}) as BrainData);
    const recent = (history ?? [])
      .map((h) => `- [${h.module}] ${h.title ?? "(untitled)"} — ${new Date(h.created_at).toDateString()}`)
      .join("\n");

    const system = `You are the AI Marketing Director for a small business. Read the business brain and recent marketing activity, then recommend the 3 to 5 highest-impact next actions for today. Return strict JSON only matching: {"recommendations":[{"title":string,"why":string,"module":"brand_voice"|"strategy"|"content"|"funnel"|"analytics"|"scheduler","cta":string,"href":string,"effort":"5 min"|"15 min"|"30 min"|"1 hour"}]}. Use these hrefs: brand_voice="/#brand", strategy="/#strategy", content="/#content", funnel="/#funnel", analytics="/#analytics", scheduler="/scheduler". No markdown.`;

    const user = `${brainCtx || "(Business brain is empty — recommend filling it as one of the actions.)"}

RECENT ACTIVITY (last 30):
${recent || "(none yet)"}

Today: ${new Date().toDateString()}`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`Director AI failed: ${res.status}`);
    const json = await res.json();
    const text: string = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { recommendations?: Recommendation[] };
    try { parsed = JSON.parse(text); } catch { parsed = {}; }
    const recs = (parsed.recommendations ?? []).slice(0, 5);

    // cache
    const { data: saved } = await context.supabase
      .from("director_recommendations")
      .insert({ project_id: projectId, recommendations: recs, completed_keys: [] })
      .select("id, generated_at")
      .single();

    // record in history
    await context.supabase.from("marketing_history").insert({
      project_id: projectId,
      user_id: context.userId,
      module: "director",
      title: `Director recommendations — ${new Date().toDateString()}`,
      prompt: { system, user },
      output: JSON.stringify(recs, null, 2),
    });

    return {
      projectId,
      id: saved?.id as string,
      generated_at: saved?.generated_at ?? new Date().toISOString(),
      recommendations: recs,
      completed_keys: [] as string[],
    };
  });

export function recKey(title: string): string {
  return (title || "").trim().toLowerCase().slice(0, 200);
}

export const setDirectorRecCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; key: string; completed: boolean }) =>
    z.object({ id: z.string().uuid(), key: z.string().min(1).max(200), completed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error: readErr } = await context.supabase
      .from("director_recommendations")
      .select("completed_keys")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const current: string[] = (row?.completed_keys ?? []) as string[];
    const next = data.completed
      ? Array.from(new Set([...current, data.key]))
      : current.filter((k) => k !== data.key);
    const { error } = await context.supabase
      .from("director_recommendations")
      .update({ completed_keys: next })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, completed_keys: next };
  });

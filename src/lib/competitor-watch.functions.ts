import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fingerprint, looksLikeUrl, readSite, toUrl } from "./site-read";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

export type CompetitorWatch = {
  id: string;
  competitor_name: string;
  competitor_url: string;
  platform: string;
  enabled: boolean;
  last_checked_at: string | null;
  created_at: string;
};

export type CompetitorSignal = {
  id: string;
  watch_id: string;
  competitor_name: string;
  summary: string;
  pillar: string;
  angle_title: string;
  angle_brief: string;
  status: string;
  created_at: string;
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const str = (v: unknown, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);

async function assertOwnsProject(ctx: Ctx, projectId: string): Promise<string> {
  const { data } = await ctx.supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!data) throw new Error("Pick a workspace first, then try again.");
  if (data.user_id !== ctx.userId) throw new Error("That workspace isn't yours.");
  return projectId;
}

async function loadPillars(ctx: Ctx, projectId: string): Promise<string[]> {
  const { data } = await ctx.supabase
    .from("strategy_plans")
    .select("plan")
    .eq("user_id", ctx.userId)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = ((data as any)?.plan ?? null) as Record<string, any> | null;
  const pillars = Array.isArray(plan?.pillars) ? plan!.pillars : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pillars.map((p: any) => str(p?.name)).filter(Boolean).slice(0, 6);
}

const SYSTEM = [
  "You are a British content strategist watching a competitor's website for a small brand.",
  "Write in UK English. Understated, direct, peer-over-coffee voice. No hype, no press-release cadence.",
  "Never use these words or phrasings: crucial, tapestry, dive deep, more than just, look no further, elevate, testament, game-changer, foster, unlock, supercharge, or 'not X, it's Y'.",
  "Their site copy has changed since the last check. Say plainly what looks new or different, then propose one response post this brand could write.",
  "Base everything on the copy supplied. If the change looks trivial (a date, a typo, a cookie banner), say so in summary and keep the angle empty.",
  'Return JSON only: {"summary":"","pillar":"","angle_title":"","angle_brief":""}',
  "summary: one or two sentences on what has moved. pillar: which of the brand's pillars it touches, or the closest fit.",
  "angle_brief: 2-3 sentences a writer could work from straight away.",
].join("\n");

function friendly(status: number): string {
  if (status === 429) return "The AI is busy right now — try again in a moment.";
  if (status === 402) return "You've run out of AI credits. Top them up, then try again.";
  return "The check didn't finish. Try again in a moment.";
}

async function askJson(prompt: string): Promise<Record<string, unknown>> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI isn't set up for this workspace.");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(friendly(res.status));
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = (json.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toWatch = (row: any): CompetitorWatch => ({
  id: row.id,
  competitor_name: str(row.competitor_name, "Competitor"),
  competitor_url: str(row.competitor_url),
  platform: str(row.platform, "all"),
  enabled: row.enabled !== false,
  last_checked_at: row.last_checked_at ?? null,
  created_at: row.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toSignal = (row: any): CompetitorSignal => ({
  id: row.id,
  watch_id: row.watch_id,
  competitor_name: str(row.competitor_name, "Competitor"),
  summary: str(row.summary),
  pillar: str(row.pillar),
  angle_title: str(row.angle_title),
  angle_brief: str(row.angle_brief),
  status: str(row.status, "new"),
  created_at: row.created_at,
});

export const listWatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CompetitorWatch[]> => {
    const ctx = context as unknown as Ctx;
    const projectId = await assertOwnsProject(ctx, data.projectId);
    const { data: rows, error } = await ctx.supabase
      .from("competitor_watch")
      .select("id, competitor_name, competitor_url, platform, enabled, last_checked_at, created_at")
      .eq("user_id", ctx.userId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map(toWatch);
  });

export const setWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        competitorName: z.string().trim().min(1).max(200),
        competitorUrl: z.string().trim().min(3).max(500),
        platform: z.string().trim().max(30).default("all"),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CompetitorWatch | null> => {
    const ctx = context as unknown as Ctx;
    const projectId = await assertOwnsProject(ctx, data.projectId);
    if (!looksLikeUrl(data.competitorUrl)) {
      throw new Error("Weekly watching needs their website address.");
    }
    const url = toUrl(data.competitorUrl);

    if (!data.enabled) {
      const { error } = await ctx.supabase
        .from("competitor_watch")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("project_id", projectId)
        .eq("competitor_url", url);
      if (error) throw new Error(error.message);
      return null;
    }

    const { data: row, error } = await ctx.supabase
      .from("competitor_watch")
      .upsert(
        {
          user_id: ctx.userId,
          project_id: projectId,
          competitor_name: data.competitorName.slice(0, 200),
          competitor_url: url,
          platform: data.platform || "all",
          enabled: true,
        },
        { onConflict: "project_id,competitor_url" },
      )
      .select("id, competitor_name, competitor_url, platform, enabled, last_checked_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return toWatch(row);
  });

export const runWatchCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        watchId: z.string().uuid().optional(),
        /** Only check watches that are at least a week stale. */
        staleOnly: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ checked: number; signals: CompetitorSignal[] }> => {
    const ctx = context as unknown as Ctx;
    const projectId = await assertOwnsProject(ctx, data.projectId);

    let query = ctx.supabase
      .from("competitor_watch")
      .select("id, competitor_name, competitor_url, platform, enabled, last_checked_at, last_fingerprint, created_at")
      .eq("user_id", ctx.userId)
      .eq("project_id", projectId)
      .eq("enabled", true);
    if (data.watchId) query = query.eq("id", data.watchId);
    const { data: rows, error } = await query.limit(10);
    if (error) throw new Error(error.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const due = ((rows ?? []) as any[]).filter((w) => {
      if (!data.staleOnly) return true;
      if (!w.last_checked_at) return true;
      return Date.now() - new Date(w.last_checked_at).getTime() > WEEK_MS;
    });
    if (due.length === 0) return { checked: 0, signals: [] };

    const pillars = await loadPillars(ctx, projectId);
    const signals: CompetitorSignal[] = [];
    let checked = 0;

    for (const w of due.slice(0, 5)) {
      const site = await readSite(w.competitor_url);
      checked += 1;
      if (site.text.length < 200) {
        await ctx.supabase
          .from("competitor_watch")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", w.id);
        continue;
      }
      const print = fingerprint(site.text);
      const first = !w.last_fingerprint;
      const changed = !first && print !== w.last_fingerprint;

      await ctx.supabase
        .from("competitor_watch")
        .update({ last_checked_at: new Date().toISOString(), last_fingerprint: print })
        .eq("id", w.id);

      if (!changed) continue;

      const prompt = [
        `COMPETITOR: ${w.competitor_name} (${w.competitor_url})`,
        pillars.length ? `THIS BRAND'S CONTENT PILLARS: ${pillars.join(", ")}` : "This brand has no pillars saved yet.",
        "",
        "THEIR SITE COPY AS IT READS NOW:",
        site.text,
      ].join("\n");

      let json: Record<string, unknown> = {};
      try {
        json = await askJson(prompt);
      } catch {
        continue;
      }
      const summary = str(json["summary"]).slice(0, 800);
      if (!summary) continue;

      const { data: inserted, error: insErr } = await ctx.supabase
        .from("competitor_signals")
        .insert({
          user_id: ctx.userId,
          project_id: projectId,
          watch_id: w.id,
          competitor_name: str(w.competitor_name, "Competitor").slice(0, 200),
          summary,
          pillar: str(json["pillar"]).slice(0, 120),
          angle_title: str(json["angle_title"]).slice(0, 200),
          angle_brief: str(json["angle_brief"]).slice(0, 1200),
          status: "new",
        })
        .select("id, watch_id, competitor_name, summary, pillar, angle_title, angle_brief, status, created_at")
        .single();
      if (!insErr && inserted) signals.push(toSignal(inserted));
    }

    return { checked, signals };
  });

export const listSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), limit: z.number().int().min(1).max(30).default(10) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CompetitorSignal[]> => {
    const ctx = context as unknown as Ctx;
    const projectId = await assertOwnsProject(ctx, data.projectId);
    const { data: rows, error } = await ctx.supabase
      .from("competitor_signals")
      .select("id, watch_id, competitor_name, summary, pillar, angle_title, angle_brief, status, created_at")
      .eq("user_id", ctx.userId)
      .eq("project_id", projectId)
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map(toSignal);
  });

export const dismissSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        signalId: z.string().uuid(),
        status: z.enum(["dismissed", "saved"]).default("dismissed"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const ctx = context as unknown as Ctx;
    const projectId = await assertOwnsProject(ctx, data.projectId);
    const { error } = await ctx.supabase
      .from("competitor_signals")
      .update({ status: data.status })
      .eq("id", data.signalId)
      .eq("user_id", ctx.userId)
      .eq("project_id", projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Saves a signal's angle into the Content Bank as an idea. */
export const saveSignalToBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), signalId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const ctx = context as unknown as Ctx;
    const projectId = await assertOwnsProject(ctx, data.projectId);
    const { data: sig } = await ctx.supabase
      .from("competitor_signals")
      .select("id, competitor_name, summary, angle_title, angle_brief")
      .eq("id", data.signalId)
      .eq("user_id", ctx.userId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!sig) throw new Error("That suggestion has gone.");

    const title = str(sig.angle_title) || `Response to ${str(sig.competitor_name, "a competitor")}`;
    const body = [str(sig.angle_brief), str(sig.summary) ? `What moved: ${str(sig.summary)}` : ""]
      .filter(Boolean)
      .join("\n\n");

    const { error } = await ctx.supabase.from("content_bank_items").insert({
      user_id: ctx.userId,
      project_id: projectId,
      kind: "idea",
      title: title.slice(0, 200),
      body,
      tags: ["competitor-watch"],
      collection: str(sig.competitor_name).slice(0, 80) || null,
      meta: { signal_id: sig.id, competitor: str(sig.competitor_name) },
    });
    if (error) throw new Error(error.message);

    await ctx.supabase
      .from("competitor_signals")
      .update({ status: "saved" })
      .eq("id", sig.id)
      .eq("user_id", ctx.userId);
    return { ok: true };
  });

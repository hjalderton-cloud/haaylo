import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const KINDS = [
  "post","blog","email","headline","hook","cta","campaign","idea","image_prompt","image","asset","other",
] as const;

export const listBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId?: string;
    kind?: string;
    collection?: string;
    tag?: string;
    q?: string;
    favourite?: boolean;
    archived?: boolean;
    limit?: number;
  }) =>
    z.object({
      projectId: z.string().uuid().optional(),
      kind: z.enum(KINDS).optional(),
      collection: z.string().max(80).optional(),
      tag: z.string().max(40).optional(),
      q: z.string().max(120).optional(),
      favourite: z.boolean().optional(),
      archived: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("content_bank_items")
      .select("id, project_id, kind, title, body, tags, collection, is_favourite, is_archived, meta, created_at, updated_at")
      .order("is_favourite", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.collection) q = q.eq("collection", data.collection);
    if (data.tag) q = q.contains("tags", [data.tag]);
    q = q.eq("is_archived", data.archived ?? false);
    if (data.favourite) q = q.eq("is_favourite", true);
    if (data.q) {
      const safe = data.q.replace(/[%,()]/g, "");
      q = q.or(`title.ilike.%${safe}%,body.ilike.%${safe}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveToBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string;
    kind: (typeof KINDS)[number];
    title?: string;
    body?: string;
    tags?: string[];
    collection?: string;
    source_history_id?: string;
    meta?: Record<string, unknown>;
  }) =>
    z.object({
      projectId: z.string().uuid(),
      kind: z.enum(KINDS),
      title: z.string().max(200).optional(),
      body: z.string().max(20000).optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      collection: z.string().max(80).optional(),
      source_history_id: z.string().uuid().optional(),
      meta: z.record(z.string(), z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("content_bank_items")
      .insert({
        project_id: data.projectId,
        user_id: context.userId,
        kind: data.kind,
        title: data.title ?? null,
        body: data.body ?? null,
        tags: data.tags ?? [],
        collection: data.collection ?? null,
        source_history_id: data.source_history_id ?? null,
        meta: data.meta ?? {},
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateBankItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    title?: string | null;
    body?: string | null;
    tags?: string[];
    collection?: string | null;
    is_favourite?: boolean;
    is_archived?: boolean;
    meta?: Record<string, unknown>;
  }) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().max(200).nullable().optional(),
      body: z.string().max(20000).nullable().optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      collection: z.string().max(80).nullable().optional(),
      is_favourite: z.boolean().optional(),
      is_archived: z.boolean().optional(),
      meta: z.record(z.string(), z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["title","body","tags","collection","is_favourite","is_archived","meta"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    const { error } = await context.supabase
      .from("content_bank_items")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBankItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("content_bank_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateBankItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error: readErr } = await context.supabase
      .from("content_bank_items")
      .select("project_id, kind, title, body, tags, collection, meta")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!src) throw new Error("Item not found");
    const { data: row, error } = await context.supabase
      .from("content_bank_items")
      .insert({
        project_id: src.project_id,
        user_id: context.userId,
        kind: src.kind,
        title: src.title ? `${src.title} (copy)` : null,
        body: src.body,
        tags: src.tags,
        collection: src.collection,
        meta: src.meta,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/**
 * Rewrites an archived bank item against the workspace's current Business
 * Brain and saves the refreshed version as a NEW bank item. The original is
 * never overwritten.
 */
export const refreshBankItemWithBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; instruction?: string }) =>
    z.object({ id: z.string().uuid(), instruction: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: src, error: readErr } = await context.supabase
      .from("content_bank_items")
      .select("id, project_id, kind, title, body, tags, collection, meta")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!src) throw new Error("Item not found");
    if (!src.body || !src.body.trim()) throw new Error("This item has no content to refresh.");

    const { data: brainRow } = await context.supabase
      .from("business_brains")
      .select("data")
      .eq("project_id", src.project_id)
      .maybeSingle();
    const brain = (brainRow?.data ?? {}) as Record<string, Record<string, string | undefined>>;
    const { BRAIN_SECTIONS } = await import("./brain-schema");
    const lines: string[] = [];
    for (const s of BRAIN_SECTIONS) {
      const sect = brain[s.key as string];
      if (!sect) continue;
      const entries = s.fields
        .map((f) => {
          const v = sect[f.key];
          return v && String(v).trim() ? `  - ${f.label}: ${String(v).trim()}` : null;
        })
        .filter(Boolean) as string[];
      if (entries.length) lines.push(`${s.title}:`, ...entries);
    }
    if (!lines.length) throw new Error("This workspace's Strategy Profile is empty — fill it in first.");

    const system = [
      "You are a senior UK copywriter refreshing an existing piece of content for one specific business.",
      "GROUND TRUTH: only use facts, offers, proof, numbers and CTAs found in the BUSINESS BRAIN below.",
      "NEVER invent testimonials, statistics, case studies, guarantees, offers or customer stories.",
      "Keep the original intent and topic. Update the offer, positioning, proof and call to action to match the current brain. Sharpen the hook and tighten the writing.",
      "Write in UK English, in the brand's tone of voice. Obey any banned words list absolutely.",
      "BANNED CONSTRUCTIONS — ZERO TOLERANCE: never use antithesis / negation-then-affirmation phrasing in any form (\"it's not X, it's Y\", \"isn't just X, it's Y\", \"not a luxury, a necessity\", \"less about A, more about B\", \"we don't do A, we do B\", \"not only A but also B\").",
      "Output plain text only. No markdown, no preamble, no commentary.",
    ].join("\n");
    const user = [
      `BUSINESS BRAIN:\n${lines.join("\n")}`,
      "",
      `ORIGINAL CONTENT:\n${src.body}`,
      data.instruction ? `EXTRA INSTRUCTION: ${data.instruction}` : "",
      "",
      "Return the refreshed version of the content only.",
    ]
      .filter(Boolean)
      .join("\n");

    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error("AI is not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
    if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
    const json = await res.json();
    const text: string = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("Empty response from AI");

    const tags = Array.from(new Set([...(src.tags ?? []), "refreshed"])).slice(0, 20);
    const { data: row, error } = await context.supabase
      .from("content_bank_items")
      .insert({
        project_id: src.project_id,
        user_id: context.userId,
        kind: src.kind,
        title: src.title ? `${src.title} (refreshed)` : "Refreshed post",
        body: text,
        tags,
        collection: src.collection,
        meta: { ...(src.meta as Record<string, unknown> ?? {}), refreshed_from: src.id },
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id, body: text };
  });

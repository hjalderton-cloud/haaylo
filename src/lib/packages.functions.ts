/**
 * Work packages: one saved container per creation session.
 * Packages reference existing asset rows (never copies), so the calendar,
 * editors and the package view all read and edit the same records.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export const PACKAGE_TYPES = [
  "post_batch",
  "landing_page",
  "content_plan",
  "strategy",
  "campaign",
  "email_sequence",
  "lead_magnet",
  "image_pack",
  "standalone",
] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export const ASSET_TYPES = ["content_post", "landing_page", "strategy_plan", "campaign", "email", "funnel", "image"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export type WorkPackage = {
  id: string;
  project_id: string;
  package_type: PackageType;
  title: string;
  parent_package_id: string | null;
  source: string;
  meta: { [key: string]: Json | undefined };
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type PackageItem = {
  id: string;
  package_id: string;
  asset_type: AssetType;
  asset_id: string;
  position: number;
  section: string | null;
};

export type StageCounts = { total: number; draft: number; approved: number; scheduled: number; published: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

const PKG_COLS = "id, project_id, package_type, title, parent_package_id, source, meta, archived, created_at, updated_at";
const ITEM_COLS = "id, package_id, asset_type, asset_id, position, section";

async function assertProject(ctx: Ctx, projectId: string) {
  const { data } = await ctx.supabase.from("projects").select("id").eq("id", projectId).eq("user_id", ctx.userId).maybeSingle();
  if (!data) throw new Error("That workspace is not available.");
}

/** Server-side core used by generators: create a package and attach assets in order. */
export async function createPackageCore(
  ctx: Ctx,
  input: {
    projectId: string;
    type: PackageType;
    title: string;
    parentPackageId?: string | null;
    source?: string;
    meta?: Record<string, unknown>;
    items?: Array<{ assetType: AssetType; assetId: string; section?: string | null }>;
  },
): Promise<WorkPackage> {
  await assertProject(ctx, input.projectId);
  const { data: pkg, error } = await ctx.supabase
    .from("work_packages")
    .insert({
      user_id: ctx.userId,
      project_id: input.projectId,
      package_type: input.type,
      title: input.title.slice(0, 200),
      parent_package_id: input.parentPackageId ?? null,
      source: input.source ?? "generated",
      meta: input.meta ?? {},
    })
    .select(PKG_COLS)
    .single();
  if (error) throw new Error(error.message);
  if (input.items?.length) await addItemsCore(ctx, pkg.id, input.projectId, input.items);
  return pkg as WorkPackage;
}

export async function addItemsCore(
  ctx: Ctx,
  packageId: string,
  projectId: string,
  items: Array<{ assetType: AssetType; assetId: string; section?: string | null }>,
) {
  const { data: last } = await ctx.supabase
    .from("work_package_items")
    .select("position")
    .eq("package_id", packageId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.position ?? -1) + 1;
  const rows = items.map((it, i) => ({
    package_id: packageId,
    user_id: ctx.userId,
    project_id: projectId,
    asset_type: it.assetType,
    asset_id: it.assetId,
    section: it.section ?? null,
    position: start + i,
  }));
  const { error } = await ctx.supabase
    .from("work_package_items")
    .upsert(rows, { onConflict: "package_id,asset_type,asset_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

function emptyCounts(): StageCounts {
  return { total: 0, draft: 0, approved: 0, scheduled: 0, published: 0 };
}

/** Per-asset stage counts, read live from the asset rows themselves. */
async function stageCounts(ctx: Ctx, items: PackageItem[]): Promise<Map<string, StageCounts>> {
  const out = new Map<string, StageCounts>();
  const postIds = items.filter((i) => i.asset_type === "content_post").map((i) => i.asset_id);
  const statusById = new Map<string, string>();
  if (postIds.length) {
    const { data } = await ctx.supabase.from("content_posts").select("id, status").in("id", postIds).eq("user_id", ctx.userId);
    for (const r of data ?? []) statusById.set(r.id, r.status);
  }
  for (const it of items) {
    const c = out.get(it.package_id) ?? emptyCounts();
    c.total++;
    const s = it.asset_type === "content_post" ? statusById.get(it.asset_id) ?? "draft" : "draft";
    if (s === "approved" || s === "scheduled" || s === "published") c[s]++;
    else c.draft++;
    out.set(it.package_id, c);
  }
  return out;
}

export const listWorkPackages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ projectId: z.string().uuid(), type: z.enum(PACKAGE_TYPES).nullish(), includeArchived: z.boolean().default(false) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    let q = ctx.supabase
      .from("work_packages")
      .select(PKG_COLS)
      .eq("user_id", ctx.userId)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.type) q = q.eq("package_type", data.type);
    if (!data.includeArchived) q = q.eq("archived", false);
    const { data: pkgs, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (pkgs ?? []).map((p: WorkPackage) => p.id);
    let items: PackageItem[] = [];
    if (ids.length) {
      const { data: rows } = await ctx.supabase.from("work_package_items").select(ITEM_COLS).in("package_id", ids);
      items = (rows ?? []) as PackageItem[];
    }
    const counts = await stageCounts(ctx, items);
    return (pkgs ?? []).map((p: WorkPackage) => ({ ...p, counts: counts.get(p.id) ?? emptyCounts() }));
  });

export const getWorkPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: pkg, error } = await ctx.supabase
      .from("work_packages")
      .select(PKG_COLS)
      .eq("id", data.id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pkg) throw new Error("That package could not be found.");
    const { data: rows } = await ctx.supabase
      .from("work_package_items")
      .select(ITEM_COLS)
      .eq("package_id", data.id)
      .order("position", { ascending: true });
    const items = (rows ?? []) as PackageItem[];
    const counts = (await stageCounts(ctx, items)).get(data.id) ?? emptyCounts();
    return { package: pkg as WorkPackage, items, counts };
  });

export const createWorkPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        type: z.enum(PACKAGE_TYPES),
        title: z.string().trim().min(1).max(200),
        parentPackageId: z.string().uuid().nullish(),
        meta: z.record(z.string(), z.unknown()).default({}),
        items: z
          .array(z.object({ assetType: z.enum(ASSET_TYPES), assetId: z.string().uuid(), section: z.string().max(120).nullish() }))
          .max(200)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    createPackageCore(context as unknown as Ctx, { ...data, source: "manual" }),
  );

export const updateWorkPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200).optional(), archived: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch["title"] = data.title;
    if (data.archived !== undefined) patch["archived"] = data.archived;
    const { data: row, error } = await ctx.supabase
      .from("work_packages")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", ctx.userId)
      .select(PKG_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as WorkPackage;
  });

/** Which packages an asset belongs to — lets editors and the calendar show its home. */
export const packagesForAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assetType: z.enum(ASSET_TYPES), assetId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("work_package_items")
      .select("package_id, work_packages(id, title, package_type)")
      .eq("user_id", ctx.userId)
      .eq("asset_type", data.assetType)
      .eq("asset_id", data.assetId);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows ?? []).map((r: any) => r.work_packages).filter(Boolean) as Array<Pick<WorkPackage, "id" | "title" | "package_type">>;
  });

/**
 * Group older work into packages, using only relationships that are already recorded
 * (campaign links, saved batch titles). Never invents links, never deletes, and skips
 * anything already in a package, so running it twice changes nothing.
 */
export const groupOlderWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const pid = data.projectId;
    await assertProject(ctx, pid);
    const sb = ctx.supabase;

    const { data: held } = await sb.from("work_package_items").select("asset_type, asset_id").eq("user_id", ctx.userId).eq("project_id", pid);
    const done = new Set(((held ?? []) as Array<{ asset_type: string; asset_id: string }>).map((h) => `${h.asset_type}:${h.asset_id}`));
    const free = (t: AssetType, id: string) => !done.has(`${t}:${id}`);
    const mark = (t: AssetType, ids: string[]) => ids.forEach((id) => done.add(`${t}:${id}`));
    const summary = { campaigns: 0, postSets: 0, landingPages: 0, strategies: 0, standalone: 0, itemsFiled: 0 };

    const [camps, posts, pages, plans, emails, bank, funnels] = await Promise.all([
      (sb.from("campaigns").select("id, campaign_title, created_at").eq("user_id", ctx.userId).eq("project_id", pid)),
      (sb.from("content_posts").select("id, campaign_id, meta, created_at").eq("user_id", ctx.userId).eq("project_id", pid).order("created_at").limit(2000)),
      (sb.from("landing_pages").select("id, title, campaign_id, created_at").eq("user_id", ctx.userId).eq("project_id", pid)),
      (sb.from("strategy_plans").select("id, plan, created_at").eq("user_id", ctx.userId).eq("project_id", pid)),
      (sb.from("email_sequences").select("id, campaign_id, send_order").eq("user_id", ctx.userId).not("campaign_id", "is", null).order("send_order")),
      (sb.from("content_bank_items").select("id, kind, meta").eq("user_id", ctx.userId).eq("project_id", pid).in("kind", ["email", "image_prompt"])),
      (sb.from("funnels").select("id, campaign_id").eq("user_id", ctx.userId).eq("project_id", pid).not("campaign_id", "is", null)),
    ]);
    type Row = { id: string; [k: string]: unknown };
    const P = (posts.data ?? []) as Row[];
    const campOf = (r: Row) => (r.campaign_id as string | null) ?? (typeof (r.meta as Record<string, unknown>)?.campaign_id === "string" ? String((r.meta as Record<string, unknown>).campaign_id) : null);

    // Existing campaign packages, so new items join them rather than duplicating.
    const { data: campItems } = await sb.from("work_package_items").select("package_id, asset_id").eq("user_id", ctx.userId).eq("project_id", pid).eq("asset_type", "campaign");
    const campPkg = new Map(((campItems ?? []) as Array<{ package_id: string; asset_id: string }>).map((r) => [r.asset_id, r.package_id]));

    for (const c of (camps.data ?? []) as Row[]) {
      const items: Array<{ assetType: AssetType; assetId: string; section: string }> = [];
      const add = (t: AssetType, ids: string[], section: string) => {
        const f = ids.filter((id) => free(t, id));
        f.forEach((id) => items.push({ assetType: t, assetId: id, section }));
        mark(t, f);
      };
      add("content_post", P.filter((p) => campOf(p) === c.id).map((p) => p.id), "Social posts");
      add("landing_page", ((pages.data ?? []) as Row[]).filter((p) => p.campaign_id === c.id).map((p) => p.id), "Landing page");
      add("email", ((emails.data ?? []) as Row[]).filter((e) => e.campaign_id === c.id).map((e) => e.id), "Emails");
      const B = (bank.data ?? []) as Row[];
      add("email", B.filter((b) => b.kind === "email" && campOf(b) === c.id).map((b) => b.id), "Emails");
      add("image", B.filter((b) => b.kind === "image_prompt" && campOf(b) === c.id).map((b) => b.id), "Images");
      add("funnel", ((funnels.data ?? []) as Row[]).filter((f) => f.campaign_id === c.id).map((f) => f.id), "Lead magnet");
      const existing = campPkg.get(c.id);
      if (existing) {
        if (items.length) await addItemsCore(ctx, existing, pid, items);
      } else {
        await createPackageCore(ctx, { projectId: pid, type: "campaign", title: String(c.campaign_title || "Campaign"), source: "grouped", items: [{ assetType: "campaign", assetId: c.id, section: null }, ...items] });
        mark("campaign", [c.id]);
        summary.campaigns++;
      }
      summary.itemsFiled += items.length;
    }

    // Posts with a saved batch title become one post set per title.
    const batches = new Map<string, string[]>();
    for (const p of P) {
      if (!free("content_post", p.id)) continue;
      const t = (p.meta as Record<string, unknown>)?.batch_title;
      if (typeof t === "string" && t.trim()) batches.set(t.trim(), [...(batches.get(t.trim()) ?? []), p.id]);
    }
    for (const [title, ids] of batches) {
      await createPackageCore(ctx, { projectId: pid, type: "post_batch", title, source: "grouped", items: ids.map((id) => ({ assetType: "content_post" as const, assetId: id })) });
      mark("content_post", ids);
      summary.postSets++;
      summary.itemsFiled += ids.length;
    }

    for (const pg of (pages.data ?? []) as Row[]) {
      if (!free("landing_page", pg.id)) continue;
      await createPackageCore(ctx, { projectId: pid, type: "landing_page", title: String(pg.title || "Landing page"), source: "grouped", items: [{ assetType: "landing_page", assetId: pg.id, section: "Landing page" }] });
      mark("landing_page", [pg.id]);
      summary.landingPages++;
      summary.itemsFiled++;
    }

    for (const sp of (plans.data ?? []) as Row[]) {
      if (!free("strategy_plan", sp.id)) continue;
      const plan = (sp.plan ?? {}) as Record<string, unknown>;
      const name = typeof plan.name === "string" && plan.name.trim() ? plan.name.trim() : "90-day strategy";
      await createPackageCore(ctx, { projectId: pid, type: "strategy", title: name, source: "grouped", meta: { snapshot: plan }, items: [{ assetType: "strategy_plan", assetId: sp.id }] });
      mark("strategy_plan", [sp.id]);
      summary.strategies++;
      summary.itemsFiled++;
    }

    // Whatever is left has no recorded relationship: one dated standalone package per month.
    const months = new Map<string, { label: string; ids: string[] }>();
    for (const p of P) {
      if (!free("content_post", p.id)) continue;
      const d = new Date(String(p.created_at));
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
      const m = months.get(key) ?? { label, ids: [] };
      m.ids.push(p.id);
      months.set(key, m);
    }
    for (const [, m] of [...months].sort(([a], [b]) => a.localeCompare(b))) {
      await createPackageCore(ctx, { projectId: pid, type: "standalone", title: `Standalone posts, ${m.label}`, source: "grouped", items: m.ids.map((id) => ({ assetType: "content_post" as const, assetId: id })) });
      summary.standalone++;
      summary.itemsFiled += m.ids.length;
    }
    return summary;
  });

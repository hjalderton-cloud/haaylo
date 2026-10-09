import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const KINDS = ["logo", "brand_guidelines", "image", "pdf", "case_study", "strategy_doc", "template"] as const;

/** Create a signed upload URL scoped to brain/{userId}/{projectId}/{kind}/{ts}-{name}. */
export const createBrainAssetUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; kind: (typeof KINDS)[number]; filename: string }) =>
    z.object({
      projectId: z.string().uuid(),
      kind: z.enum(KINDS),
      filename: z.string().min(1).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // verify project ownership
    const { data: proj } = await context.supabase
      .from("projects").select("id").eq("id", data.projectId).maybeSingle();
    if (!proj) throw new Error("Project not found");

    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const path = `brain/${context.userId}/${data.projectId}/${data.kind}/${Date.now()}-${safeName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("scheduler-media")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);

    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const registerBrainAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; kind: (typeof KINDS)[number]; storagePath: string; label?: string }) =>
    z.object({
      projectId: z.string().uuid(),
      kind: z.enum(KINDS),
      storagePath: z.string().min(1).max(400),
      label: z.string().max(160).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // logo is singleton — replace previous
    if (data.kind === "logo") {
      await context.supabase.from("brain_assets").delete().eq("project_id", data.projectId).eq("kind", "logo");
    }
    const { data: row, error } = await context.supabase
      .from("brain_assets")
      .insert({
        project_id: data.projectId,
        kind: data.kind,
        storage_path: data.storagePath,
        label: data.label ?? null,
      })
      .select("id, kind, storage_path, label, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listBrainAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("brain_assets")
      .select("id, kind, storage_path, label, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const withUrls = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("scheduler-media")
          .createSignedUrl(r.storage_path, 60 * 60);
        return { ...r, url: signed?.signedUrl ?? null };
      }),
    );
    return withUrls;
  });

export const deleteBrainAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("brain_assets").select("storage_path").eq("id", data.id).maybeSingle();
    if (row?.storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("scheduler-media").remove([row.storage_path]);
    }
    const { error } = await context.supabase.from("brain_assets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

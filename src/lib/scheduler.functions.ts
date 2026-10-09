import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PROVIDERS = ["linkedin", "linkedin_company", "facebook_page", "instagram"] as const;
type StartProvider = (typeof PROVIDERS)[number];

function redirectBase(): string {
  const configured = process.env.OAUTH_REDIRECT_BASE_URL;
  if (!configured) return "https://haaylo.com";

  try {
    const url = new URL(configured);
    if (url.hostname === "haaylo.com") return "https://haaylo.com";
  } catch {
    // Fall through to the canonical production domain.
  }

  return "https://haaylo.com";
}
const CALLBACK_PATH = "/api/public/oauth/callback";

/** Returns an OAuth authorization URL the user should be sent to. */
export const startSocialOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: StartProvider }) =>
    z.object({ provider: z.enum(PROVIDERS) }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { assertSchedulerSubscription } = await import("@/lib/scheduler-guard.server");
    await assertSchedulerSubscription(context.supabase, context.userId);
    const { signState } = await import("@/lib/scheduler-crypto.server");
    const state = signState({ uid: context.userId, provider: data.provider });

    const redirectUri = `${redirectBase()}${CALLBACK_PATH}`;

    if (data.provider === "linkedin" || data.provider === "linkedin_company") {
      const clientId = process.env.LINKEDIN_CLIENT_ID;
      if (!clientId) throw new Error("LinkedIn not configured");
      const scope = data.provider === "linkedin_company"
        // Community Management API — required for real page impressions/clicks.
        ? "openid profile email w_member_social r_organization_social w_organization_social rw_organization_admin r_organization_admin"
        : "openid profile email w_member_social";
      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
      });
      return { url: `https://www.linkedin.com/oauth/v2/authorization?${params}` };
    }


    // Meta (Facebook Pages + Instagram Business) — single OAuth flow
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error("Meta not configured");
    const scope = [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_content_publish",
      "business_management",
    ].join(",");
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope,
      response_type: "code",
    });
    return { url: `https://www.facebook.com/v21.0/dialog/oauth?${params}` };
  });

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("social_connections")
      .select("id, provider, external_id, display_name, avatar_url, status, last_error, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { connections: data ?? [] };
  });

export const disconnectConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("social_connections")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const composeSchema = z.object({
  id: z.string().uuid().optional(),
  caption: z.string().max(3000),
  media_url: z.string().url().nullable().optional(),
  media_path: z.string().nullable().optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  connection_ids: z.array(z.string().uuid()).min(1),
  schedule: z.boolean().default(false),
});

export const savePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => composeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { assertSchedulerSubscription } = await import("@/lib/scheduler-guard.server");
    await assertSchedulerSubscription(context.supabase, context.userId);
    const status = data.schedule ? "scheduled" : "draft";

    if (data.schedule && !data.scheduled_at) {
      throw new Error("scheduled_at is required when scheduling");
    }

    const upsertPost = data.id
      ? await context.supabase
          .from("scheduled_posts")
          .update({
            caption: data.caption,
            media_url: data.media_url ?? null,
            media_path: data.media_path ?? null,
            scheduled_at: data.scheduled_at ?? null,
            status,
          })
          .eq("id", data.id)
          .select("id")
          .single()
      : await context.supabase
          .from("scheduled_posts")
          .insert({
            user_id: context.userId,
            caption: data.caption,
            media_url: data.media_url ?? null,
            media_path: data.media_path ?? null,
            scheduled_at: data.scheduled_at ?? null,
            status,
          })
          .select("id")
          .single();

    if (upsertPost.error || !upsertPost.data) throw upsertPost.error ?? new Error("Save failed");
    const postId = upsertPost.data.id;

    // Replace targets
    await context.supabase.from("post_targets").delete().eq("post_id", postId);
    const targetRows = data.connection_ids.map((connection_id) => ({
      post_id: postId,
      connection_id,
      status: "pending" as const,
    }));
    const { error: tErr } = await context.supabase.from("post_targets").insert(targetRows);
    if (tErr) throw tErr;

    return { id: postId, status };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("scheduled_posts")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scheduled_posts")
      .select(`
        id, caption, media_url, scheduled_at, status, last_error, created_at,
        post_targets ( id, connection_id, status, permalink, error_message,
          social_connections ( provider, display_name ) )
      `)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { posts: data ?? [] };
  });

/** Returns a short-lived signed URL the browser uses to upload media. */
export const createUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { filename: string }) =>
    z.object({ filename: z.string().min(1).max(200) }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { assertSchedulerSubscription } = await import("@/lib/scheduler-guard.server");
    await assertSchedulerSubscription(context.supabase, context.userId);
    const ext = data.filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";

    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;
    // Use admin client to issue the signed upload URL so the resulting
    // storage.objects INSERT bypasses RLS (path is still scoped to userId).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin
      .storage.from("scheduler-media")
      .createSignedUploadUrl(path);
    if (error || !signed) throw error ?? new Error("Could not create upload URL");
    return { path, signedUrl: signed.signedUrl, token: signed.token };
  });

/** Signed read URL the publisher (or browser) uses to fetch a stored image. */
export const getMediaReadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { path: string }) =>
    z.object({ path: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase
      .storage.from("scheduler-media")
      .createSignedUrl(data.path, 60 * 60);
    if (error || !signed) throw error ?? new Error("Could not sign URL");
    return { url: signed.signedUrl };
  });

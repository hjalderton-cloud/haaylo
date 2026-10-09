import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron worker. Picks scheduled_posts due now, marks them publishing,
 * fans out to each connected target, records permalinks/errors, marks the
 * parent post published / failed. Idempotent across runs.
 *
 * Gated by the project's publishable apikey header so it's not abusable publicly.
 */

type Provider = "linkedin" | "facebook_page" | "instagram";

interface TargetRow {
  id: string;
  status: string;
  connection: {
    id: string;
    provider: Provider;
    external_id: string;
    access_token_enc: string;
    metadata: Record<string, unknown> | null;
  };
}
interface PostRow {
  id: string;
  user_id: string;
  caption: string;
  media_url: string | null;
  media_path: string | null;
  scheduled_at: string | null;
}

export const Route = createFileRoute("/api/public/cron/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
        const provided = request.headers.get("apikey") || request.headers.get("x-cron-secret");
        if (!expected || !provided || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { decryptToken } = await import("@/lib/scheduler-crypto.server");

        // Claim due posts (status=scheduled, scheduled_at <= now)
        const { data: due, error: dueErr } = await supabaseAdmin
          .from("scheduled_posts")
          .update({ status: "publishing" })
          .lte("scheduled_at", new Date().toISOString())
          .eq("status", "scheduled")
          .select("id, user_id, caption, media_url, media_path, scheduled_at");

        if (dueErr) {
          console.error("claim error", dueErr);
          return new Response(JSON.stringify({ error: dueErr.message }), { status: 500 });
        }

        const results: Array<{ post_id: string; ok: boolean; targets: number }> = [];

        for (const post of (due ?? []) as PostRow[]) {
          // Sign media if present
          let mediaUrl: string | null = post.media_url;
          if (post.media_path) {
            const { data: signed } = await supabaseAdmin
              .storage.from("scheduler-media")
              .createSignedUrl(post.media_path, 60 * 60);
            mediaUrl = signed?.signedUrl ?? mediaUrl;
          }

          const { data: targets } = await supabaseAdmin
            .from("post_targets")
            .select(`id, status, connection:social_connections!inner (
              id, provider, external_id, access_token_enc, metadata
            )`)
            .eq("post_id", post.id);

          let anyFail = false;
          let anyOk = false;

          for (const t of (targets ?? []) as unknown as TargetRow[]) {
            if (t.status === "published") { anyOk = true; continue; }
            await supabaseAdmin.from("post_targets")
              .update({ status: "publishing", error_message: null })
              .eq("id", t.id);

            const token = decryptToken(t.connection.access_token_enc);
            try {
              const res = await publishToProvider({
                provider: t.connection.provider,
                token,
                externalId: t.connection.external_id,
                caption: post.caption,
                mediaUrl,
                metadata: t.connection.metadata ?? {},
              });
              await supabaseAdmin.from("post_targets").update({
                status: "published",
                external_post_id: res.id,
                permalink: res.permalink ?? null,
                published_at: new Date().toISOString(),
                error_message: null,
              }).eq("id", t.id);
              anyOk = true;
            } catch (e) {
              anyFail = true;
              const msg = e instanceof Error ? e.message : "unknown";
              await supabaseAdmin.from("post_targets").update({
                status: "failed",
                error_message: msg.slice(0, 500),
              }).eq("id", t.id);
              console.error("publish fail", t.connection.provider, msg);
            }
          }

          const finalStatus = anyOk && !anyFail ? "published" : anyFail && !anyOk ? "failed" : "published";
          await supabaseAdmin.from("scheduled_posts").update({
            status: finalStatus,
            last_error: anyFail ? "One or more channels failed" : null,
          }).eq("id", post.id);

          results.push({ post_id: post.id, ok: !anyFail, targets: targets?.length ?? 0 });
        }

        return new Response(JSON.stringify({ processed: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

async function publishToProvider(args: {
  provider: Provider;
  token: string;
  externalId: string;
  caption: string;
  mediaUrl: string | null;
  metadata: Record<string, unknown>;
}): Promise<{ id: string; permalink?: string }> {
  const { provider, token, externalId, caption, mediaUrl } = args;

  if (provider === "linkedin") {
    const author = `urn:li:person:${externalId}`;
    let mediaUrn: string | null = null;

    if (mediaUrl) {
      const reg = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: author,
            serviceRelationships: [
              { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
            ],
          },
        }),
      });
      const regBody = await reg.json();
      if (!reg.ok) throw new Error(`LI register: ${JSON.stringify(regBody)}`);
      const uploadUrl: string =
        regBody.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
      mediaUrn = regBody.value.asset;

      const img = await fetch(mediaUrl);
      if (!img.ok) throw new Error(`fetch media: ${img.status}`);
      const bytes = new Uint8Array(await img.arrayBuffer());
      const up = await fetch(uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: bytes,
      });
      if (!up.ok) throw new Error(`LI upload: ${up.status}`);
    }

    const body: Record<string, unknown> = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: caption },
          shareMediaCategory: mediaUrn ? "IMAGE" : "NONE",
          ...(mediaUrn
            ? {
                media: [
                  {
                    status: "READY",
                    media: mediaUrn,
                  },
                ],
              }
            : {}),
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };
    const r = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });
    const rb = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`LI post: ${JSON.stringify(rb)}`);
    const id = rb.id || r.headers.get("x-restli-id") || "linkedin";
    return { id, permalink: `https://www.linkedin.com/feed/update/${id}/` };
  }

  if (provider === "facebook_page") {
    if (mediaUrl) {
      const url = new URL(`https://graph.facebook.com/v21.0/${externalId}/photos`);
      url.searchParams.set("url", mediaUrl);
      url.searchParams.set("caption", caption);
      url.searchParams.set("access_token", token);
      const r = await fetch(url, { method: "POST" });
      const b = await r.json();
      if (!r.ok) throw new Error(`FB photo: ${JSON.stringify(b)}`);
      return { id: b.post_id || b.id, permalink: `https://www.facebook.com/${b.post_id || b.id}` };
    } else {
      const url = new URL(`https://graph.facebook.com/v21.0/${externalId}/feed`);
      url.searchParams.set("message", caption);
      url.searchParams.set("access_token", token);
      const r = await fetch(url, { method: "POST" });
      const b = await r.json();
      if (!r.ok) throw new Error(`FB feed: ${JSON.stringify(b)}`);
      return { id: b.id, permalink: `https://www.facebook.com/${b.id}` };
    }
  }

  if (provider === "instagram") {
    if (!mediaUrl) throw new Error("Instagram requires an image");
    // Step 1: create container
    const create = new URL(`https://graph.facebook.com/v21.0/${externalId}/media`);
    create.searchParams.set("image_url", mediaUrl);
    create.searchParams.set("caption", caption);
    create.searchParams.set("access_token", token);
    const cRes = await fetch(create, { method: "POST" });
    const cBody = await cRes.json();
    if (!cRes.ok) throw new Error(`IG container: ${JSON.stringify(cBody)}`);
    const creationId: string = cBody.id;

    // Step 2: publish
    const pub = new URL(`https://graph.facebook.com/v21.0/${externalId}/media_publish`);
    pub.searchParams.set("creation_id", creationId);
    pub.searchParams.set("access_token", token);
    const pRes = await fetch(pub, { method: "POST" });
    const pBody = await pRes.json();
    if (!pRes.ok) throw new Error(`IG publish: ${JSON.stringify(pBody)}`);
    return { id: pBody.id, permalink: `https://www.instagram.com/p/${pBody.id}/` };
  }

  throw new Error(`Unknown provider ${provider}`);
}

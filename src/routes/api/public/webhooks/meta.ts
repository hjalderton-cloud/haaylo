import { createFileRoute } from "@tanstack/react-router";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta Graph webhook for Instagram/Facebook comment events.
 * GET  — subscription verification handshake.
 * POST — signed comment payloads, matched against the user's lead rules.
 */
export const Route = createFileRoute("/api/public/webhooks/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        if (mode === "subscribe" && token && token === verifyToken()) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const appSecret = process.env["META_APP_SECRET"];
        if (!appSecret) return new Response("Not configured", { status: 500 });

        const raw = await request.text();
        const header = request.headers.get("x-hub-signature-256") ?? "";
        const expected =
          "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
        const got = Buffer.from(header);
        const want = Buffer.from(expected);
        if (got.length !== want.length || !timingSafeEqual(got, want)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: MetaWebhook;
        try {
          payload = JSON.parse(raw) as MetaWebhook;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processComment } = await import("@/lib/leads.server");

        for (const entry of payload.entry ?? []) {
          const accountId = String(entry.id ?? "");
          if (!accountId) continue;

          const { data: connection } = await supabaseAdmin
            .from("social_connections")
            .select("id, user_id, provider, external_id, access_token_enc, scopes")
            .eq("external_id", accountId)
            .maybeSingle();
          if (!connection) continue;

          for (const change of entry.changes ?? []) {
            if (change.field !== "comments") continue;
            const v = change.value ?? {};
            const commentId = String(v.id ?? "");
            if (!commentId) continue;
            // Never react to the account replying to itself.
            const fromId = v.from?.id ? String(v.from.id) : null;
            if (fromId && fromId === accountId) continue;

            try {
              await processComment(
                supabaseAdmin,
                {
                  platform: connection.provider,
                  commentId,
                  postId: v.media?.id ? String(v.media.id) : v.post_id ? String(v.post_id) : null,
                  postPermalink: null,
                  text: String(v.text ?? v.message ?? ""),
                  fromId,
                  fromName: v.from?.name ?? v.from?.username ?? null,
                  fromHandle: v.from?.username ?? null,
                  avatarUrl: null,
                },
                connection,
              );
            } catch (err) {
              console.error("[leads] webhook processing failed", err);
            }
          }
        }

        // Meta retries on anything but a fast 200.
        return new Response("ok", { status: 200 });
      },
    },
  },
});

function verifyToken(): string {
  const explicit = process.env["META_WEBHOOK_VERIFY_TOKEN"];
  if (explicit) return explicit;
  const secret = process.env["META_APP_SECRET"] ?? "";
  return createHash("sha256").update(`haaylo-webhook:${secret}`).digest("hex").slice(0, 32);
}

type MetaWebhook = {
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        id?: string;
        text?: string;
        message?: string;
        post_id?: string;
        media?: { id?: string };
        from?: { id?: string; name?: string; username?: string };
      };
    }>;
  }>;
};

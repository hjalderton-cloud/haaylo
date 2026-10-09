import { createFileRoute } from "@tanstack/react-router";

/**
 * Backstop sweep: pulls recent comments for every connected Meta account and
 * runs them through the lead rules. Catches anything the webhook missed.
 * Called by pg_cron with the service role bearer token.
 */
export const Route = createFileRoute("/api/public/cron/lead-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
        if (!expected || token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processComment, recentComments, tokenFor, runNurtureQueue } = await import("@/lib/leads.server");

        // Timed nurture steps first: follow-up DMs and lead handoff emails.
        let nurture = { followups: 0, handoffs: 0 };
        try {
          nurture = await runNurtureQueue(supabaseAdmin);
        } catch (err) {
          console.error("[leads] nurture sweep failed", err);
        }

        const { data: connections } = await supabaseAdmin
          .from("social_connections")
          .select("id, user_id, provider, external_id, access_token_enc, scopes, status")
          .in("provider", ["instagram", "facebook_page"])
          .eq("status", "active");

        let scanned = 0;
        let captured = 0;

        for (const connection of connections ?? []) {
          // Only sweep accounts that actually have an active rule.
          const { count } = await supabaseAdmin
            .from("lead_automations")
            .select("*", { count: "exact", head: true })
            .eq("user_id", connection.user_id)
            .eq("active", true);
          if (!count) continue;

          let accessToken: string;
          try {
            accessToken = tokenFor(connection);
          } catch {
            continue;
          }

          let comments: Awaited<ReturnType<typeof recentComments>> = [];
          try {
            comments = await recentComments(accessToken, connection.external_id, connection.provider);
          } catch (err) {
            console.error("[leads] sweep fetch failed", err);
            continue;
          }

          for (const c of comments) {
            scanned += 1;
            if (c.fromId && c.fromId === connection.external_id) continue;
            try {
              const result = await processComment(
                supabaseAdmin,
                {
                  platform: connection.provider,
                  commentId: c.commentId,
                  postId: c.postId,
                  postPermalink: c.permalink,
                  text: c.text,
                  fromId: c.fromId,
                  fromName: c.fromName,
                  fromHandle: c.fromName,
                  avatarUrl: null,
                },
                connection,
              );
              if (result.captured) captured += 1;
            } catch (err) {
              console.error("[leads] sweep processing failed", err);
            }
          }
        }

        return new Response(JSON.stringify({ ok: true, scanned, captured, followups: nurture.followups, handoffs: nurture.handoffs }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

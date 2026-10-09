import { createFileRoute } from "@tanstack/react-router";

/**
 * Emails founding members 7 days before their discounted year rolls onto the
 * standard £49/month rate. Idempotent: each member is reminded once, tracked by
 * founding_renewal_reminder_sent_at.
 *
 * Gated by the project's publishable apikey header so it is not abusable.
 */
export const Route = createFileRoute("/api/public/cron/founding-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_ANON_KEY"];
        const provided = request.headers.get("apikey") || request.headers.get("x-cron-secret");
        if (!expected || !provided || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const { EmailAPIError } = await import("@lovable.dev/email-js");

        const now = Date.now();
        const windowEnd = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id, founding_period_end, status, founding_renewal_reminder_sent_at")
          .not("founding_period_end", "is", null)
          .is("founding_renewal_reminder_sent_at", null)
          .lte("founding_period_end", windowEnd)
          .gte("founding_period_end", new Date(now).toISOString())
          .in("status", ["active", "trialing"])
          .limit(100);

        if (error) return Response.json({ sent: 0, error: error.message }, { status: 500 });

        const logRow = async (
          recipient: string,
          status: "sent" | "suppressed" | "failed",
          errorMessage?: string,
        ) => {
          const { error: logError } = await supabaseAdmin.from("email_send_log").insert({
            message_id: null,
            template_name: "founding-renewal",
            recipient_email: recipient,
            status,
            ...(errorMessage ? { error_message: errorMessage.slice(0, 1000) } : {}),
          });
          if (logError) console.error("[founding-reminder] log write failed", logError.message);
        };

        let sent = 0;
        for (const row of rows ?? []) {
          try {
            const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
            const recipient = userRes?.user?.email;
            if (!recipient) continue;

            const renewalDate = new Date(row.founding_period_end as string).toLocaleDateString(
              "en-GB",
              { day: "numeric", month: "long", year: "numeric" },
            );

            let result;
            try {
              result = await sendTemplateEmail("founding-renewal", recipient, {
                templateData: { renewalDate },
                idempotencyKey: `founding-renewal-${row.user_id}`,
              });
            } catch (err) {
              // Sending faster than the hourly allowance — wait, then retry once.
              if (err instanceof EmailAPIError && err.status === 429) {
                const waitSeconds = err.retryAfterSeconds ?? 60;
                await new Promise((r) => setTimeout(r, waitSeconds * 1000));
                result = await sendTemplateEmail("founding-renewal", recipient, {
                  templateData: { renewalDate },
                  idempotencyKey: `founding-renewal-${row.user_id}`,
                });
              } else {
                throw err;
              }
            }

            await logRow(recipient, result.sent ? "sent" : "suppressed");

            await supabaseAdmin
              .from("subscriptions")
              .update({ founding_renewal_reminder_sent_at: new Date().toISOString() })
              .eq("user_id", row.user_id);
            if (result.sent) sent++;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error("[founding-reminder] failed", message);
            const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
            const recipient = userRes?.user?.email;
            if (recipient) await logRow(recipient, "failed", message);
          }
        }

        return Response.json({ sent });
      },
    },
  },
});

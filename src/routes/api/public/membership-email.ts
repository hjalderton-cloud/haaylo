import { createFileRoute } from "@tanstack/react-router";

/**
 * Renders and sends a membership lifecycle email (welcome after a successful
 * checkout, or a payment-failed nudge). Called server-to-server by the Stripe
 * webhook, which cannot render React Email templates itself.
 *
 * Gated by the project's publishable apikey header. Idempotent: a duplicate
 * idempotency key is a no-op, so Stripe retries never double-send.
 */
export const Route = createFileRoute("/api/public/membership-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_ANON_KEY"];
        const provided = request.headers.get("apikey") || request.headers.get("x-cron-secret");
        if (!expected || !provided || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        let body: {
          kind?: string;
          userId?: string;
          idempotencyKey?: string;
          data?: Record<string, unknown>;
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ sent: false, error: "bad json" }, { status: 400 });
        }

        const kind = body.kind === "payment-failed" ? "payment-failed" : "membership-welcome";
        const userId = body.userId;
        if (!userId) return Response.json({ sent: false, error: "missing userId" }, { status: 400 });

        const idempotencyKey = body.idempotencyKey || `${kind}-${userId}`;

        const { TEMPLATES } = await import("@/lib/email-templates/registry");
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (!TEMPLATES[kind]) return Response.json({ sent: false, error: "template missing" });

        // Already sent for this key? Nothing to do.
        const { data: existing } = await supabaseAdmin
          .from("email_send_log")
          .select("id")
          .eq("template_name", kind)
          .contains("metadata", { idempotency_key: idempotencyKey })
          .limit(1);
        if (existing && existing.length > 0) {
          return Response.json({ sent: false, duplicate: true });
        }

        const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
        const recipient = userRes?.user?.email;
        if (!recipient) return Response.json({ sent: false, error: "no recipient" });

        const logRow = async (
          status: "sent" | "suppressed" | "failed",
          errorMessage?: string,
        ) => {
          const { error } = await supabaseAdmin.from("email_send_log").insert({
            message_id: null,
            template_name: kind,
            recipient_email: recipient,
            status,
            metadata: { idempotency_key: idempotencyKey },
            ...(errorMessage ? { error_message: errorMessage.slice(0, 1000) } : {}),
          });
          if (error) console.error("[membership-email] log write failed", error.message);
        };

        try {
          const result = await sendTemplateEmail(kind, recipient, {
            templateData: (body.data ?? {}) as Record<string, unknown>,
            idempotencyKey,
          });
          if (!result.sent) {
            await logRow("suppressed");
            return Response.json({ sent: false, suppressed: true });
          }
          await logRow("sent");
          return Response.json({ sent: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[membership-email] send failed", message);
          await logRow("failed", message);
          return Response.json({ sent: false, error: message }, { status: 500 });
        }
      },
    },
  },
});

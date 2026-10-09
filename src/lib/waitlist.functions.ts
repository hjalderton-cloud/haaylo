import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const inputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255, "Email is too long")
    .email("Please enter a valid email address"),
});

async function sendWelcomeEmail(recipient: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

  const logRow = async (
    status: "sent" | "suppressed" | "failed",
    errorMessage?: string,
  ) => {
    const { error } = await supabaseAdmin.from("email_send_log").insert({
      message_id: null,
      template_name: "waitlist-welcome",
      recipient_email: recipient,
      status,
      ...(errorMessage ? { error_message: errorMessage.slice(0, 1000) } : {}),
    });
    if (error) console.error("[waitlist] send log write failed", error.message);
  };

  try {
    const result = await sendTemplateEmail("waitlist-welcome", recipient, {
      idempotencyKey: `waitlist-welcome-${recipient}`,
    });
    await logRow(result.sent ? "sent" : "suppressed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[waitlist] welcome email error", message);
    await logRow("failed", message);
  }
}

export const joinWaitlist = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ua = getRequestHeader("user-agent") ?? null;
    const userAgent = ua ? ua.slice(0, 300) : null;

    const { error } = await supabaseAdmin
      .from("waitlist_signups")
      .insert({
        email: data.email,
        source: "waitlist",
        user_agent: userAgent,
      });

    const isDuplicate = !!error && error.code === "23505";
    if (error && !isDuplicate) {
      console.error("[waitlist] insert failed", error.message);
      throw new Error("Something went wrong. Please try again in a moment.");
    }

    // Fresh signup: send welcome email and mark as notified.
    if (!isDuplicate) {
      await sendWelcomeEmail(data.email);
      await supabaseAdmin
        .from("waitlist_signups")
        .update({ notified: true })
        .eq("email", data.email);
      return { ok: true as const };
    }

    // Duplicate signup: if they never received the welcome email, send it now.
    const { data: existing } = await supabaseAdmin
      .from("waitlist_signups")
      .select("notified")
      .eq("email", data.email)
      .maybeSingle();

    if (existing && !existing.notified) {
      await sendWelcomeEmail(data.email);
      await supabaseAdmin
        .from("waitlist_signups")
        .update({ notified: true })
        .eq("email", data.email);
    }

    return { ok: true as const };
  });

export const getWaitlistCount = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("waitlist_signups")
    .select("*", { count: "exact", head: true });
  if (error) {
    console.error("[waitlist] count failed", error.message);
    return { count: 0 as number };
  }
  return { count: count ?? 0 };
});

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MailchimpSettings {
  mailchimp_api_key: string | null;
  mailchimp_server_prefix: string | null;
}

export const getMailchimpSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MailchimpSettings> => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("mailchimp_settings")
      .select("mailchimp_api_key, mailchimp_server_prefix")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      mailchimp_api_key: data?.mailchimp_api_key ?? null,
      mailchimp_server_prefix: data?.mailchimp_server_prefix ?? null,
    };
  });

const saveInput = z.object({
  mailchimp_api_key: z.string().trim().max(200).nullable(),
  mailchimp_server_prefix: z.string().trim().max(50).nullable(),
});

export const saveMailchimpSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      mailchimp_api_key: data.mailchimp_api_key || null,
      mailchimp_server_prefix: data.mailchimp_server_prefix || null,
    };
    const { error } = await supabase
      .from("mailchimp_settings")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

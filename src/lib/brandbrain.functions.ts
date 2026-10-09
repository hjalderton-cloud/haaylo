import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface BrandBrain {
  brand_name: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
}

export const getBrandBrain = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrandBrain> => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("brand_brain")
      .select("brand_name, target_audience, brand_voice, primary_color, secondary_color, logo_url")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      brand_name: data?.brand_name ?? null,
      target_audience: data?.target_audience ?? null,
      brand_voice: data?.brand_voice ?? null,
      primary_color: data?.primary_color ?? null,
      secondary_color: data?.secondary_color ?? null,
      logo_url: data?.logo_url ?? null,
    };
  });

const brandInput = z.object({
  brand_name: z.string().trim().max(200).nullable(),
  target_audience: z.string().trim().max(2000).nullable(),
  brand_voice: z.string().trim().max(2000).nullable(),
  primary_color: z.string().trim().max(50).nullable(),
  secondary_color: z.string().trim().max(50).nullable(),
  logo_url: z.string().trim().max(2000).nullable(),
});

export const saveBrandBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => brandInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      brand_name: data.brand_name || null,
      target_audience: data.target_audience || null,
      brand_voice: data.brand_voice || null,
      primary_color: data.primary_color || null,
      secondary_color: data.secondary_color || null,
      logo_url: data.logo_url || null,
    };
    const { error } = await supabase
      .from("brand_brain")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

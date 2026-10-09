import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Tier = "starter" | "pro" | "expert";

async function ensureAdmin(context: { supabase: unknown; userId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = context.supabase as any;
  const { data } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (data !== true) throw new Error("Admin only");
}

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean; adminExists: boolean }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { count } = await context.supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    return { isAdmin: isAdmin === true, adminExists: (count ?? 0) > 0 };
  });

export const claimAdminBootstrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_admin_bootstrap");
    if (error) throw new Error(error.message);
    return data as { ok: boolean; error?: string };
  });

const createSchema = z.object({
  code: z.string().trim().min(4).max(64).optional(),
  tier: z.enum(["starter", "pro", "expert"]),
  expiresAt: z.string().nullable().optional(),
  singleUse: z.boolean().default(true),
  note: z.string().max(200).optional(),
});

function randomCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export const createRedemptionCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const code = (data.code?.trim() || randomCode()).toUpperCase();
    const { data: row, error } = await context.supabase
      .from("redemption_codes")
      .insert({
        code,
        tier: data.tier as Tier,
        expires_at: data.expiresAt || null,
        single_use: data.singleUse,
        note: data.note ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listRedemptionCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("redemption_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteRedemptionCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("redemption_codes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const redeemCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().min(3).max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("redeem_code", { _code: data.code });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; tier?: Tier; error?: string };
  });

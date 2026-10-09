import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Inbound lead webhooks. An outside service (today, Gojiberry) posts a contact
 * to a public endpoint carrying a secret token; the contact lands in the Lead
 * Tracker against a capture page owned by the workspace.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { userId: string; supabase: any };

export type InboundWebhook = {
  id: string;
  platform: string;
  token: string;
  landingPageId: string | null;
  createdAt: string;
};

const PLATFORMS = ["gojiberry"] as const;

async function requireOwnedProject(ctx: Ctx, projectId: string) {
  const { data, error } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That workspace isn't yours.");
  return projectId;
}

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const getInboundWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ workspaceId: z.string().uuid(), platform: z.enum(PLATFORMS).default("gojiberry") })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InboundWebhook | null> => {
    const ctx = context as unknown as Ctx;
    await requireOwnedProject(ctx, data.workspaceId);
    const { data: row, error } = await ctx.supabase
      .from("inbound_webhook_tokens")
      .select("id, platform, token, landing_page_id, created_at")
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .eq("platform", data.platform)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      id: row.id as string,
      platform: row.platform as string,
      token: row.token as string,
      landingPageId: (row.landing_page_id as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  });

/**
 * Creates (or replaces) the secret for a platform, along with the hidden
 * capture page its contacts are filed against.
 */
export const createInboundWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ workspaceId: z.string().uuid(), platform: z.enum(PLATFORMS).default("gojiberry") })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InboundWebhook> => {
    const ctx = context as unknown as Ctx;
    await requireOwnedProject(ctx, data.workspaceId);

    const { data: existing } = await ctx.supabase
      .from("inbound_webhook_tokens")
      .select("id, landing_page_id")
      .eq("user_id", ctx.userId)
      .eq("project_id", data.workspaceId)
      .eq("platform", data.platform)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let landingPageId: string | null = (existing?.landing_page_id as string | null) ?? null;
    if (!landingPageId) {
      const slug = `${data.platform}-leads-${Math.random().toString(36).slice(2, 8)}`;
      const { data: page, error: pageErr } = await ctx.supabase
        .from("landing_pages")
        .insert({
          user_id: ctx.userId,
          project_id: data.workspaceId,
          title: "Gojiberry contacts",
          slug,
          status: "draft",
          content: { headline: "Gojiberry contacts", subheadline: "Contacts sent in from Gojiberry." },
        })
        .select("id")
        .single();
      if (pageErr) throw new Error(pageErr.message);
      landingPageId = page.id as string;
    }

    const token = newToken();
    if (existing?.id) {
      const { error } = await ctx.supabase
        .from("inbound_webhook_tokens")
        .update({ token, landing_page_id: landingPageId })
        .eq("user_id", ctx.userId)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return {
        id: existing.id as string,
        platform: data.platform,
        token,
        landingPageId,
        createdAt: new Date().toISOString(),
      };
    }

    const { data: row, error } = await ctx.supabase
      .from("inbound_webhook_tokens")
      .insert({
        user_id: ctx.userId,
        project_id: data.workspaceId,
        platform: data.platform,
        token,
        landing_page_id: landingPageId,
      })
      .select("id, platform, token, landing_page_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: row.id as string,
      platform: row.platform as string,
      token: row.token as string,
      landingPageId: (row.landing_page_id as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  });

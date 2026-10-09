import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AnalyticsLead = {
  id: string;
  status: string;
  created_at: string;
  page_id: string;
  page_title: string;
  page_slug: string | null;
  campaign_id: string | null;
  campaign_title: string | null;
};

/**
 * Every landing page sign-up in the selected workspace, with the page and
 * campaign it belongs to. Aggregation happens on the screen so the date-range
 * switch never needs another round trip.
 */
export const getLeadAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid().nullish() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ leads: AnalyticsLead[]; pages: number }> => {
    const { supabase, userId } = context;

    // Pages owned by this user, scoped to the selected client. Pages saved
    // before clients existed carry no project and stay visible.
    let pageQuery = supabase.from("landing_pages").select("id, title, slug, project_id").eq("user_id", userId);
    if (data.projectId) pageQuery = pageQuery.or(`project_id.eq.${data.projectId},project_id.is.null`);
    const { data: pages, error: pageError } = await pageQuery;
    if (pageError) throw pageError;

    const pageIds = (pages ?? []).map((p: { id: string }) => p.id);
    if (pageIds.length === 0) return { leads: [], pages: 0 };

    const { data: rows, error } = await supabase
      .from("landing_page_leads")
      .select("id, status, created_at, page_id, campaign_id")
      .in("page_id", pageIds)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    const campaignIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r: { campaign_id: string | null }) => r.campaign_id)
          .filter(Boolean) as string[],
      ),
    );
    const campaignNames = new Map<string, string>();
    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, campaign_title")
        .in("id", campaignIds);
      (campaigns ?? []).forEach((c: { id: string; campaign_title: string | null }) =>
        campaignNames.set(c.id, c.campaign_title ?? "Untitled campaign"),
      );
    }

    const pageById = new Map(
      (pages ?? []).map((p: { id: string; title: string | null; slug: string | null }) => [p.id, p]),
    );

    const leads: AnalyticsLead[] = (rows ?? []).map((r) => {
      const page = pageById.get(r.page_id as string);
      const campaignId = (r.campaign_id as string | null) ?? null;
      return {
        id: r.id as string,
        status: ((r.status as string | null) ?? "new").toLowerCase(),
        created_at: r.created_at as string,
        page_id: r.page_id as string,
        page_title: page?.title || "Untitled page",
        page_slug: page?.slug ?? null,
        campaign_id: campaignId,
        campaign_title: campaignId ? campaignNames.get(campaignId) ?? null : null,
      };
    });

    return { leads, pages: pageIds.length };
  });

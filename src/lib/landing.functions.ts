import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { currentPhase } from "./phases";


export type LandingStatus = "draft" | "live" | "unpublished";
export type LandingFont = "modern" | "classic" | "bold" | "minimal";

export type LandingContent = {
  headline: string;
  subheadline: string;
  heroPath: string | null;
  bodyEnabled: boolean;
  bodyHtml: string;
  formHeading: string;
  fields: { lastName: boolean; company: boolean; phone: boolean };
  buttonLabel: string;
  thankYou: string;
  showLogo: boolean;
  logoUrl: string | null;
  /** Storage path of the Strategy Profile logo (scheduler-media); signed on read. */
  logoPath: string | null;
  brandColour: string;
  secondaryColour: string;
  font: LandingFont;
  /** Small "Powered by haaylo" line at the foot of the public page. */
  showBadge: boolean;
  seoTitle: string;
  seoDescription: string;
};


export type LandingPage = {
  id: string;
  title: string;
  slug: string;
  status: LandingStatus;
  campaignId?: string | null;

  content: LandingContent;
  leadCount: number;
  updated_at: string;
};

export const DEFAULT_CONTENT: LandingContent = {
  headline: "A headline that says what they get",
  subheadline: "One line on who it's for and why it helps.",
  heroPath: null,
  bodyEnabled: false,
  bodyHtml: "",
  formHeading: "Get your free resource",
  fields: { lastName: false, company: false, phone: false },
  buttonLabel: "Send it to me",
  thankYou: "You're in! Check your inbox.",
  showLogo: true,
  logoUrl: null,
  logoPath: null,
  brandColour: "#FF5C93",
  secondaryColour: "#141B3D",
  font: "modern",
  showBadge: true,
  seoTitle: "",
  seoDescription: "",
};

const contentSchema = z.object({
  headline: z.string().max(160).default(DEFAULT_CONTENT.headline),
  subheadline: z.string().max(300).default(DEFAULT_CONTENT.subheadline),
  heroPath: z.string().max(400).nullable().default(null),
  bodyEnabled: z.boolean().default(false),
  bodyHtml: z.string().max(20000).default(""),
  formHeading: z.string().max(160).default(DEFAULT_CONTENT.formHeading),
  fields: z
    .object({
      lastName: z.boolean().default(false),
      company: z.boolean().default(false),
      phone: z.boolean().default(false),
    })
    .default(DEFAULT_CONTENT.fields),
  buttonLabel: z.string().max(60).default(DEFAULT_CONTENT.buttonLabel),
  thankYou: z.string().max(300).default(DEFAULT_CONTENT.thankYou),
  showLogo: z.boolean().default(true),
  logoUrl: z.string().max(1000).nullable().default(null),
  logoPath: z.string().max(400).nullable().default(null),
  brandColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FF5C93"),
  secondaryColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#141B3D"),
  font: z.enum(["modern", "classic", "bold", "minimal"]).default("modern"),
  showBadge: z.boolean().default(true),
  seoTitle: z.string().max(70).default(""),
  seoDescription: z.string().max(155).default(""),
});


export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function mergeContent(raw: unknown): LandingContent {
  const parsed = contentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_CONTENT };
}

type BrandDefaults = {
  brandColour: string | null;
  secondaryColour: string | null;
  accentColour: string | null;
  font: LandingFont | null;
  logoPath: string | null;
};

const EMPTY_BRAND: BrandDefaults = { brandColour: null, secondaryColour: null, accentColour: null, font: null, logoPath: null };

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function expandHex(hex: string): string {
  const h = hex.trim();
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`.toLowerCase();
  return h.toLowerCase();
}

/** Map a free-text Brand DNA font preference onto one of the page fonts. */
function mapFont(pref: string | undefined): LandingFont | null {
  const p = (pref ?? "").toLowerCase();
  if (!p.trim()) return null;
  // Exact values written by the Brand Assets screen.
  if (p === "modern" || p === "classic" || p === "bold" || p === "minimal") return p;
  if (/merriweather|serif|georgia|times|classic|editorial/.test(p) && !/sans/.test(p)) return "classic";
  if (/montserrat|bold|impact|archivo|display|heavy/.test(p)) return "bold";
  if (/dm sans|minimal|clean/.test(p)) return "minimal";
  return "modern";
}

/** Pull the brand colours, font preference and logo from the user's Brand DNA. */
async function brandDefaults(
  supabase: { from: (t: string) => any },
  preferredProjectId?: string,
): Promise<BrandDefaults> {
  try {
    let projectId = preferredProjectId;
    if (!projectId) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, is_default, created_at")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
      projectId = projects?.[0]?.id as string | undefined;
    }
    if (!projectId) return EMPTY_BRAND;

    const [{ data: brainRow }, { data: logoRow }] = await Promise.all([
      supabase.from("business_brains").select("data").eq("project_id", projectId).maybeSingle(),
      supabase
        .from("brain_assets")
        .select("storage_path")
        .eq("project_id", projectId)
        .eq("kind", "logo")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const brand = (brainRow?.data as {
      brand?: {
        colors?: string;
        primary_color?: string;
        secondary_color?: string;
        accent_color?: string;
        font_preference?: string;
      };
    } | null)?.brand;

    const listed = (brand?.colors ?? "")
      .split(",")
      .map((c: string) => c.trim())
      .filter((c: string) => HEX.test(c));

    const primary = brand?.primary_color && HEX.test(brand.primary_color.trim())
      ? brand.primary_color.trim()
      : listed[0];
    const secondary = brand?.secondary_color && HEX.test(brand.secondary_color.trim())
      ? brand.secondary_color.trim()
      : listed[1];
    const accent = brand?.accent_color && HEX.test(brand.accent_color.trim())
      ? brand.accent_color.trim()
      : listed[2];

    return {
      brandColour: primary ? expandHex(primary) : null,
      secondaryColour: secondary ? expandHex(secondary) : accent ? expandHex(accent) : null,
      accentColour: accent ? expandHex(accent) : null,
      font: mapFont(brand?.font_preference),
      logoPath: (logoRow?.storage_path as string | undefined) ?? null,
    };
  } catch {
    return EMPTY_BRAND;
  }
}


/** Resolve the Strategy Profile logo path into a temporary display URL. */
async function withLogoUrl(content: LandingContent, seconds = 60 * 60): Promise<LandingContent> {
  if (!content.logoPath) return content;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: signed } = await supabaseAdmin.storage
    .from("scheduler-media")
    .createSignedUrl(content.logoPath, seconds);
  return signed?.signedUrl ? { ...content, logoUrl: signed.signedUrl } : content;
}

/** Brand colours, font and logo from Brand DNA, for the builder. */
export const getBrandDefaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrandDefaults & { logoUrl: string | null }> => {
    const brand = await brandDefaults(context.supabase as never);

    let logoUrl: string | null = null;
    if (brand.logoPath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("scheduler-media")
        .createSignedUrl(brand.logoPath, 60 * 60);
      logoUrl = signed?.signedUrl ?? null;
    }
    return { ...brand, logoUrl };
  });

/** All landing pages for the signed-in user, newest first, with lead counts. */
export const listLandingPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string } | undefined) =>
    z.object({ projectId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data: input, context }): Promise<LandingPage[]> => {
    let query = context.supabase
      .from("landing_pages")
      .select("id, title, slug, status, content, updated_at, landing_page_leads(count)")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (input.projectId) {
      query = query.or(`project_id.eq.${input.projectId},project_id.is.null`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const counts = row.landing_page_leads as unknown as Array<{ count: number }> | null;
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status as LandingStatus,
        content: mergeContent(row.content),
        leadCount: counts?.[0]?.count ?? 0,
        updated_at: row.updated_at,
      };
    });
  });

export const getLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<LandingPage> => {
    const { data: row, error } = await context.supabase
      .from("landing_pages")
      .select("id, title, slug, status, content, campaign_id, updated_at, landing_page_leads(count)")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That page could not be found.");
    const counts = row.landing_page_leads as unknown as Array<{ count: number }> | null;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status as LandingStatus,
      campaignId: (row.campaign_id as string | null) ?? null,
      content: await withLogoUrl(mergeContent(row.content)),

      leadCount: counts?.[0]?.count ?? 0,
      updated_at: row.updated_at,
    };
  });

async function uniqueSlug(
  supabase: { from: (t: string) => any },
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(base) || "page";
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    let q = supabase.from("landing_pages").select("id").eq("slug", candidate).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    if (!data || data.length === 0) return candidate;
  }
  return `${root}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Create a blank page and return it, ready for the builder. */
export const createLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId?: string } | undefined) =>
    z.object({ projectId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data: input, context }): Promise<{ id: string }> => {
    const slug = await uniqueSlug(context.supabase as never, "untitled-page");
    const brand = await brandDefaults(context.supabase as never, input.projectId);
    const content: LandingContent = {
      ...DEFAULT_CONTENT,
      brandColour: brand.brandColour ?? DEFAULT_CONTENT.brandColour,
      logoPath: brand.logoPath,
    };
    const { data, error } = await context.supabase
      .from("landing_pages")
      .insert({
        user_id: context.userId,
        project_id: input.projectId ?? null,
        title: "Untitled page",
        slug,
        status: "draft",
        content: content as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { fileLandingPage } = await import("./packages.server");
    await fileLandingPage(
      { userId: context.userId, supabase: context.supabase },
      { projectId: input.projectId, pageId: data.id, title: "Untitled page", source: "manual" },
    );
    return { id: data.id };
  });

export const saveLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id: string;
    title: string;
    slug: string;
    content: LandingContent;
    publish?: boolean;
    campaignId?: string | null;
  }) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        slug: z.string().trim().min(1).max(60),
        content: contentSchema,
        publish: z.boolean().optional(),
        campaignId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ slug: string; status: LandingStatus }> => {
    const slug = await uniqueSlug(context.supabase as never, data.slug, data.id);
    const patch = {
      title: data.title,
      slug,
      content: data.content as never,
      ...(data.campaignId === undefined ? {} : { campaign_id: data.campaignId }),
      ...(data.publish ? { status: "live" } : {}),
    };

    const { data: row, error } = await context.supabase
      .from("landing_pages")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("slug, status")
      .single();
    if (error) throw new Error(error.message);
    return { slug: row.slug, status: row.status as LandingStatus };
  });

export const setLandingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: LandingStatus }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["draft", "live", "unpublished"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("landing_pages")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("landing_pages")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Signed upload URL for a hero image, scoped to the caller's folder. */
export const getLandingUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { filename: string }) =>
    z.object({ filename: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ext = data.filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin
      .storage.from("landing-media")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not start that upload.");
    return { path, signedUrl: signed.signedUrl, token: signed.token };
  });

/** Signed read URL so the builder preview can show an uploaded hero. */
export const getLandingMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { path: string }) => z.object({ path: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase
      .storage.from("landing-media")
      .createSignedUrl(data.path, 60 * 60);
    if (error || !signed) return { url: null as string | null };
    return { url: signed.signedUrl };
  });

export type PublicLandingPage = {
  id: string;
  title: string;
  content: LandingContent;
  heroUrl: string | null;
  businessName: string | null;
  campaign: {
    id: string;
    duration: string;
    phase: number;
    hasGuide: boolean;
    checkoutUrl: string | null;
    cartClosesAt: string | null;
  } | null;
};


/** Public read for a live page (no auth) — used by /p/$slug. */
export const getPublicLandingPage = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string }) =>
    z.object({ slug: z.string().trim().min(1).max(80) }).parse(data),
  )
  .handler(async ({ data }): Promise<PublicLandingPage | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("landing_pages")
      .select("id, title, content, status, project_id, campaign_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!row || row.status !== "live") return null;

    let content = await withLogoUrl(mergeContent(row.content), 60 * 60 * 24);

    // Brand DNA fills anything the page hasn't overridden.
    let businessName: string | null = null;
    if (row.project_id) {
      const brand = await brandDefaults(supabaseAdmin as never, row.project_id as string);
      const { data: brainRow } = await supabaseAdmin
        .from("business_brains")
        .select("data")
        .eq("project_id", row.project_id as string)
        .maybeSingle();
      businessName =
        ((brainRow?.data as { business?: { name?: string } } | null)?.business?.name ?? "").trim() || null;
      content = {
        ...content,
        secondaryColour: brand.secondaryColour ?? content.secondaryColour,
        logoUrl: content.logoUrl ?? null,
        font: brand.font ?? content.font,
      };
    }

    let campaign: PublicLandingPage["campaign"] = null;
    if (row.campaign_id) {
      const { data: c } = await supabaseAdmin
        .from("campaigns")
        .select(
          "id, campaign_duration, current_phase, phase_override, phase_started_at, created_at, landing_page_headline, landing_page_subheadline, lead_magnet_content, checkout_url, cart_closes_at",
        )
        .eq("id", row.campaign_id as string)
        .maybeSingle();
      if (c) {
        const headline = (c.landing_page_headline as string | null) ?? "";
        const subheadline = (c.landing_page_subheadline as string | null) ?? "";
        if (headline.trim()) content = { ...content, headline };
        if (subheadline.trim()) content = { ...content, subheadline };
        campaign = {
          id: c.id as string,
          duration: (c.campaign_duration as string) ?? "90-day",
          phase: currentPhase(c as never),
          hasGuide: !!c.lead_magnet_content,
          checkoutUrl: ((c.checkout_url as string | null) ?? null) || null,
          cartClosesAt: (c.cart_closes_at as string | null) ?? null,
        };
      }
    }


    let heroUrl: string | null = null;
    if (content.heroPath) {
      const { data: signed } = await supabaseAdmin
        .storage.from("landing-media")
        .createSignedUrl(content.heroPath, 60 * 60 * 24);
      heroUrl = signed?.signedUrl ?? null;
    }
    return { id: row.id, title: row.title, content, heroUrl, businessName, campaign };
  });

/** Public lead submission from a live page. */
export const submitLandingLead = createServerFn({ method: "POST" })
  .inputValidator((data: {
    pageId: string;
    firstName: string;
    email: string;
    lastName?: string;
    company?: string;
    phone?: string;
  }) =>
    z
      .object({
        pageId: z.string().uuid(),
        firstName: z.string().trim().min(1).max(80),
        email: z.string().trim().email().max(255),
        lastName: z.string().trim().max(80).optional(),
        company: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: true; campaignId: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page } = await supabaseAdmin
      .from("landing_pages")
      .select("id, status, slug, title, campaign_id, user_id")
      .eq("id", data.pageId)
      .maybeSingle();
    if (!page || page.status !== "live") throw new Error("This page is not accepting sign-ups.");
    const campaignId = (page.campaign_id as string | null) ?? null;
    const { data: inserted, error } = await supabaseAdmin
      .from("landing_page_leads")
      .insert({
        page_id: data.pageId,
        first_name: data.firstName,
        last_name: data.lastName ?? null,
        email: data.email,
        company: data.company ?? null,
        phone: data.phone ?? null,
        campaign_id: campaignId,
        source_slug: (page.slug as string | null) ?? null,
        status: "new",
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("Could not save that, please try again.");

    // Push to the owner's email list. A list problem must never cost a lead,
    // so the outcome is recorded on the row and the sign-up still succeeds.
    try {
      const { getMailchimpCreds, getPrimaryAudienceId, upsertSubscriber } = await import(
        "./mailchimp-leads.server"
      );
      const creds = await getMailchimpCreds(supabaseAdmin, page.user_id as string);
      if (creds) {
        let tag = (page.title as string | null) ?? "Haaylo";
        if (campaignId) {
          const { data: c } = await supabaseAdmin
            .from("campaigns")
            .select("campaign_title")
            .eq("id", campaignId)
            .maybeSingle();
          tag = (c?.campaign_title as string | null)?.trim() || tag;
        }
        const audienceId = await getPrimaryAudienceId(creds);
        await upsertSubscriber(creds, audienceId, {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName ?? null,
          tags: ["Haaylo", tag],
        });
        await supabaseAdmin
          .from("landing_page_leads")
          .update({ synced_at: new Date().toISOString(), sync_error: null })
          .eq("id", inserted.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not add this lead to the email list.";
      console.error(`Mailchimp lead sync failed: ${msg}`);
      await supabaseAdmin
        .from("landing_page_leads")
        .update({ sync_error: msg.slice(0, 400) })
        .eq("id", inserted.id);
    }

    return { ok: true, campaignId };
  });


export type PublicGuide = {
  title: string;
  intro: string;
  sections: Array<{ heading: string; body: string }>;
  brandColour: string;
  secondaryColour: string;
  font: LandingFont;
  logoUrl: string | null;
  businessName: string | null;
  coverUrl: string | null;
  empty: boolean;
};

/** Public read of a campaign's lead magnet guide — used by /guide/$campaignId. */
export const getPublicGuide = createServerFn({ method: "POST" })
  .inputValidator((d: { campaignId: string }) =>
    z.object({ campaignId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }): Promise<PublicGuide | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin
      .from("campaigns")
      .select("id, campaign_title, project_id, user_id, lead_magnet_content, guide_title, guide_intro, guide_sections, guide_cover_url")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!c) return null;

    const projectId = (c.project_id as string | null) ?? undefined;
    const brand = await brandDefaults(supabaseAdmin as never, projectId);
    let businessName: string | null = null;
    let logoUrl: string | null = null;
    if (projectId) {
      const { data: brainRow } = await supabaseAdmin
        .from("business_brains")
        .select("data")
        .eq("project_id", projectId)
        .maybeSingle();
      businessName =
        ((brainRow?.data as { business?: { name?: string } } | null)?.business?.name ?? "").trim() || null;
    }
    if (brand.logoPath) {
      const { data: signed } = await supabaseAdmin.storage
        .from("scheduler-media")
        .createSignedUrl(brand.logoPath, 60 * 60 * 24);
      logoUrl = signed?.signedUrl ?? null;
    }

    // Prefer the dedicated guide fields; fall back to lead_magnet_content,
    // then to the latest lead magnet generated for this workspace.
    let sections = normaliseGuide(c.guide_sections);
    if (sections.length === 0) sections = normaliseGuide(c.lead_magnet_content);
    if (sections.length === 0) {
      let q = supabaseAdmin
        .from("funnels")
        .select("magnet_output, created_at, project_id")
        .eq("user_id", c.user_id as string)
        .order("created_at", { ascending: false })
        .limit(1);
      if (projectId) q = q.eq("project_id", projectId);
      const { data: funnels } = await q;
      const text = (funnels?.[0]?.magnet_output as string | undefined) ?? "";
      if (text.trim()) sections = [{ heading: "", body: text }];
    }

    return {
      title: ((c.guide_title as string | null) ?? "").trim() || ((c.campaign_title as string) ?? "Your guide"),
      intro: ((c.guide_intro as string | null) ?? "").trim(),
      sections,
      brandColour: brand.brandColour ?? DEFAULT_CONTENT.brandColour,
      secondaryColour: brand.secondaryColour ?? DEFAULT_CONTENT.secondaryColour,
      font: brand.font ?? "modern",
      logoUrl,
      businessName,
      coverUrl: ((c.guide_cover_url as string | null) ?? null),
      empty: sections.length === 0,
    };
  });

/** Accept either a plain string, an array of sections, or { sections: [...] }. */
function normaliseGuide(raw: unknown): Array<{ heading: string; body: string }> {
  if (!raw) return [];
  if (typeof raw === "string") return raw.trim() ? [{ heading: "", body: raw }] : [];
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { sections?: unknown }).sections)
      ? ((raw as { sections: unknown[] }).sections)
      : [];
  return arr
    .map((s) => {
      if (typeof s === "string") return { heading: "", body: s };
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        heading: String(o.heading ?? o.section_heading ?? o.title ?? ""),
        body: String(o.body ?? o.section_body ?? o.content ?? o.text ?? ""),
      };
    })
    .filter((s) => s.heading.trim() || s.body.trim());
}


/** Build a real landing page from a generated lead magnet kit. */
export const createLandingPageFromMagnet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid().optional(),
        campaignId: z.string().uuid().optional(),

        title: z.string().max(160).default("Lead magnet page"),
        headline: z.string().max(160).default(DEFAULT_CONTENT.headline),
        subheadline: z.string().max(300).default(DEFAULT_CONTENT.subheadline),
        bodyHtml: z.string().max(20000).default(""),
        formHeading: z.string().max(160).default(DEFAULT_CONTENT.formHeading),
        buttonLabel: z.string().max(60).default(DEFAULT_CONTENT.buttonLabel),
        brandColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        seoDescription: z.string().max(155).default(""),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data: input, context }): Promise<{ id: string; slug: string }> => {
    const slug = await uniqueSlug(context.supabase as never, input.title || "lead-magnet");
    const brand = await brandDefaults(context.supabase as never, input.projectId);
    const content: LandingContent = {
      ...DEFAULT_CONTENT,
      headline: input.headline,
      subheadline: input.subheadline,
      bodyEnabled: input.bodyHtml.trim().length > 0,
      bodyHtml: input.bodyHtml,
      formHeading: input.formHeading,
      buttonLabel: input.buttonLabel,
      brandColour: input.brandColour ?? brand.brandColour ?? DEFAULT_CONTENT.brandColour,
      logoPath: brand.logoPath,
      seoTitle: input.title.slice(0, 70),
      seoDescription: input.seoDescription,
    };
    const { data, error } = await context.supabase
      .from("landing_pages")
      .insert({
        user_id: context.userId,
        project_id: input.projectId ?? null,
        campaign_id: input.campaignId ?? null,

        title: input.title || "Lead magnet page",
        slug,
        status: "draft",
        content: content as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { fileLandingPage } = await import("./packages.server");
    await fileLandingPage(
      { userId: context.userId, supabase: context.supabase },
      { projectId: input.projectId, pageId: data.id, title: input.title || "Lead magnet page", campaignId: input.campaignId ?? null },
    );
    return { id: data.id, slug };
  });

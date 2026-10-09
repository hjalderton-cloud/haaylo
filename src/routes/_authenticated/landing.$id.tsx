import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PINK, MUTED } from "@/components/WorkflowNav";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_CONTENT,
  getLandingMediaUrl,
  getLandingPage,
  getLandingUploadUrl,
  getBrandDefaults,
  saveLandingPage,
  slugify,
  type LandingContent,
  type LandingFont,
} from "@/lib/landing.functions";
import { listCampaigns } from "@/lib/campaigns.functions";
import { useWorkspace } from "@/hooks/useActiveProject";
import { FONT_STACKS, heroBackground, sanitiseRichText } from "@/lib/landing-render";
import { SURFACE, NAVY, INDIGO, GREY, LINE, TINT, font as themeFont } from "@/lib/theme";
import { refinePostGraphic } from "@/lib/image.functions";
import { ImageTweakControl } from "@/components/ImageTweakControl";


export const Route = createFileRoute("/_authenticated/landing/$id")({
  head: () => ({
    meta: [
      { title: "Page builder — haaylo" },
      { name: "description", content: "Design a landing page and see it update live as you type." },
      { property: "og:title", content: "Page builder — haaylo" },
      { property: "og:description", content: "Design a landing page and publish it in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuilderPage,
});

const PUBLIC_HOST = "haaylo.com";

function BuilderPage() {
  const { id } = Route.useParams();
  const { projectId } = useWorkspace();
  const navigate = useNavigate();
  const getFn = useServerFn(getLandingPage);
  const saveFn = useServerFn(saveLandingPage);
  const uploadUrlFn = useServerFn(getLandingUploadUrl);
  const mediaUrlFn = useServerFn(getLandingMediaUrl);
  const brandFn = useServerFn(getBrandDefaults);

  const [title, setTitle] = useState("Untitled page");
  const [slug, setSlug] = useState("untitled-page");
  const [slugTouched, setSlugTouched] = useState(false);
  const [content, setContent] = useState<LandingContent>(DEFAULT_CONTENT);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; campaign_title: string }>>([]);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [seoOpen, setSeoOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const listCampaignsFn = useServerFn(listCampaigns);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listCampaignsFn({ data: { projectId } });
        if (!cancelled) setCampaigns(rows.map((r) => ({ id: r.id, campaign_title: r.campaign_title })));
      } catch {
        /* campaign linking is optional */
      }
    })();
    return () => { cancelled = true; };
  }, [listCampaignsFn, projectId]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await getFn({ data: { id } });
        if (cancelled) return;
        setTitle(page.title);
        setSlug(page.slug);
        // Untouched default slugs keep tracking the title as the user types.
        setSlugTouched(!/^untitled-page(-\d+)?$/.test(page.slug));
        setContent(page.content);
        setCampaignId(page.campaignId ?? null);

        if (page.content.heroPath) {
          const { url } = await mediaUrlFn({ data: { path: page.content.heroPath } });
          if (!cancelled) setHeroUrl(url);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not open that page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, getFn, mediaUrlFn]);

  // Seed the rich text editor once, so typing isn't interrupted by re-renders.
  useEffect(() => {
    if (!loading && bodyRef.current && bodyRef.current.innerHTML === "") {
      bodyRef.current.innerHTML = content.bodyHtml;
    }
  }, [loading, content.bodyHtml]);

  const set = useCallback(<K extends keyof LandingContent>(key: K, value: LandingContent[K]) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  }, []);

  const pullBrand = useCallback(async () => {
    try {
      const brand = await brandFn({ data: undefined as never });
      if (!brand.brandColour && !brand.logoPath) {
        toast.error("No brand colour or logo in your Strategy Profile yet.");
        return;
      }
      setContent((prev) => ({
        ...prev,
        brandColour: brand.brandColour ?? prev.brandColour,
        secondaryColour: brand.secondaryColour ?? prev.secondaryColour,
        font: brand.font ?? prev.font,
        logoPath: brand.logoPath ?? prev.logoPath,
        logoUrl: brand.logoUrl ?? prev.logoUrl,
      }));

      toast.success("Pulled your brand colour and logo.");
    } catch {
      toast.error("Couldn't read your Strategy Profile just now.");
    }
  }, [brandFn]);

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function uploadHero(file: File) {
    try {
      const { path, token } = await uploadUrlFn({ data: { filename: file.name } });
      const { error } = await supabase.storage.from("landing-media").uploadToSignedUrl(path, token, file);
      if (error) throw error;
      set("heroPath", path);
      const { url } = await mediaUrlFn({ data: { path } });
      setHeroUrl(url);
      toast.success("Hero image added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That image would not upload.");
    }
  }

  async function tweakHero(instruction: string) {
    if (!projectId) throw new Error("Pick a workspace first, then try again.");
    if (!content.heroPath && !heroUrl) throw new Error("Add a hero image first.");
    const next = await refinePostGraphic({
      data: {
        instruction,
        projectId,
        destination: "landing",
        ...(content.heroPath ? { imagePath: content.heroPath } : { imageUrl: heroUrl ?? undefined }),
      },
    });
    const updated = { ...content, heroPath: next.path };
    await saveFn({ data: { id, title: title.trim() || "Untitled page", slug: slugify(slug) || "page", content: updated, campaignId } });
    setContent(updated);
    setHeroUrl(next.url);
    toast.success("Hero image updated and saved.");
  }

  async function save(publish: boolean) {
    const html = bodyRef.current ? sanitiseRichText(bodyRef.current.innerHTML) : content.bodyHtml;
    const payload = { ...content, bodyHtml: html };
    setSaving(publish ? "publish" : "draft");
    try {
      const res = await saveFn({
        data: { id, title: title.trim() || "Untitled page", slug: slugify(slug) || "page", content: payload, publish, campaignId },
      });
      setSlug(res.slug);
      setContent(payload);
      toast.success(publish ? "Your page is live." : "Draft saved.");
      if (publish) await navigate({ to: "/landing" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that page.");
    } finally {
      setSaving(null);
    }
  }

  function format(command: "bold" | "insertUnorderedList" | "createLink") {
    if (command === "createLink") {
      const href = window.prompt("Link address (https://…)");
      if (!href || !/^https?:\/\//i.test(href)) return;
      document.execCommand("createLink", false, href);
      return;
    }
    document.execCommand(command);
  }

  return (
    <AppShell title="Page builder">
      <div style={{ padding: "4px 0 40px" }}>
        <button type="button" onClick={() => navigate({ to: "/landing" })} style={backBtn}>
          ← Back to Landing Pages
        </button>

        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap", marginTop: 14 }}>
          {/* ---------------- Left: controls ---------------- */}
          <div style={{ flex: "1 1 340px", minWidth: 300, maxWidth: 460, display: "grid", gap: 14 }}>
            {loading ? (
              <div style={panel}>Loading…</div>
            ) : (
              <>
                <section style={panel}>
                  <h2 style={sectionTitle}>Page basics</h2>
                  <label style={label}>Internal page title</label>
                  <input value={title} onChange={(e) => onTitleChange(e.target.value)} style={input} />
                  <p style={hint}>Only you see this.</p>

                  <label style={label}>Page slug</label>
                  <input
                    value={slug}
                    onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
                    onBlur={() => setSlug(slugify(slug))}
                    style={input}
                  />
                  <p style={hint}>{PUBLIC_HOST}/p/{slugify(slug) || "your-page"}</p>
                </section>

                <section style={panel}>
                  <h2 style={sectionTitle}>Hero</h2>
                  <label style={label}>Headline</label>
                  <input value={content.headline} onChange={(e) => set("headline", e.target.value)} style={input} />
                  <label style={label}>Subheadline</label>
                  <input value={content.subheadline} onChange={(e) => set("subheadline", e.target.value)} style={input} />
                  <label style={label}>Hero image (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadHero(f); }}
                    style={{ ...input, padding: 8 }}
                  />
                  {content.heroPath && (
                    <button
                      type="button"
                      onClick={() => { set("heroPath", null); setHeroUrl(null); }}
                      style={ghost}
                    >
                      Remove image
                    </button>
                  )}
                  {heroUrl ? (
                    <div style={{ marginTop: 8 }}>
                      <ImageTweakControl compact disabled={!projectId} onApply={tweakHero} />
                    </div>
                  ) : null}
                  <p style={hint}>No image? The hero uses your brand colour.</p>
                </section>

                <section style={panel}>
                  <div style={rowBetween}>
                    <h2 style={sectionTitle}>Body</h2>
                    <Toggle on={content.bodyEnabled} onChange={(v) => set("bodyEnabled", v)} />
                  </div>
                  {content.bodyEnabled && (
                    <>
                      <div style={{ display: "flex", gap: 6, margin: "6px 0 8px" }}>
                        <button type="button" onClick={() => format("bold")} style={toolBtn}><b>B</b></button>
                        <button type="button" onClick={() => format("insertUnorderedList")} style={toolBtn}>• List</button>
                        <button type="button" onClick={() => format("createLink")} style={toolBtn}>Link</button>
                      </div>
                      <div
                        ref={bodyRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => set("bodyHtml", (e.target as HTMLDivElement).innerHTML)}
                        style={{ ...input, minHeight: 130, textAlign: "left", lineHeight: 1.6 }}
                      />
                    </>
                  )}
                </section>

                <section style={panel}>
                  <h2 style={sectionTitle}>Lead capture form</h2>
                  <label style={label}>Form heading</label>
                  <input value={content.formHeading} onChange={(e) => set("formHeading", e.target.value)} style={input} />

                  <p style={{ ...label, marginTop: 12 }}>Fields to show</p>
                  <Check label="First name (always on)" checked disabled />
                  <Check label="Email address (always on)" checked disabled />
                  <Check
                    label="Last name"
                    checked={content.fields.lastName}
                    onChange={(v) => set("fields", { ...content.fields, lastName: v })}
                  />
                  <Check
                    label="Company name"
                    checked={content.fields.company}
                    onChange={(v) => set("fields", { ...content.fields, company: v })}
                  />
                  <Check
                    label="Phone number"
                    checked={content.fields.phone}
                    onChange={(v) => set("fields", { ...content.fields, phone: v })}
                  />

                  <label style={label}>Button label</label>
                  <input value={content.buttonLabel} onChange={(e) => set("buttonLabel", e.target.value)} style={input} />
                  <label style={label}>Thank you message</label>
                  <input value={content.thankYou} onChange={(e) => set("thankYou", e.target.value)} style={input} />
                </section>

                <section style={panel}>
                  <h2 style={sectionTitle}>Branding</h2>
                  <div style={rowBetween}>
                    <span style={{ color: INDIGO, fontSize: 13 }}>Show your logo</span>
                    <Toggle on={content.showLogo} onChange={(v) => set("showLogo", v)} />
                  </div>
                  <label style={label}>Brand colour</label>
                  <input
                    type="color"
                    value={content.brandColour}
                    onChange={(e) => set("brandColour", e.target.value)}
                    style={{ ...input, height: 42, padding: 4 }}
                  />
                  <label style={label}>Secondary colour</label>
                  <input
                    type="color"
                    value={content.secondaryColour}
                    onChange={(e) => set("secondaryColour", e.target.value)}
                    style={{ ...input, height: 42, padding: 4 }}
                  />
                  <button
                    type="button"
                    onClick={() => void pullBrand()}
                    style={{ ...ghost, marginTop: 10, width: "100%" }}
                  >
                    Use my Strategy Profile logo &amp; colour
                  </button>

                  <label style={label}>Font style</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["modern", "classic", "bold", "minimal"] as LandingFont[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => set("font", f)}
                        style={{
                          ...ghost,
                          flex: 1,
                          textTransform: "capitalize",
                          background: content.font === f ? TINT.pink : "#FFFFFF",
                          color: content.font === f ? PINK : INDIGO,
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </section>

                <section style={panel}>
                  <h2 style={sectionTitle}>Campaign &amp; footer</h2>
                  <label style={label}>Linked campaign</label>
                  <select
                    value={campaignId ?? ""}
                    onChange={(e) => setCampaignId(e.target.value || null)}
                    style={input}
                  >
                    <option value="">Not linked to a campaign</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.campaign_title}</option>
                    ))}
                  </select>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: MUTED }}>
                    Linking sends sign-ups straight to that campaign&rsquo;s guide.
                  </p>
                  <div style={{ ...rowBetween, marginTop: 12 }}>
                    <span style={{ color: INDIGO, fontSize: 13 }}>Show the Haaylo footer line</span>
                    <Toggle on={content.showBadge} onChange={(v) => set("showBadge", v)} />
                  </div>
                </section>


                <section style={panel}>
                  <button type="button" onClick={() => setSeoOpen((v) => !v)} style={{ ...rowBetween, ...bareBtn }}>
                    <h2 style={sectionTitle}>Search &amp; sharing</h2>
                    <span style={{ color: MUTED }}>{seoOpen ? "⌄" : "›"}</span>
                  </button>
                  {seoOpen && (
                    <>
                      <label style={label}>Browser tab title</label>
                      <input
                        value={content.seoTitle}
                        maxLength={70}
                        onChange={(e) => set("seoTitle", e.target.value)}
                        style={input}
                      />
                      <label style={label}>Meta description</label>
                      <textarea
                        value={content.seoDescription}
                        maxLength={155}
                        onChange={(e) => set("seoDescription", e.target.value)}
                        style={{ ...input, minHeight: 70 }}
                      />
                      <p style={hint}>{content.seoDescription.length}/155</p>
                    </>
                  )}
                </section>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => save(false)} disabled={saving !== null} style={ghost}>
                    {saving === "draft" ? "Saving…" : "Save draft"}
                  </button>
                  <button type="button" onClick={() => save(true)} disabled={saving !== null} style={primary}>
                    {saving === "publish" ? "Publishing…" : "Publish page"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ---------------- Right: live preview ---------------- */}
          <div style={{ flex: "1 1 420px", minWidth: 300, position: "sticky", top: 12 }}>
            <p style={{ ...hint, marginBottom: 6 }}>Live preview</p>
            <LandingPreview content={content} heroUrl={heroUrl} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/** Display-only render of the page, shared shape with the public page. */
export function LandingPreview({
  content,
  heroUrl,
}: {
  content: LandingContent;
  heroUrl: string | null;
}) {
  const font = FONT_STACKS[content.font];
  const body = useMemo(() => sanitiseRichText(content.bodyHtml), [content.bodyHtml]);

  return (
    <div
      style={{
        borderRadius: 18,
        overflow: "hidden",
        background: "#fff",
        color: "#1B1F35",
        boxShadow: "0 22px 50px rgba(0,0,0,0.35)",
        pointerEvents: "none",
        fontFamily: font.body,
      }}
    >
      <div
        style={{
          background: heroBackground(content, heroUrl),
          color: "#fff",
          padding: "48px 30px",
          textAlign: "center",
        }}
      >
        {content.showLogo && content.logoUrl && (
          <img src={content.logoUrl} alt="" style={{ height: 34, marginBottom: 16 }} />
        )}
        <h1 style={{ margin: 0, fontFamily: font.heading, fontWeight: font.weight, fontSize: 30, lineHeight: 1.2 }}>
          {content.headline}
        </h1>
        <p style={{ margin: "12px auto 0", maxWidth: 420, fontSize: 15, opacity: 0.92 }}>
          {content.subheadline}
        </p>
      </div>

      {content.bodyEnabled && body.trim() !== "" && (
        <div
          style={{ padding: "24px 30px", fontSize: 15, lineHeight: 1.65, color: "#3A3F5C" }}
          dangerouslySetInnerHTML={{ __html: body }}
        />
      )}

      <div style={{ padding: "24px 30px 34px", borderTop: "1px solid #EEF0F7" }}>
        <h2 style={{ margin: "0 0 14px", fontFamily: font.heading, fontWeight: font.weight, fontSize: 19 }}>
          {content.formHeading}
        </h2>
        <div style={{ display: "grid", gap: 9 }}>
          <PreviewField placeholder="First name" />
          {content.fields.lastName && <PreviewField placeholder="Last name" />}
          <PreviewField placeholder="Email address" />
          {content.fields.company && <PreviewField placeholder="Company name" />}
          {content.fields.phone && <PreviewField placeholder="Phone number" />}
          <div
            style={{
              marginTop: 4,
              background: content.brandColour,
              color: "#fff",
              borderRadius: 10,
              padding: "12px 16px",
              textAlign: "center",
              fontWeight: 800,
              fontFamily: font.heading,
            }}
          >
            {content.buttonLabel}
          </div>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#7B819C" }}>
          After sign-up: {content.thankYou}
        </p>
      </div>
    </div>
  );
}

function PreviewField({ placeholder }: { placeholder: string }) {
  return (
    <div
      style={{
        border: "1px solid #DFE2EE",
        borderRadius: 10,
        padding: "11px 13px",
        fontSize: 14,
        color: "#9BA1B8",
        background: "#FBFBFE",
      }}
    >
      {placeholder}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: on ? PINK : GREY,
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .15s ease",
        }}
      />
    </button>
  );
}

function Check({
  label: text,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", fontSize: 13.5, color: disabled ? GREY : INDIGO }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: PINK }}
      />
      {text}
    </label>
  );
}

const panel: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  padding: 16,
  color: INDIGO,
  fontFamily: themeFont,
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: NAVY,
  fontFamily: themeFont,
};

const label: React.CSSProperties = {
  display: "block",
  margin: "10px 0 5px",
  fontSize: 12,
  fontWeight: 700,
  color: GREY,
  fontFamily: themeFont,
};

const input: React.CSSProperties = {
  width: "100%",
  background: "#FFFFFF",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: "10px 12px",
  color: NAVY,
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: themeFont,
};

const hint: React.CSSProperties = { margin: "6px 0 0", fontSize: 12, color: GREY, fontFamily: themeFont };

const rowBetween: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
};

const bareBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
};

const primary: React.CSSProperties = {
  background: PINK,
  color: "#fff",
  border: "none",
  borderRadius: 999,
  padding: "11px 22px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: themeFont,
};

const ghost: React.CSSProperties = {
  background: "#FFFFFF",
  color: INDIGO,
  border: `1px solid ${LINE}`,
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 13.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: themeFont,
};

const toolBtn: React.CSSProperties = { ...ghost, padding: "6px 12px", fontSize: 12.5 };

const backBtn: React.CSSProperties = { ...ghost, padding: "7px 14px", fontSize: 13 };

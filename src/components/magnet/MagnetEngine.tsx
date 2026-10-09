import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LandingPreview } from "@/components/magnet/LandingPreview";
import { CoverThumb, EbookPreview } from "@/components/magnet/EbookPreview";
import { generateMagnetKit, getMagnetPrefill, saveMagnetToCampaign } from "@/lib/magnet.functions";
import { getBrandBrain } from "@/lib/brandbrain.functions";
import { getMailchimpSettings } from "@/lib/mailchimp.functions";
import { createLandingPageFromMagnet } from "@/lib/landing.functions";
import { useActiveProject } from "@/hooks/useActiveProject";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Copy, Download, Pencil, RefreshCw } from "lucide-react";
import { SURFACE, LINE, NAVY } from "@/lib/theme";
import { refinePostGraphic } from "@/lib/image.functions";
import { ImageTweakControl } from "@/components/ImageTweakControl";

import {
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  withAlpha,
  type CoverTemplate,
  type MagnetConfig,
} from "@/lib/magnet-schema";

const LOADING_STEPS = [
  "Reading your Brand DNA…",
  "Writing the landing page copy…",
  "Writing the guide pages…",
  "Painting the hero visual…",
  "Framing the cover artwork…",
  "Assembling your kit…",
];

const COVER_OPTIONS: { id: CoverTemplate; label: string; note: string }[] = [
  { id: "minimalist", label: "The Minimalist Executive", note: "Light, centred frame, serif type" },
  { id: "bold", label: "The Bold Creator", note: "Full-bleed brand colour, abstract overlay" },
  { id: "tech", label: "The Tech Modernist", note: "Dark slate, banner illustration" },
];

const MUTED = NAVY;

/** Shrinks the fixed-width A4 pages so a whole page fits the screen. */
function FitToWidth({ children }: { children: React.ReactNode }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, (el.clientWidth || 794) / 794));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={holder} className="w-full">
      <div style={{ width: 794, zoom: scale }}>
        {children}
      </div>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  goal: "goal",
  audience: "audience description",
  offer: "offer",
  tone: "tone",
  visual_style: "visual style",
};

/** Turns raw validation output into a sentence a person can act on. */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  try {
    const start = raw.indexOf("[");
    const issues = JSON.parse(start >= 0 ? raw.slice(start) : raw) as Array<{
      code?: string;
      maximum?: number;
      path?: (string | number)[];
    }>;
    if (Array.isArray(issues) && issues.length) {
      const i = issues[0]!;
      const field = FIELD_LABELS[String(i.path?.[0] ?? "")] ?? "one of the fields";
      if (i.code === "too_big") {
        return `Your ${field} is too long — please keep it shorter.`;
      }
      if (i.code === "too_small") {
        return `Please add a little more detail to your ${field}.`;
      }
      return `Please check your ${field} and try again.`;
    }
  } catch {
    /* not a validation payload — fall through */
  }
  return raw || "Something went wrong. Please try again.";
}

/** Turns a generated kit into plain text so it can live in the funnel record. */
export function kitToText(cfg: MagnetConfig): string {
  const l = cfg.landing;
  const e = cfg.ebook;
  const lines: string[] = [];
  lines.push(`**Landing page**`, `${l.hero.eyebrow} — ${l.hero.headline}`, l.hero.subheadline, `CTA: ${l.hero.cta_label}`, "");
  l.features.forEach((f) => lines.push(`- **${f.title}** — ${f.body}`));
  lines.push("", `**Opt-in**`, l.optin.heading, l.optin.body, `Button: ${l.optin.button_label}`, "");
  lines.push(`**Guide**`, `${e.title} — ${e.subtitle}`);
  e.pages.forEach((p, i) => {
    lines.push("", `${i + 1}. ${p.heading}`);
    if (p.intro) lines.push(p.intro);
    p.paragraphs.forEach((para) => lines.push(para));
    (p.bullets ?? []).forEach((b) => lines.push(`- ${b}`));
  });
  return lines.join("\n");
}

export function MagnetEngine({
  campaignId,
  campaignHasCopy,
  savedKit,
  hasPage,
  contextReady = true,
  onKitGenerated,
  onRegisterGenerate,
  onGeneratingChange,
  onPageBuilt,
}: {
  /** Campaign the kit belongs to — drives the wording and the save-back. */
  campaignId?: string | null;
  campaignHasCopy?: boolean;
  /** Kit already stored on this campaign, shown instead of rebuilding. */
  savedKit?: MagnetConfig | null;
  /** Whether an opt-in page already exists for this campaign. */
  hasPage?: boolean;
  /** False while the saved kit and page links are still loading — nothing is built until then. */
  contextReady?: boolean;
  onKitGenerated?: (text: string, config: MagnetConfig) => void;
  onRegisterGenerate?: (run: (() => void) | null) => void;
  onGeneratingChange?: (busy: boolean) => void;
  onPageBuilt?: (page: { id: string; slug: string } | null) => void;
}) {
  const generateFn = useServerFn(generateMagnetKit);
  const saveCampaignFn = useServerFn(saveMagnetToCampaign);
  const buildPageFn = useServerFn(createLandingPageFromMagnet);
  const activeProjectId = useActiveProject();

  const brandQuery = useQuery({
    queryKey: ["brand-brain"],
    queryFn: () => getBrandBrain({ data: undefined as never }),
  });
  const mailchimpQuery = useQuery({
    queryKey: ["mailchimp-settings"],
    queryFn: () => getMailchimpSettings({ data: undefined as never }),
  });
  const prefillQuery = useQuery({
    queryKey: ["magnet-prefill", activeProjectId, campaignId ?? "none"],
    queryFn: () =>
      getMagnetPrefill({
        data: { projectId: activeProjectId ?? undefined, campaignId: campaignId ?? undefined },
      }),
    staleTime: 60_000,
  });
  const prefill = prefillQuery.data;

  const [cover, setCover] = useState<CoverTemplate>("minimalist");
  const [config, setConfig] = useState<MagnetConfig | null>(savedKit ?? null);
  const [editing, setEditing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  const scopeKey = `${activeProjectId ?? ""}|${campaignId ?? "standalone"}`;
  const localKey = `haaylo-magnet-kit:${scopeKey}`;
  const coverKey = `haaylo-magnet-cover:${scopeKey}`;
  const pageKey = `haaylo-magnet-page:${scopeKey}`;

  // A standalone freebie has no campaign row to hang its opt-in page on, so the
  // page it built is remembered here — that stops a rewrite creating a second one.
  const [localPage, setLocalPage] = useState<{ id: string; slug: string } | null>(null);
  const localPageRef = useRef<{ id: string; slug: string } | null>(null);
  localPageRef.current = localPage;
  const reportPage = useRef(onPageBuilt);
  reportPage.current = onPageBuilt;

  useEffect(() => {
    if (campaignId) {
      setLocalPage(null);
      return;
    }
    let stored: { id: string; slug: string } | null = null;
    try {
      const raw = window.localStorage.getItem(pageKey);
      stored = raw ? (JSON.parse(raw) as { id: string; slug: string }) : null;
    } catch {
      stored = null;
    }
    setLocalPage(stored);
    reportPage.current?.(stored);
  }, [pageKey, campaignId]);

  // The picked style is remembered per workspace and campaign.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(coverKey);
      if (saved === "minimalist" || saved === "bold" || saved === "tech") setCover(saved);
      else setCover("minimalist");
    } catch {
      setCover("minimalist");
    }
  }, [coverKey]);

  const chooseCover = useCallback(
    (next: CoverTemplate) => {
      setCover(next);
      try { window.localStorage.setItem(coverKey, next); } catch { /* ignore */ }
      window.setTimeout(() => guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    },
    [coverKey],
  );

  // A standalone freebie has no campaign to live on, so it is kept on this
  // device instead — reopening the page shows the same kit.
  useEffect(() => {
    if (savedKit) {
      setConfig(savedKit);
      return;
    }
    if (campaignId) {
      setConfig(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(localKey);
      setConfig(raw ? (JSON.parse(raw) as MagnetConfig) : null);
    } catch {
      setConfig(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, savedKit]);

  const primary = prefill?.primary_color || brandQuery.data?.primary_color || DEFAULT_PRIMARY;
  const secondary = prefill?.secondary_color || brandQuery.data?.secondary_color || DEFAULT_SECONDARY;
  const brandName = prefill?.brand_name || brandQuery.data?.brand_name || "";

  const saveToCampaign = useMutation({
    mutationFn: async (cfg: MagnetConfig) => {
      if (!campaignId) return { ok: false as const };
      return saveCampaignFn({
        data: {
          campaignId,
          headline: cfg.landing.hero.headline.slice(0, 300),
          subheadline: cfg.landing.hero.subheadline.slice(0, 600),
          guideTitle: cfg.ebook.title.slice(0, 300),
          guideIntro: cfg.ebook.subtitle.slice(0, 4000),
          guideSections: cfg.ebook.pages.slice(0, 20).map((p) => ({
            section_heading: p.heading.slice(0, 300),
            section_body: [p.intro ?? "", ...p.paragraphs, ...(p.bullets ?? []).map((b) => `• ${b}`)]
              .filter(Boolean)
              .join("\n\n")
              .slice(0, 8000),
          })),
          // The whole kit is stored so the page and guide can be reopened
          // exactly as they were built.
          leadMagnetContent: { ...cfg.ebook, landing: cfg.landing, brand: cfg.brand },
        },
      });
    },
  });

  const buildPage = useMutation({
    mutationFn: async (cfg: MagnetConfig) => {
      const l = cfg.landing;
      const bodyHtml = [
        ...l.features.map((f) => `<h3>${f.title}</h3><p>${f.body}</p>`),
        `<h3>${l.optin.heading}</h3><p>${l.optin.body}</p>`,
      ].join("");
      return buildPageFn({
        data: {
          title: (cfg.ebook.title || l.hero.headline).slice(0, 160),
          headline: l.hero.headline.slice(0, 160),
          subheadline: l.hero.subheadline.slice(0, 300),
          bodyHtml,
          formHeading: l.optin.heading.slice(0, 160),
          buttonLabel: (l.optin.button_label || l.hero.cta_label).slice(0, 60),
          brandColour: /^#[0-9a-fA-F]{6}$/.test(primary) ? primary : undefined,
          seoDescription: l.hero.subheadline.slice(0, 155),
          projectId: activeProjectId ?? undefined,
          campaignId: campaignId ?? undefined,
        },
      });
    },
    onSuccess: (page) => {
      if (!campaignId) {
        setLocalPage(page);
        try {
          window.localStorage.setItem(pageKey, JSON.stringify(page));
        } catch {
          /* storage blocked — the link still works this session */
        }
      }
      onPageBuilt?.(page);
    },
  });

  const persist = useCallback(
    (cfg: MagnetConfig) => {
      if (campaignId) return;
      try {
        window.localStorage.setItem(localKey, JSON.stringify(cfg));
      } catch {
        /* storage full or blocked — the kit still works this session */
      }
    },
    [campaignId, localKey],
  );

  const mutation = useMutation({
    mutationFn: () =>
      generateFn({
        data: {
          goal: prefill?.goal || "Generate leads",
          audience: prefill?.audience || brandQuery.data?.target_audience || "Small business owners",
          offer: prefill?.offer || "Our main service",
          tone: prefill?.tone || "Warm and plain-spoken",
          visual_style: prefill?.visual_style || undefined,
          skip_images: false,
          projectId: activeProjectId ?? undefined,
          campaignId: campaignId ?? undefined,
        },
      }),
    onSuccess: (cfg) => {
      setConfig(cfg);
      persist(cfg);
      onKitGenerated?.(kitToText(cfg), cfg);
      if (campaignId) saveToCampaign.mutate(cfg);
      // Only ever one opt-in page per kit — a rewrite never piles up duplicates.
      if (!hasPage && !localPageRef.current) buildPage.mutate(cfg);
    },
    onError: (e) => setNote(friendlyError(e)),
  });

  useEffect(() => {
    if (!mutation.isPending) {
      setLoadingStep(0);
      return;
    }
    const t = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 4500);
    return () => clearInterval(t);
  }, [mutation.isPending]);

  useEffect(() => {
    onGeneratingChange?.(mutation.isPending);
  }, [mutation.isPending, onGeneratingChange]);

  const runGenerate = () => {
    setNote(null);
    mutation.mutate();
  };
  const runRef = useRef(runGenerate);
  runRef.current = runGenerate;
  const registerRef = useRef(onRegisterGenerate);
  registerRef.current = onRegisterGenerate;
  // Registered once, so a fresh callback on every parent render cannot loop.
  useEffect(() => {
    registerRef.current?.(() => runRef.current());
    return () => registerRef.current?.(null);
  }, []);

  // Nothing to press: the moment a campaign (or standalone freebie) is opened
  // with no kit yet, the page copy and the guide are built together.
  const autoRan = useRef<string | null>(null);
  useEffect(() => {
    // Wait for the stored kit to arrive first, so an existing guide is never
    // rewritten on a plain page load.
    if (!contextReady) return;
    if (mutation.isPending || mutation.isError || config || savedKit) return;
    if (prefillQuery.isLoading || !prefill) return;
    if (autoRan.current === scopeKey) return;
    autoRan.current = scopeKey;
    runRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, prefill, prefillQuery.isLoading, config, savedKit, contextReady, mutation.isError]);

  const shownConfig = useMemo<MagnetConfig | null>(() => {
    if (!config) return null;
    return {
      ...config,
      brand: {
        ...config.brand,
        name: brandName || config.brand.name,
        primary_color: primary,
        secondary_color: secondary,
        accent_color: prefill?.accent_color || config.brand.accent_color || primary,
        font: prefill?.font_preference || config.brand.font || null,
        radius: config.brand.radius ?? 14,
        logo_url: brandQuery.data?.logo_url ?? config.brand.logo_url,
      },
    };
  }, [config, brandQuery.data, brandName, primary, secondary, prefill]);

  /** Applies an inline text edit and keeps the campaign copy in step. */
  function patch(next: MagnetConfig) {
    setConfig(next);
    persist(next);
  }
  function commitEdits() {
    setEditing(false);
    if (!config) return;
    onKitGenerated?.(kitToText(config), config);
    if (campaignId) saveToCampaign.mutate(config);
  }

  async function tweakKitImage(target: "hero" | "cover" | number, instruction: string) {
    if (!activeProjectId) throw new Error("Pick a workspace first, then try again.");
    if (!config) throw new Error("Build the lead magnet first.");
    const source = target === "hero"
      ? config.landing.hero_image_url
      : target === "cover"
        ? config.ebook.cover_image_url
        : config.landing.features[target]?.image_url;
    if (!source) throw new Error("There is no image to tweak yet.");
    const next = await refinePostGraphic({ data: { imageUrl: source, instruction, projectId: activeProjectId } });
    const updated: MagnetConfig = target === "hero"
      ? { ...config, landing: { ...config.landing, hero_image_url: next.url } }
      : target === "cover"
        ? { ...config, ebook: { ...config.ebook, cover_image_url: next.url } }
        : {
            ...config,
            landing: {
              ...config.landing,
              features: config.landing.features.map((feature, index) => index === target ? { ...feature, image_url: next.url } : feature),
            },
          };
    setConfig(updated);
    persist(updated);
    if (campaignId) await saveToCampaign.mutateAsync(updated);
  }

  /** Waits for the guide's images, skipping any that stall or fail. */
  async function settleImages(root: HTMLElement, ms = 6000) {
    const imgs = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            window.setTimeout(done, ms);
          }),
      ),
    );
  }

  async function exportPdf() {
    const source = exportRef.current;
    if (!source || !shownConfig) return;
    setExporting(true);
    setNote(null);

    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;z-index:-1;";
    const clone = source.cloneNode(true) as HTMLElement;
    clone.style.width = "794px";
    holder.appendChild(clone);
    document.body.appendChild(holder);

    const cleanup = () => {
      holder.remove();
      setExporting(false);
    };

    try {
      await settleImages(clone);
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const pages = Array.from(clone.querySelectorAll<HTMLElement>(".guide-page"));
      if (pages.length === 0) throw new Error("no pages");

      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i += 1) {
        const canvas = await html2canvas(pages[i]!, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        const img = canvas.toDataURL("image/jpeg", 0.92);
        const ratio = canvas.height / canvas.width;
        const w = ratio * pw > ph ? ph / ratio : pw;
        const h = ratio * w;
        if (i > 0) pdf.addPage();
        pdf.addImage(img, "JPEG", (pw - w) / 2, 0, w, h);
      }

      const name = `${(shownConfig.ebook.title || "lead-magnet").replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "lead-magnet"}.pdf`;
      pdf.save(name);
    } catch {
      setNote("The PDF wouldn't build — use your browser's Print option to save the guide instead.");
    } finally {
      cleanup();
    }
  }

  const copyKit = () => {
    if (!shownConfig) return;
    void navigator.clipboard.writeText(kitToText(shownConfig)).then(
      () => setNote("Copied the page and guide text."),
      () => setNote("Couldn't copy — select the text manually."),
    );
  };

  const busy = mutation.isPending;

  return (
    <div className="space-y-6">
      {/* 1. Cover style */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          Guide cover style
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {COVER_OPTIONS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => chooseCover(c.id)}
              aria-pressed={cover === c.id}
              className="flex gap-3 rounded-xl border p-3 text-left transition-colors"
              style={{
                borderColor: cover === c.id ? primary : LINE,
                background: cover === c.id ? withAlpha(primary, 0.12) : SURFACE,
              }}
            >
              {shownConfig ? (
                <CoverThumb config={shownConfig} template={c.id} width={72} />
              ) : null}
              <span className="min-w-0">
                <span className="block text-sm font-semibold" style={{ color: NAVY }}>
                  {c.label}
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: MUTED }}>
                  {c.note}
                </span>
                {cover === c.id ? (
                  <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: primary }}>
                    Selected
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>

      {note ? (
        <p className="text-xs" style={{ color: MUTED }}>
          {note}
        </p>
      ) : null}

      {/* 2. Previews, stacked */}
      {busy ? (
        <LoadingSkeleton message={LOADING_STEPS[loadingStep]!} primary={primary} />
      ) : !shownConfig ? (
        <div
          className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: LINE, color: MUTED }}
        >
          {mutation.isError ? (
            <>
              <p style={{ color: NAVY }}>Your page and guide didn't build this time.</p>
              <Button size="sm" onClick={runGenerate}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
              </Button>
            </>
          ) : (
            <>
              <p>Getting your page and guide ready…</p>
              <Button size="sm" variant="outline" onClick={runGenerate}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Build it now
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
              Landing page
            </p>
            <div className="overflow-hidden rounded-xl">
              <LandingPreview
                config={shownConfig}
                mailchimpConnected={Boolean(mailchimpQuery.data?.mailchimp_api_key)}
              />
            </div>
            {shownConfig.landing.hero_image_url ? (
              <div className="mt-2">
                <ImageTweakControl compact disabled={!activeProjectId} onApply={(instruction) => tweakKitImage("hero", instruction)} />
              </div>
            ) : null}
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {shownConfig.landing.features.map((feature, index) => feature.image_url ? (
                <div key={index}>
                  <p className="mb-1 text-xs font-semibold" style={{ color: NAVY }}>{feature.title}</p>
                  <ImageTweakControl compact disabled={!activeProjectId} onApply={(instruction) => tweakKitImage(index, instruction)} />
                </div>
              ) : null)}
            </div>
          </div>
          <div ref={guideRef}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
              Lead magnet guide
            </p>
            <div className="max-h-[70vh] overflow-y-auto rounded-xl p-4" style={{ background: SURFACE }}>
              <FitToWidth>
                <EbookPreview config={shownConfig} template={cover} />
              </FitToWidth>
            </div>
            {shownConfig.ebook.cover_image_url ? (
              <div className="mt-2">
                <ImageTweakControl compact disabled={!activeProjectId} onApply={(instruction) => tweakKitImage("cover", instruction)} />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 3. Text controls */}
      {shownConfig ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => (editing ? commitEdits() : setEditing(true))}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {editing ? "Done editing" : "Edit text"}
            </Button>
            <Button size="sm" variant="outline" onClick={copyKit}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
            </Button>
            <Button size="sm" variant="outline" onClick={runGenerate} disabled={busy}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Rewrite it all
            </Button>
          </div>

          {editing ? (
            <KitEditor config={shownConfig} onChange={patch} />
          ) : null}

          {/* 4. PDF export */}
          <Button
            onClick={() => void exportPdf()}
            disabled={exporting}
            className="w-full py-6 text-base font-semibold"
            style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, color: "#fff" }}
          >
            <Download className="mr-2 h-5 w-5" />
            {exporting ? "Building your PDF…" : "Export as downloadable PDF"}
          </Button>
        </div>
      ) : null}

      {/* Always-mounted A4 copy of the guide — the PDF is built from this. */}
      {shownConfig ? (
        <div aria-hidden className="pointer-events-none fixed -left-[10000px] top-0 w-[794px]">
          <div ref={exportRef}>
            <EbookPreview config={shownConfig} template={cover} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KitEditor({
  config,
  onChange,
}: {
  config: MagnetConfig;
  onChange: (next: MagnetConfig) => void;
}) {
  const set = (next: Partial<MagnetConfig>) => onChange({ ...config, ...next });
  const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider";
  return (
    <div
      className="space-y-4 rounded-xl border bg-white/[0.02] p-4"
      style={{ borderColor: LINE }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label} style={{ color: MUTED }}>
            Page headline
          </span>
          <Input
            value={config.landing.hero.headline}
            onChange={(e) =>
              set({ landing: { ...config.landing, hero: { ...config.landing.hero, headline: e.target.value } } })
            }
          />
        </div>
        <div>
          <span className={label} style={{ color: MUTED }}>
            Button text
          </span>
          <Input
            value={config.landing.optin.button_label}
            onChange={(e) =>
              set({ landing: { ...config.landing, optin: { ...config.landing.optin, button_label: e.target.value } } })
            }
          />
        </div>
      </div>
      <div>
        <span className={label} style={{ color: MUTED }}>
          Page sub-headline
        </span>
        <Textarea
          rows={2}
          value={config.landing.hero.subheadline}
          onChange={(e) =>
            set({ landing: { ...config.landing, hero: { ...config.landing.hero, subheadline: e.target.value } } })
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label} style={{ color: MUTED }}>
            Guide title
          </span>
          <Input
            value={config.ebook.title}
            onChange={(e) => set({ ebook: { ...config.ebook, title: e.target.value } })}
          />
        </div>
        <div>
          <span className={label} style={{ color: MUTED }}>
            Guide subtitle
          </span>
          <Input
            value={config.ebook.subtitle}
            onChange={(e) => set({ ebook: { ...config.ebook, subtitle: e.target.value } })}
          />
        </div>
      </div>
      {config.ebook.pages.map((p, i) => (
        <div key={i} className="space-y-2 border-t pt-3" style={{ borderColor: LINE }}>
          <Input
            value={p.heading}
            onChange={(e) => {
              const pages = [...config.ebook.pages];
              pages[i] = { ...p, heading: e.target.value };
              set({ ebook: { ...config.ebook, pages } });
            }}
          />
          <Textarea
            rows={4}
            value={p.paragraphs.join("\n\n")}
            onChange={(e) => {
              const pages = [...config.ebook.pages];
              pages[i] = { ...p, paragraphs: e.target.value.split(/\n{2,}/) };
              set({ ebook: { ...config.ebook, pages } });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton({ message, primary }: { message: string; primary: string }) {
  return (
    <div className="space-y-4 rounded-xl border p-6" style={{ borderColor: LINE }}>
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 animate-ping rounded-full" style={{ background: primary }} />
        <p className="text-sm" style={{ color: NAVY }}>
          {message}
        </p>
      </div>
      <div className="h-56 animate-pulse rounded-xl bg-white/[0.05]" />
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
    </div>
  );
}

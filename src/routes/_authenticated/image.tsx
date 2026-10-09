import { AppShell } from "@/components/AppShell";
import { HubTabs } from "@/components/HubTabs";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  generateBrandImage,
  uploadGeneratedImageToScheduler,
  saveStudioDesign,
} from "@/lib/image.functions";
import { getBrain } from "@/lib/brain.functions";
import { useWorkspace } from "@/hooks/useActiveProject";
import { listBrainAssets, registerBrainAsset } from "@/lib/brain-assets.functions";
import { saveToBank } from "@/lib/bank.functions";
import { listCampaigns, type CampaignRecord } from "@/lib/campaigns.functions";
import type { BrainData } from "@/lib/brain-schema";
import { GraphicStudio, type StudioAsset } from "@/components/GraphicStudio";
import { NAVY, SURFACE, PINK, LINE, BG, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/image")({
  head: () => ({
    meta: [
      { title: "Image Generator — haaylo.com" },
      { name: "description", content: "Generate branded promotional images without leaving Haaylo." },
      { property: "og:title", content: "Image Generator — haaylo.com" },
      { property: "og:description", content: "Generate branded promotional images without leaving Haaylo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImagePage,
});

const INK = NAVY;
const CARD = SURFACE;
const LINE_STY = `1px solid ${LINE}`;

const STYLES = [
  { id: "photorealistic", label: "Photorealistic", hint: "photorealistic photography, natural depth of field, realistic lighting" },
  { id: "illustrated", label: "Illustrated", hint: "hand-illustrated style, expressive linework, editorial illustration" },
  { id: "flat", label: "Flat design", hint: "flat vector design, simple shapes, no gradients or shadows" },
  { id: "bold", label: "Bold graphic", hint: "bold graphic poster style, high contrast, strong shapes" },
  { id: "minimal", label: "Minimal", hint: "minimal composition, generous whitespace, restrained palette" },
] as const;

type StyleId = (typeof STYLES)[number]["id"];

const FORMATS = [
  { id: "1:1", label: "Square (1:1)", size: "1024x1024" as const, ratio: 1 },
  { id: "4:5", label: "Portrait (4:5)", size: "1024x1536" as const, ratio: 4 / 5 },
  { id: "16:9", label: "Landscape (16:9)", size: "1536x1024" as const, ratio: 16 / 9 },
  { id: "9:16", label: "Story (9:16)", size: "1024x1536" as const, ratio: 9 / 16 },
] as const;

type FormatId = (typeof FORMATS)[number]["id"];

type HistoryItem = {
  id: string;
  src: string;
  prompt: string;
  format: FormatId;
  createdAt: number;
};

function pill(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    background: active ? "#FDEAF1" : "#FFFFFF",
    color: active ? PINK : INK,
    border: active ? `1px solid ${PINK}` : `1px solid ${LINE}`,
  };
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  color: PINK,
  marginBottom: 10,
};

function ImagePage() {
  const { projectId: activeProjectId } = useWorkspace();
  const navigate = useNavigate();
  const genFn = useServerFn(generateBrandImage);
  const brainFn = useServerFn(getBrain);
  const assetsFn = useServerFn(listBrainAssets);
  const uploadFn = useServerFn(uploadGeneratedImageToScheduler);
  const registerFn = useServerFn(registerBrainAsset);
  const bankFn = useServerFn(saveToBank);
  const campaignsFn = useServerFn(listCampaigns);
  const saveDesignFn = useServerFn(saveStudioDesign);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [brain, setBrain] = useState<BrainData | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandAssets, setBrandAssets] = useState<StudioAsset[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);

  const [prompt, setPrompt] = useState("");
  const [useBrandColours, setUseBrandColours] = useState(true);
  const [styleId, setStyleId] = useState<StyleId>("photorealistic");
  const [formatId, setFormatId] = useState<FormatId>("1:1");
  const [campaignId, setCampaignId] = useState("");

  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<HistoryItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [savingAsset, setSavingAsset] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const lastPrompt = useRef("");

  useEffect(() => {
    (async () => {
      try {
        const b = await brainFn({ data: { projectId: activeProjectId } });
        setProjectId(b.projectId);
        setBrain(b.data);
        try {
          const a = await assetsFn({ data: { projectId: b.projectId } });
          const assetRows = a as { id: string; kind: string; url: string | null; label?: string | null }[];
          setLogoUrl(assetRows.find((x) => x.kind === "logo")?.url ?? null);
          setBrandAssets(assetRows.filter((x) => x.kind === "image" && x.url).map((x) => ({ id: x.id, url: x.url ?? "", label: x.label })));
        } catch { /* assets optional */ }
        try {
          const rows = await campaignsFn({ data: { projectId: b.projectId } });
          setCampaigns(rows.filter((c) => c.status === "active"));
        } catch { /* campaigns optional */ }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load your brand");
      }
    })();
  }, [activeProjectId, brainFn, assetsFn, campaignsFn]);

  // Pick up an image handed over from a campaign card ("Open in studio").
  useEffect(() => {
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem("haaylo:studio-image");
      if (pending) sessionStorage.removeItem("haaylo:studio-image");
    } catch { /* storage unavailable */ }
    if (!pending) return;
    const item: HistoryItem = {
      id: `import-${Date.now()}`,
      src: pending,
      prompt: "Image from your campaign",
      format: "1:1",
      createdAt: Date.now(),
    };
    setHistory((h) => [item, ...h]);
    setCurrent(item);
    setStudioOpen(true);
  }, []);

  const colours = [brain?.brand?.primary_color, brain?.brand?.secondary_color, brain?.brand?.accent_color]
    .filter(Boolean).join(",") || brain?.brand?.colors || "";
  const swatches = useMemo(
    () => colours.split(",").map((c) => c.trim()).filter((c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)),
    [colours],
  );

  function buildPrompt(base: string) {
    const format = FORMATS.find((f) => f.id === formatId)!;
    const style = STYLES.find((s) => s.id === styleId)!;
    const bits = [base.trim(), `Style: ${style.hint}.`, `Composition framed for a ${format.id} ${format.label.split(" ")[0]!.toLowerCase()} format.`];
    if (useBrandColours && swatches.length) bits.push(`Use these brand colours: ${swatches.join(", ")}.`);
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (campaign) bits.push(`Campaign context: ${campaign.campaign_title} — ${campaign.campaign_theme}.`);
    return bits.join(" ").slice(0, 1000);
  }

  async function generate(base?: string) {
    const source = (base ?? prompt).trim();
    if (source.length < 3) {
      toast.error("Describe the image you want first");
      return;
    }
    lastPrompt.current = source;
    setBusy(true);
    try {
      const format = FORMATS.find((f) => f.id === formatId)!;
      const out = await genFn({
        data: {
          prompt: buildPrompt(source),
          projectId: projectId ?? undefined,
          size: format.size,
          useLogo: false,
        },
      });
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        src: `data:${out.mime};base64,${out.b64}`,
        prompt: source,
        format: formatId,
        createdAt: Date.now(),
      };
      setCurrent(item);
      setHistory((prev) => [item, ...prev].slice(0, 8));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function storeCurrent() {
    if (!current) throw new Error("Nothing to save");
    const b64 = current.src.split(",")[1] ?? "";
    const { path } = await uploadFn({ data: { b64, mime: "image/png" } });
    return path;
  }

  async function saveToAssets() {
    if (!current || !projectId) return;
    setSavingAsset(true);
    try {
      const path = await storeCurrent();
      await registerFn({
        data: { projectId, kind: "image", storagePath: path, label: current.prompt.slice(0, 120) },
      });
      toast.success("Saved to Brand Assets");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save to Brand Assets");
    } finally {
      setSavingAsset(false);
    }
  }

  async function saveToContentBank() {
    if (!current || !projectId) return;
    setSavingBank(true);
    try {
      const path = await storeCurrent();
      await bankFn({
        data: {
          projectId,
          kind: "image",
          title: current.prompt.slice(0, 120),
          body: current.prompt,
          tags: ["draft", "generated-image"],
          meta: {
            status: "draft",
            storage_path: path,
            format: current.format,
            style: styleId,
            campaign_id: campaignId || null,
          },
        },
      });
      toast.success("Saved to Content Bank as a draft");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save to Content Bank");
    } finally {
      setSavingBank(false);
    }
  }

  function download() {
    if (!current) return;
    const a = document.createElement("a");
    a.href = current.src;
    a.download = `haaylo-image-${new Date(current.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, "")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function useInPost(dataUrls: string[]) {
    const first = dataUrls[0];
    if (!first) return;
    try {
      const out = await saveDesignFn({ data: { dataUrl: first } });
      if (out.url) sessionStorage.setItem("haaylo-studio-media", out.url);
      toast.success("Design saved — attaching it to a post");
      navigate({ to: "/calendar" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save design");
    }
  }

  const ratio = FORMATS.find((f) => f.id === (current?.format ?? formatId))!.ratio;

  return (
    <AppShell title="Image Generator" flush>
    <div style={{ minHeight: "100vh", background: BG, color: INK, fontFamily: font }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 20px 80px" }}>
        <HubTabs />
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Image Generator</h1>
        <p style={{ margin: "6px 0 24px", fontSize: 14, opacity: 0.7 }}>
          Generate branded promotional images without leaving Haaylo.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(300px, 2fr) minmax(320px, 3fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          {/* LEFT — controls */}
          <div style={{ background: CARD, border: LINE_STY, borderRadius: 14, padding: 18, display: "grid", gap: 22 }}>
            <div>
              <div style={sectionLabel}>PROMPT</div>
              <label htmlFor="img-prompt" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Describe the image you want
              </label>
              <textarea
                id="img-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                maxLength={800}
                placeholder="e.g. A confident female entrepreneur at her laptop, warm lighting, minimalist office background"
                style={{
                  width: "100%", background: "#FFFFFF", color: INK, border: LINE_STY,
                  borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "inherit", resize: "vertical",
                }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontSize: 13, flexWrap: "wrap" }}>
                <input
                  type="checkbox"
                  checked={useBrandColours}
                  onChange={(e) => setUseBrandColours(e.target.checked)}
                  style={{ accentColor: PINK, width: 16, height: 16 }}
                />
                Use brand colours automatically
                {swatches.length ? (
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    {swatches.slice(0, 5).map((c) => (
                      <span key={c} title={c} style={{ width: 14, height: 14, borderRadius: "50%", background: c, border: `1px solid ${LINE}` }} />
                    ))}
                  </span>
                ) : (
                  <span style={{ opacity: 0.55, fontSize: 12 }}>none saved yet</span>
                )}
              </label>
            </div>

            <div>
              <div style={sectionLabel}>STYLE PRESET</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {STYLES.map((s) => (
                  <button key={s.id} onClick={() => setStyleId(s.id)} style={pill(styleId === s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={sectionLabel}>FORMAT</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FORMATS.map((f) => (
                  <button key={f.id} onClick={() => setFormatId(f.id)} style={pill(formatId === f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={sectionLabel}>CAMPAIGN CONTEXT</div>
              <label htmlFor="img-campaign" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Generate for campaign:
              </label>
              <select
                id="img-campaign"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                style={{ width: "100%", background: "#FFFFFF", color: INK, border: LINE_STY, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit" }}
              >
                <option value="">{campaigns.length ? "No campaign (optional)" : "No active campaigns yet"}</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.campaign_title}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => void generate()}
              disabled={busy || prompt.trim().length < 3}
              style={{
                width: "100%", padding: "14px 18px", borderRadius: 999, border: "none",
                background: busy || prompt.trim().length < 3 ? "#F2AFC5" : PINK,
                color: "#fff", fontWeight: 800, fontSize: 15, fontFamily: "inherit",
                cursor: busy || prompt.trim().length < 3 ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Generating…" : "Generate image"}
            </button>
          </div>

          {/* RIGHT — output */}
          <div style={{ background: CARD, border: LINE_STY, borderRadius: 14, padding: 18 }}>
            {busy ? (
              <div
                style={{
                  width: "100%", aspectRatio: String(ratio), borderRadius: 12,
                  background: SURFACE, border: LINE_STY,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
                }}
              >
                <span
                  style={{
                    width: 34, height: 34, borderRadius: "50%",
                    border: `3px solid ${LINE}`, borderTopColor: PINK,
                    animation: "haaylo-spin 0.9s linear infinite", display: "block",
                  }}
                />
                <span style={{ fontSize: 13, opacity: 0.75 }}>Generating… usually about 15–20 seconds</span>
                <style>{"@keyframes haaylo-spin{to{transform:rotate(360deg)}}"}</style>
              </div>
            ) : current ? (
              <>
                <img
                  src={current.src}
                  alt={current.prompt}
                  style={{ width: "100%", display: "block", borderRadius: 12, border: LINE_STY }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 14 }}>
                  <button onClick={() => void saveToAssets()} disabled={savingAsset} style={pill(false)}>
                    {savingAsset ? "Saving…" : "Save to Brand Assets"}
                  </button>
                  <button onClick={() => void saveToContentBank()} disabled={savingBank} style={pill(false)}>
                    {savingBank ? "Saving…" : "Save to Content Bank"}
                  </button>
                  <button onClick={download} style={pill(false)}>Download</button>
                  <button
                    onClick={() => void generate(lastPrompt.current || current.prompt)}
                    style={{ background: "none", border: "none", color: PINK, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
                  >
                    Regenerate
                  </button>
                </div>
                <p style={{ fontSize: 12, opacity: 0.6, marginTop: 10 }}>{current.prompt}</p>
              </>
            ) : (
              <div
                style={{
                  width: "100%", aspectRatio: String(ratio), borderRadius: 12,
                  background: SURFACE, border: `1px dashed ${LINE}`,
                  display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24,
                }}
              >
                <span style={{ fontSize: 13, opacity: 0.6, maxWidth: 320 }}>
                  Your image will appear here. Describe what you want on the left, pick a style and format, then generate.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* HISTORY */}
        <div style={{ marginTop: 26 }}>
          <div style={sectionLabel}>THIS SESSION</div>
          {history.length ? (
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setCurrent(h)}
                  title={h.prompt}
                  style={{
                    flex: "0 0 auto", width: 110, height: 110, padding: 0, borderRadius: 10, overflow: "hidden",
                    cursor: "pointer", background: "#FFFFFF",
                    border: current?.id === h.id ? `2px solid ${PINK}` : `1px solid ${LINE}`,
                  }}
                >
                  <img src={h.src} alt={h.prompt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>Images you generate in this session will collect here.</p>
          )}
        </div>

        {/* Design studio (optional) */}
        <div style={{ marginTop: 30, borderTop: LINE_STY, paddingTop: 20 }}>
          <button
            onClick={() => setStudioOpen((v) => !v)}
            style={{ ...pill(studioOpen), padding: "10px 18px" }}
          >
            {studioOpen ? "Hide design studio" : "Open design studio"}
          </button>
          {studioOpen && (
            <div style={{ marginTop: 16 }}>
              <GraphicStudio
                key={projectId ?? "loading-brand"}
                backgroundSrc={current?.src ?? null}
                size={formatId === "16:9" ? "1350x1080" : formatId === "1:1" ? "1080x1080" : "1080x1350"}
                brandName={brain?.business?.name ?? ""}
                brandColors={colours}
                brandFont={brain?.brand?.font_preference}
                logoUrl={logoUrl}
                brandAssets={brandAssets}
                onExport={(dataUrls) => void useInPost(dataUrls)}
                exportLabel="Save & use in a post"
              />
            </div>
          )}
        </div>
      </div>
    </div>
    </AppShell>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SURFACE, NAVY, PURPLE, LINE, font } from "@/lib/theme";

/**
 * GraphicStudio — a lightweight in-app design editor (Canva-style).
 * Layers are stored in normalised 0..1 coordinates so the preview and the
 * exported PNG stay identical at any canvas size.
 */

export type StudioSize = "1080x1080" | "1080x1350" | "1350x1080";

export type StudioAsset = { id: string; url: string; label?: string | null };

const SIZE_PX: Record<StudioSize, { w: number; h: number }> = {
  "1080x1080": { w: 1080, h: 1080 },
  "1080x1350": { w: 1080, h: 1350 },
  "1350x1080": { w: 1350, h: 1080 },
};

export type Layer = {
  id: string;
  type: "text" | "rect" | "image";
  x: number; // 0..1 left
  y: number; // 0..1 top
  w: number; // 0..1 width
  h: number; // 0..1 height (text: auto-ish, used for hit box)
  text?: string;
  fontSize?: number; // fraction of canvas width
  font?: string;
  weight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  fill?: string;
  radius?: number; // fraction of canvas width
  opacity?: number;
  src?: string;
  letterSpacing?: number;
  lineHeight?: number;
};

const FONTS = [
  { label: "Grotesk (default)", value: "'Space Grotesk', system-ui, sans-serif" },
  { label: "Serif editorial", value: "Georgia, 'Times New Roman', serif" },
  { label: "Clean sans", value: "Helvetica, Arial, sans-serif" },
  { label: "Mono", value: "'Courier New', monospace" },
];

const BRAND_FONT_STACKS: Record<string, string> = {
  modern: "Inter, system-ui, sans-serif",
  classic: "Merriweather, Georgia, serif",
  bold: "Montserrat, system-ui, sans-serif",
  minimal: "'DM Sans', system-ui, sans-serif",
};

function brandFontStack(brandFont?: string): string {
  if (!brandFont) return FONTS[0]!.value;
  const preset = BRAND_FONT_STACKS[brandFont.toLowerCase()];
  if (preset) return preset;
  const safeName = brandFont.replace(/["'`;{}]/g, "").trim();
  return safeName ? `'${safeName}', system-ui, sans-serif` : FONTS[0]!.value;
}

const uid = () => Math.random().toString(36).slice(2, 9);

function pickColors(brandColors: string): string[] {
  const hexes = brandColors
    .split(/[,\s]+/)
    .map((c) => c.trim())
    .filter((c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c));
  return hexes.length ? hexes : [NAVY, PURPLE, "#FACC15"];
}

type TemplateCtx = { brandName: string; colors: string[]; logoUrl?: string | null; defaultFont: string };

const TEMPLATES: { id: string; name: string; build: (c: TemplateCtx) => Layer[] }[] = [
  {
    id: "bold-statement",
    name: "Bold statement",
    build: ({ brandName, colors, defaultFont }) => [
      { id: uid(), type: "rect", x: 0, y: 0.55, w: 1, h: 0.45, fill: colors[0]!, opacity: 0.88, radius: 0 },
      { id: uid(), type: "text", x: 0.08, y: 0.62, w: 0.84, h: 0.2, text: "Your headline goes here", fontSize: 0.075, weight: 800, color: "#FFFFFF", align: "left", font: defaultFont, lineHeight: 1.15 },
      { id: uid(), type: "text", x: 0.08, y: 0.88, w: 0.84, h: 0.06, text: brandName || "yourbrand.com", fontSize: 0.028, weight: 600, color: colors[1] ?? "#FACC15", align: "left", font: defaultFont, lineHeight: 1.2 },
    ],
  },
  {
    id: "quote-card",
    name: "Quote card",
    build: ({ brandName, colors, defaultFont }) => [
      { id: uid(), type: "rect", x: 0, y: 0, w: 1, h: 1, fill: colors[0]!, opacity: 0.72, radius: 0 },
      { id: uid(), type: "text", x: 0.1, y: 0.24, w: 0.8, h: 0.4, text: "“The one line worth remembering.”", fontSize: 0.068, weight: 700, color: "#FFFFFF", align: "center", font: defaultFont, lineHeight: 1.25 },
      { id: uid(), type: "rect", x: 0.44, y: 0.68, w: 0.12, h: 0.006, fill: colors[1] ?? "#FACC15", opacity: 1, radius: 0.01 },
      { id: uid(), type: "text", x: 0.1, y: 0.73, w: 0.8, h: 0.05, text: brandName || "Your name", fontSize: 0.026, weight: 600, color: "#FFFFFF", align: "center", font: defaultFont, lineHeight: 1.2 },
    ],
  },
  {
    id: "tips-list",
    name: "Tips / carousel",
    build: ({ brandName, colors, defaultFont }) => [
      { id: uid(), type: "rect", x: 0.06, y: 0.06, w: 0.88, h: 0.88, fill: "#FFFFFF", opacity: 0.94, radius: 0.03 },
      { id: uid(), type: "text", x: 0.12, y: 0.13, w: 0.76, h: 0.05, text: "3 things to try this week", fontSize: 0.048, weight: 800, color: colors[0]!, align: "left", font: defaultFont, lineHeight: 1.2 },
      { id: uid(), type: "text", x: 0.12, y: 0.27, w: 0.76, h: 0.4, text: "1. First idea\n2. Second idea\n3. Third idea", fontSize: 0.036, weight: 500, color: "#333344", align: "left", font: defaultFont, lineHeight: 1.7 },
      { id: uid(), type: "text", x: 0.12, y: 0.84, w: 0.76, h: 0.05, text: brandName || "yourbrand.com", fontSize: 0.024, weight: 700, color: colors[1] ?? "#A855F7", align: "left", font: defaultFont, lineHeight: 1.2 },
    ],
  },
  {
    id: "offer-badge",
    name: "Offer badge",
    build: ({ brandName, colors, defaultFont }) => [
      { id: uid(), type: "rect", x: 0.08, y: 0.34, w: 0.84, h: 0.32, fill: colors[1] ?? "#FACC15", opacity: 0.96, radius: 0.02 },
      { id: uid(), type: "text", x: 0.12, y: 0.4, w: 0.76, h: 0.12, text: "Your offer, in a few words", fontSize: 0.06, weight: 800, color: colors[0]!, align: "center", font: defaultFont, lineHeight: 1.15 },
      { id: uid(), type: "text", x: 0.12, y: 0.57, w: 0.76, h: 0.05, text: brandName || "Book now", fontSize: 0.026, weight: 700, color: colors[0]!, align: "center", font: defaultFont, lineHeight: 1.2 },
    ],
  },
  {
    id: "blank",
    name: "Blank",
    build: () => [],
  },
];

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export function GraphicStudio({
  backgroundSrc,
  size = "1080x1080",
  brandName = "",
  brandColors = "",
  brandFont,
  logoUrl,
  brandAssets = [],
  initialLayers,
  initialBackgroundColor,
  onExport,
  exportLabel = "Save & use in a post",
}: {
  backgroundSrc?: string | null;
  size?: StudioSize;
  brandName?: string;
  brandColors?: string;
  brandFont?: string;
  logoUrl?: string | null;
  brandAssets?: StudioAsset[];
  initialLayers?: Layer[];
  initialBackgroundColor?: string;
  onExport?: (dataUrls: string[], pages: Layer[][], backgroundColor: string) => void;
  exportLabel?: string;
}) {
  const colors = useMemo(() => pickColors(brandColors), [brandColors]);
  const defaultFont = brandFontStack(brandFont);
  const [canvasSize, setCanvasSize] = useState<StudioSize>(size);
  const [pages, setPages] = useState<Layer[][]>([initialLayers ?? []]);
  const [pageIdx, setPageIdx] = useState(0);
  const layers = pages[pageIdx] ?? [];
  const setLayers = useCallback((updater: Layer[] | ((prev: Layer[]) => Layer[])) => {
    setPages((prev) => prev.map((p, i) => (i === pageIdx ? (typeof updater === "function" ? updater(p) : updater) : p)));
  }, [pageIdx]);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState<string>(initialBackgroundColor ?? colors[0] ?? NAVY);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [stageW, setStageW] = useState(600);

  useEffect(() => setCanvasSize(size), [size]);

  useEffect(() => {
    setPages([initialLayers ?? []]);
    setPageIdx(0);
    setSelectedId(null);
  }, [initialLayers]);

  useEffect(() => {
    if (initialBackgroundColor) setBgColor(initialBackgroundColor);
  }, [initialBackgroundColor]);

  useEffect(() => {
    if (!initialBackgroundColor && brandColors) setBgColor(colors[0] ?? NAVY);
  }, [brandColors, colors, initialBackgroundColor]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setStageW(entry.contentRect.width);
    });
    ro.observe(el);
    setStageW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);


  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const dims = SIZE_PX[canvasSize];

  const applyTemplate = useCallback(
    (templateId: string) => {
      const t = TEMPLATES.find((x) => x.id === templateId);
      if (!t) return;
      setLayers(t.build({ brandName, colors, logoUrl, defaultFont }));
      setSelectedId(null);
    },
    [brandName, colors, logoUrl, defaultFont, setLayers],
  );

  function update(id: string, patch: Partial<Layer>) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addText() {
    const l: Layer = {
      id: uid(), type: "text", x: 0.1, y: 0.42, w: 0.8, h: 0.12,
      text: "New text", fontSize: 0.05, weight: 700, color: "#FFFFFF",
      align: "center", font: defaultFont, lineHeight: 1.25,
    };
    setLayers((p) => [...p, l]);
    setSelectedId(l.id);
  }

  function addShape() {
    const l: Layer = {
      id: uid(), type: "rect", x: 0.15, y: 0.6, w: 0.7, h: 0.16,
      fill: colors[1] ?? "#A855F7", opacity: 0.9, radius: 0.02,
    };
    setLayers((p) => [...p, l]);
    setSelectedId(l.id);
  }

  function addLogo() {
    if (!logoUrl) { toast.error("No logo is saved for this workspace yet. Add one in Brand Assets."); return; }
    const l: Layer = { id: uid(), type: "image", x: 0.06, y: 0.06, w: 0.22, h: 0.1, src: logoUrl, opacity: 1 };
    setLayers((p) => [...p, l]);
    setSelectedId(l.id);
  }

  function addBrandAsset(asset: StudioAsset) {
    const l: Layer = { id: uid(), type: "image", x: 0.1, y: 0.1, w: 0.35, h: 0.35, src: asset.url, opacity: 1 };
    setLayers((p) => [...p, l]);
    setSelectedId(l.id);
  }

  function removeSelected() {
    if (!selectedId) return;
    setLayers((p) => p.filter((l) => l.id !== selectedId));
    setSelectedId(null);
  }

  function addPage() {
    setPages((p) => [...p, []]);
    setPageIdx(pages.length);
    setSelectedId(null);
  }

  function duplicatePage() {
    setPages((p) => {
      const copy = (p[pageIdx] ?? []).map((l) => ({ ...l, id: uid() }));
      const next = [...p];
      next.splice(pageIdx + 1, 0, copy);
      return next;
    });
    setPageIdx((i) => i + 1);
    setSelectedId(null);
  }

  function deletePage() {
    if (pages.length <= 1) { toast.error("You need at least one page"); return; }
    setPages((p) => p.filter((_, i) => i !== pageIdx));
    setPageIdx((i) => Math.max(0, i - 1));
    setSelectedId(null);
  }

  function onUploadImage(file: File) {
    if (!/^image\//.test(file.type)) { toast.error("Pick an image file"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Keep images under 8MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const l: Layer = { id: uid(), type: "image", x: 0, y: 0, w: 1, h: 1, src, opacity: 1 };
      setLayers((p) => [l, ...p]);
      setSelectedId(l.id);
    };
    reader.readAsDataURL(file);
    if (uploadRef.current) uploadRef.current.value = "";
  }

  function moveLayer(dir: -1 | 1) {
    if (!selectedId) return;
    setLayers((prev) => {
      const i = prev.findIndex((l) => l.id === selectedId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(i, 1);
      next.splice(j, 0, item!);
      return next;
    });
  }

  // ---- dragging ----
  function onPointerDown(e: React.PointerEvent, layer: Layer) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(layer.id);
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    dragRef.current = {
      id: layer.id,
      dx: (e.clientX - rect.left) / rect.width - layer.x,
      dy: (e.clientY - rect.top) / rect.height - layer.y,
    };
    stage.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const x = Math.min(1, Math.max(-0.2, (e.clientX - rect.left) / rect.width - drag.dx));
    const y = Math.min(1, Math.max(-0.2, (e.clientY - rect.top) / rect.height - drag.dy));
    update(drag.id, { x, y });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  // ---- export ----
  async function renderPage(pageLayers: Layer[]) {
    const canvas = document.createElement("canvas");
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, dims.w, dims.h);

    if (backgroundSrc) {
      try {
        const img = await loadImage(backgroundSrc);
        // cover
        const scale = Math.max(dims.w / img.width, dims.h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (dims.w - dw) / 2, (dims.h - dh) / 2, dw, dh);
      } catch {
        /* keep flat background */
      }
    }

    for (const l of pageLayers) {
      ctx.save();
      ctx.globalAlpha = l.opacity ?? 1;
      const x = l.x * dims.w;
      const y = l.y * dims.h;
      const w = l.w * dims.w;
      const h = l.h * dims.h;

      if (l.type === "rect") {
        const r = (l.radius ?? 0) * dims.w;
        ctx.fillStyle = l.fill ?? "#000000";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
        else ctx.rect(x, y, w, h);
        ctx.fill();
      } else if (l.type === "image" && l.src) {
        try {
          const img = await loadImage(l.src);
          const scale = Math.min(w / img.width, h / img.height);
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        } catch { /* skip */ }
      } else if (l.type === "text") {
        const fs = (l.fontSize ?? 0.05) * dims.w;
        ctx.font = `${l.weight ?? 700} ${fs}px ${l.font ?? FONTS[0]!.value}`;
        ctx.fillStyle = l.color ?? "#FFFFFF";
        ctx.textBaseline = "top";
        const lines = wrapLines(ctx, l.text ?? "", w);
        const lh = fs * (l.lineHeight ?? 1.25);
        lines.forEach((line, i) => {
          let lx = x;
          if (l.align === "center") lx = x + (w - ctx.measureText(line).width) / 2;
          if (l.align === "right") lx = x + w - ctx.measureText(line).width;
          ctx.fillText(line, lx, y + i * lh);
        });
      }
      ctx.restore();
    }

    return canvas.toDataURL("image/png");
  }

  async function exportPng(download: boolean, emit = false) {
    const urls: string[] = [];
    for (const p of pages) {
      const u = await renderPage(p);
      if (u) urls.push(u);
    }
    if (!urls.length) return;
    if (download) {
      urls.forEach((u, i) => {
        const a = document.createElement("a");
        a.href = u;
        a.download = `haaylo-graphic-${Date.now()}-${i + 1}.png`;
        a.click();
      });
    }
    if (emit) onExport?.(urls, pages, bgColor);
    return urls;
  }

  const stageStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: `${dims.w} / ${dims.h}`,
    background: bgColor,
    backgroundImage: backgroundSrc ? `url(${backgroundSrc})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderRadius: 12,
    overflow: "hidden",
    border: `1px solid ${LINE}`,
    touchAction: "none",
    userSelect: "none",
  };

  const panel: React.CSSProperties = {
    background: SURFACE,
    border: `1px solid ${LINE}`,
    borderRadius: 12,
    padding: 12,
  };

  const btn: React.CSSProperties = {
    background: SURFACE,
    color: NAVY,
    border: `1px solid ${LINE}`,
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: font,
  };

  const field: React.CSSProperties = {
    width: "100%",
    background: "#FFFFFF",
    color: NAVY,
    border: `1px solid ${LINE}`,
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 13,
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 16, alignItems: "start" }} className="studio-grid">
      <div>
        {/* Templates */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => applyTemplate(t.id)} style={btn}>{t.name}</button>
          ))}
        </div>

        {/* Carousel pages */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: PURPLE }}>PAGES</span>
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => { setPageIdx(i); setSelectedId(null); }}
              style={{ ...btn, background: i === pageIdx ? PURPLE : btn.background, color: i === pageIdx ? "#fff" : NAVY }}
            >
              {i + 1}
            </button>
          ))}
          <button onClick={addPage} style={btn}>+ Page</button>
          <button onClick={duplicatePage} style={btn}>Duplicate</button>
          <button onClick={deletePage} style={{ ...btn, color: "#FCA5A5" }} disabled={pages.length <= 1}>Delete page</button>
        </div>

        <div
          ref={stageRef}
          style={stageStyle}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerDown={() => setSelectedId(null)}
        >
          {layers.map((l) => {
            const isSel = l.id === selectedId;
            const base: React.CSSProperties = {
              position: "absolute",
              left: `${l.x * 100}%`,
              top: `${l.y * 100}%`,
              width: `${l.w * 100}%`,
              height: l.type === "text" ? "auto" : `${l.h * 100}%`,
              opacity: l.opacity ?? 1,
              outline: isSel ? "2px dashed #FACC15" : "none",
              outlineOffset: 2,
              cursor: "move",
            };
            if (l.type === "rect") {
              return <div key={l.id} onPointerDown={(e) => onPointerDown(e, l)} style={{ ...base, background: l.fill, borderRadius: (l.radius ?? 0) * stageW }} />;
            }
            if (l.type === "image") {
              return <img key={l.id} draggable={false} onDragStart={(e) => e.preventDefault()} onPointerDown={(e) => onPointerDown(e, l)} src={l.src} alt="" style={{ ...base, objectFit: "contain", objectPosition: "left top" }} />;
            }
            return (
              <div
                key={l.id}
                onPointerDown={(e) => onPointerDown(e, l)}
                style={{
                  ...base,
                  color: l.color,
                  fontFamily: l.font,
                  fontWeight: l.weight,
                  fontSize: (l.fontSize ?? 0.05) * stageW,
                  lineHeight: l.lineHeight ?? 1.25,
                  textAlign: l.align,
                  whiteSpace: "pre-wrap",
                }}
              >
                {l.text}
              </div>
            );

          })}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button onClick={addText} style={btn}>+ Text</button>
          <button onClick={addShape} style={btn}>+ Shape</button>
          <button onClick={addLogo} style={btn}>+ Logo</button>
          <button onClick={() => uploadRef.current?.click()} style={btn}>+ Upload image</button>
          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f); }} />
          <button onClick={() => moveLayer(1)} style={btn} disabled={!selected}>Bring forward</button>
          <button onClick={() => moveLayer(-1)} style={btn} disabled={!selected}>Send back</button>
          <button onClick={removeSelected} style={{ ...btn, color: "#FCA5A5" }} disabled={!selected}>Delete</button>
          <button
            onClick={() => void exportPng(true)}
            style={{ ...btn, marginLeft: "auto", background: "#FACC15", color: NAVY, border: "none" }}
          >
            Download PNG{pages.length > 1 ? `s (${pages.length})` : ""}
          </button>
          {onExport && (
            <button
              onClick={() => void exportPng(false, true)}
              style={{ ...btn, background: PURPLE, color: "#fff", border: "none" }}
            >
              {exportLabel}
            </button>
          )}
        </div>
        {brandAssets.length > 0 && (
          <div style={{ ...panel, marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: PURPLE, marginBottom: 8 }}>BRAND ASSETS</div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
              {brandAssets.map((asset) => (
                <button key={asset.id} type="button" title={`Add ${asset.label || "brand asset"}`} onClick={() => addBrandAsset(asset)} style={{ width: 70, height: 58, flex: "0 0 auto", padding: 4, border: `1px solid ${LINE}`, borderRadius: 8, background: "#FFFFFF", cursor: "pointer" }}>
                  <img src={asset.url} alt={asset.label || "Brand asset"} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Inspector */}
      <div style={{ ...panel, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: PURPLE }}>CANVAS</div>
        <label style={{ fontSize: 12 }}>
          Size
          <select value={canvasSize} onChange={(e) => setCanvasSize(e.target.value as StudioSize)} style={{ ...field, marginTop: 4 }}>
            <option value="1080x1080">Square 1:1</option>
            <option value="1080x1350">Portrait 4:5</option>
            <option value="1350x1080">Landscape 5:4</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Background colour
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} style={{ ...field, marginTop: 4, height: 34, padding: 2 }} />
        </label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {colors.map((c) => (
            <button key={c} onClick={() => (selected?.type === "text" ? update(selected.id, { color: c }) : selected ? update(selected.id, { fill: c }) : setBgColor(c))}
              title={c}
              style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: `1px solid ${LINE}`, cursor: "pointer" }} />
          ))}
        </div>

        <div style={{ height: 1, background: LINE }} />

        {!selected && <div style={{ fontSize: 12, opacity: 0.6 }}>Pick a template, then tap any element to edit it. Drag to reposition.</div>}

        {selected && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: PURPLE }}>
              {selected.type === "text" ? "TEXT" : selected.type === "rect" ? "SHAPE" : "IMAGE"}
            </div>

            {selected.type === "text" && (
              <>
                <textarea value={selected.text ?? ""} rows={3} onChange={(e) => update(selected.id, { text: e.target.value })} style={field} />
                <label style={{ fontSize: 12 }}>
                  Font
                  <select value={selected.font} onChange={(e) => update(selected.id, { font: e.target.value })} style={{ ...field, marginTop: 4 }}>
                    {brandFont && <option value={defaultFont}>Brand font</option>}
                    {FONTS.filter((f) => f.value !== defaultFont).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>
                  Size {((selected.fontSize ?? 0.05) * 100).toFixed(1)}
                  <input type="range" min={0.015} max={0.16} step={0.002} value={selected.fontSize} onChange={(e) => update(selected.id, { fontSize: Number(e.target.value) })} style={{ width: "100%" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Weight
                  <select value={selected.weight} onChange={(e) => update(selected.id, { weight: Number(e.target.value) })} style={{ ...field, marginTop: 4 }}>
                    {[300, 400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>
                  Align
                  <select value={selected.align} onChange={(e) => update(selected.id, { align: e.target.value as Layer["align"] })} style={{ ...field, marginTop: 4 }}>
                    <option value="left">Left</option>
                    <option value="center">Centre</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>
                  Colour
                  <input type="color" value={selected.color} onChange={(e) => update(selected.id, { color: e.target.value })} style={{ ...field, marginTop: 4, height: 34, padding: 2 }} />
                </label>
              </>
            )}

            {selected.type === "rect" && (
              <>
                <label style={{ fontSize: 12 }}>
                  Fill
                  <input type="color" value={selected.fill} onChange={(e) => update(selected.id, { fill: e.target.value })} style={{ ...field, marginTop: 4, height: 34, padding: 2 }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Corner radius
                  <input type="range" min={0} max={0.1} step={0.005} value={selected.radius ?? 0} onChange={(e) => update(selected.id, { radius: Number(e.target.value) })} style={{ width: "100%" }} />
                </label>
              </>
            )}

            <label style={{ fontSize: 12 }}>
              Horizontal position
              <input type="range" min={0} max={Math.max(0, 1 - selected.w)} step={0.005} value={Math.min(selected.x, Math.max(0, 1 - selected.w))} onChange={(e) => update(selected.id, { x: Number(e.target.value) })} style={{ width: "100%" }} />
            </label>
            <label style={{ fontSize: 12 }}>
              Vertical position
              <input type="range" min={0} max={Math.max(0, 1 - selected.h)} step={0.005} value={Math.min(selected.y, Math.max(0, 1 - selected.h))} onChange={(e) => update(selected.id, { y: Number(e.target.value) })} style={{ width: "100%" }} />
            </label>

            <label style={{ fontSize: 12 }}>
              Width
              <input type="range" min={0.05} max={1} step={0.01} value={selected.w} onChange={(e) => update(selected.id, { w: Number(e.target.value) })} style={{ width: "100%" }} />
            </label>
            {selected.type !== "text" && (
              <label style={{ fontSize: 12 }}>
                Height
                <input type="range" min={0.005} max={1} step={0.005} value={selected.h} onChange={(e) => update(selected.id, { h: Number(e.target.value) })} style={{ width: "100%" }} />
              </label>
            )}
            <label style={{ fontSize: 12 }}>
              Opacity
              <input type="range" min={0.1} max={1} step={0.05} value={selected.opacity ?? 1} onChange={(e) => update(selected.id, { opacity: Number(e.target.value) })} style={{ width: "100%" }} />
            </label>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 820px) {
          .studio-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

export default GraphicStudio;

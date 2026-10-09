export type CarouselDesignLayer = {
  id: string;
  type: "text" | "rect" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fontSize?: number;
  minFontSize?: number;
  font?: string;
  weight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  fill?: string;
  radius?: number;
  opacity?: number;
  src?: string;
  lineHeight?: number;
};

export type CarouselDesign = {
  version: 1;
  background: string;
  layers: CarouselDesignLayer[];
  palette: string[];
  role: "opening" | "content" | "closing";
};

export type CarouselBrand = {
  name: string;
  logoUrl: string | null;
  colours: string[];
  headingFont: string;
  bodyFont: string;
};

export type CarouselCopy = { heading: string; body: string };

const HAAYLO = ["#171D41", "#FF5C93", "#9B5CFF", "#FFFFFF"];
const DEFAULT = ["#171D41", "#E54683", "#7253C9", "#FFFFFF"];
const POPPINS = "'Poppins', Arial, sans-serif";

export function extractBrandColours(...values: Array<string | null | undefined>): string[] {
  const colours: string[] = [];
  for (const value of values) {
    for (const match of value?.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      const colour = match.toUpperCase();
      if (!colours.includes(colour)) colours.push(colour);
    }
  }
  return colours;
}

function layer(id: string, value: Omit<CarouselDesignLayer, "id">): CarouselDesignLayer {
  return { id, ...value };
}

function logoLayers(brand: CarouselBrand, dark: boolean): CarouselDesignLayer[] {
  const fallback = layer("brand-name", {
    type: "text", x: 0.075, y: 0.875, w: 0.34, h: 0.05,
    text: brand.name || "Your brand", fontSize: 0.025, minFontSize: 0.018,
    font: brand.headingFont, weight: 700, color: dark ? "#FFFFFF" : brand.colours[0]!,
    align: "left", lineHeight: 1.1,
  });
  if (!brand.logoUrl) return [fallback];
  return [
    layer("brand-logo", {
      type: "image", x: 0.075, y: 0.84, w: 0.28, h: 0.1, src: brand.logoUrl, opacity: 1,
    }),
    layer("brand-name-fallback", {
      ...fallback,
      x: 0.075,
      y: 0.94,
      h: 0.025,
      fontSize: 0.016,
      minFontSize: 0.014,
      text: brand.name,
      opacity: 0.72,
    }),
  ];
}

export function resolveCarouselBrand(input: {
  name?: string | null;
  logoUrl?: string | null;
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
  colours?: string | null;
  fonts?: string | null;
  fontPreference?: string | null;
}): CarouselBrand {
  const isHaaylo = /haaylo/i.test(input.name ?? "");
  const saved = extractBrandColours(input.primary, input.secondary, input.accent, input.colours);
  const colours = isHaaylo ? HAAYLO : [...saved, ...DEFAULT].filter((value, index, all) => all.indexOf(value) === index).slice(0, 4);
  const fontDescription = `${input.fontPreference ?? ""} ${input.fonts ?? ""}`;
  const headingFont = /poppins/i.test(fontDescription) || isHaaylo ? POPPINS : "Arial, sans-serif";
  return {
    name: input.name?.trim() || "Your brand",
    logoUrl: input.logoUrl ?? null,
    colours,
    headingFont,
    bodyFont: headingFont,
  };
}

export function buildCarouselDesigns(slides: CarouselCopy[], brand: CarouselBrand): CarouselDesign[] {
  const [navy, pink, purple, white] = [...brand.colours, ...DEFAULT];
  return slides.map((slide, index) => {
    const role = index === 0 ? "opening" : index === slides.length - 1 ? "closing" : "content";
    const dark = role === "closing";
    const background = dark ? navy! : white!;
    const ink = dark ? white! : navy!;
    const accent = role === "opening" ? pink! : index % 2 === 0 ? pink! : purple!;
    const headingSize = role === "opening" ? 0.084 : slide.heading.length > 54 ? 0.052 : 0.064;
    const bodySize = slide.body.length > 260 ? 0.026 : slide.body.length > 150 ? 0.031 : 0.037;
    const layers: CarouselDesignLayer[] = [
      layer("accent-top", { type: "rect", x: 0, y: 0, w: 1, h: 0.026, fill: accent, radius: 0, opacity: 1 }),
      layer("accent-mark", { type: "rect", x: 0.075, y: 0.13, w: role === "opening" ? 0.16 : 0.1, h: 0.018, fill: accent, radius: 0.01, opacity: 1 }),
      layer("heading", {
        type: "text", x: 0.075, y: role === "opening" ? 0.21 : 0.19, w: 0.84, h: role === "opening" ? 0.28 : 0.22,
        text: slide.heading, fontSize: headingSize, minFontSize: 0.036, font: brand.headingFont,
        weight: 700, color: ink, align: "left", lineHeight: 1.08,
      }),
      layer("body", {
        type: "text", x: 0.075, y: role === "opening" ? 0.55 : 0.49, w: 0.82, h: role === "closing" ? 0.25 : 0.28,
        text: slide.body, fontSize: bodySize, minFontSize: 0.021, font: brand.bodyFont,
        weight: role === "closing" ? 600 : 500, color: ink, align: "left", lineHeight: 1.38,
      }),
      layer("page-number", {
        type: "text", x: 0.82, y: 0.875, w: 0.1, h: 0.04, text: `${index + 1}/${slides.length}`,
        fontSize: 0.022, minFontSize: 0.018, font: brand.headingFont, weight: 600,
        color: dark ? white! : purple!, align: "right", lineHeight: 1,
      }),
      ...logoLayers(brand, dark),
    ];
    if (role === "opening") {
      layers.splice(1, 0, layer("corner-block", { type: "rect", x: 0.82, y: 0.026, w: 0.18, h: 0.18, fill: purple, radius: 0, opacity: 1 }));
    }
    if (role === "closing") {
      layers.splice(2, 0, layer("cta-panel", { type: "rect", x: 0.055, y: 0.46, w: 0.89, h: 0.32, fill: pink, radius: 0.025, opacity: 1 }));
    }
    return { version: 1, background, layers, palette: [navy!, pink!, purple!, white!], role };
  });
}

const NAMED_COLOURS: Record<string, string> = {
  navy: "#171D41",
  pink: "#FF5C93",
  purple: "#9B5CFF",
  white: "#FFFFFF",
  black: "#111111",
  green: "#2F9E73",
  blue: "#3478F6",
  orange: "#F28C45",
};

/** Applies common plain-English visual tweaks without flattening editable layers. */
export function tweakCarouselDesign(design: CarouselDesign, instruction: string): CarouselDesign {
  const text = instruction.toLowerCase();
  const explicit = instruction.match(/#[0-9a-fA-F]{6}\b/)?.[0]?.toUpperCase();
  const named = Object.entries(NAMED_COLOURS).find(([name]) => text.includes(name))?.[1];
  const colour = explicit ?? named;
  let background = design.background;
  let layers = design.layers.map((item) => ({ ...item }));

  if (colour && /background|backdrop|canvas/.test(text)) background = colour;
  if (colour && /accent|highlight|stripe|bar|block/.test(text)) {
    layers = layers.map((item) => item.type === "rect" && item.id.startsWith("accent-") ? { ...item, fill: colour } : item);
  }
  if (/remove (the )?logo|without (the )?logo|hide (the )?logo/.test(text)) {
    layers = layers.filter((item) => item.id !== "brand-logo" && !item.id.startsWith("brand-name"));
  }
  if (/centre|center/.test(text) && /heading|title/.test(text)) {
    layers = layers.map((item) => item.id === "heading" ? { ...item, align: "center" as const, x: 0.1, w: 0.8 } : item);
  }
  if (/larger|bigger/.test(text) && /heading|title/.test(text)) {
    layers = layers.map((item) => item.id === "heading" ? { ...item, fontSize: Math.min((item.fontSize ?? 0.064) * 1.15, 0.11) } : item);
  }
  if (/smaller/.test(text) && /heading|title/.test(text)) {
    layers = layers.map((item) => item.id === "heading" ? { ...item, fontSize: Math.max((item.fontSize ?? 0.064) * 0.86, item.minFontSize ?? 0.036) } : item);
  }

  return { ...design, background, layers };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(next).width > width) {
        result.push(current);
        current = word;
      } else current = next;
    }
    if (current) result.push(current);
  }
  return result;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function renderCarouselDesign(design: CarouselDesign, size = 1080): Promise<string> {
  if (typeof document === "undefined") throw new Error("Carousel rendering is only available in the browser.");
  await document.fonts?.load(`700 72px ${POPPINS}`).catch(() => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the carousel canvas.");
  ctx.fillStyle = design.background;
  ctx.fillRect(0, 0, size, size);

  for (const item of design.layers) {
    const x = item.x * size;
    const y = item.y * size;
    const width = item.w * size;
    const height = item.h * size;
    ctx.save();
    ctx.globalAlpha = item.opacity ?? 1;
    if (item.type === "rect") {
      ctx.fillStyle = item.fill ?? design.background;
      ctx.beginPath();
      const radius = (item.radius ?? 0) * size;
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, width, height, radius);
      else ctx.rect(x, y, width, height);
      ctx.fill();
    } else if (item.type === "image" && item.src) {
      try {
        const image = await loadImage(item.src);
        const scale = Math.min(width / image.width, height / image.height);
        ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
      } catch {
        // The brand-name text layer is used when no image is available.
      }
    } else if (item.type === "text" && item.text) {
      let fontSize = (item.fontSize ?? 0.05) * size;
      const minimum = (item.minFontSize ?? 0.018) * size;
      let lines: string[] = [];
      while (fontSize >= minimum) {
        ctx.font = `${item.weight ?? 500} ${fontSize}px ${item.font ?? POPPINS}`;
        lines = wrap(ctx, item.text, width);
        if (lines.length * fontSize * (item.lineHeight ?? 1.25) <= height) break;
        fontSize -= 2;
      }
      ctx.fillStyle = item.color ?? "#171D41";
      ctx.textBaseline = "top";
      lines.forEach((line, lineIndex) => {
        const measured = ctx.measureText(line).width;
        const lineX = item.align === "center" ? x + (width - measured) / 2 : item.align === "right" ? x + width - measured : x;
        ctx.fillText(line, lineX, y + lineIndex * fontSize * (item.lineHeight ?? 1.25));
      });
    }
    ctx.restore();
  }
  return canvas.toDataURL("image/png");
}
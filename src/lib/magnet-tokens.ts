/**
 * One source of design tokens for the Lead Magnet engine, so the landing page
 * preview and the ebook preview can never drift apart.
 */
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, type MagnetConfig } from "./magnet-schema";

export type MagnetFontKey = "modern" | "classic" | "bold" | "minimal";

export const MAGNET_FONTS: Record<
  MagnetFontKey,
  { heading: string; body: string; headingWeight: number }
> = {
  modern: {
    heading: "Inter, 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif",
    body: "Inter, 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif",
    headingWeight: 800,
  },
  classic: {
    heading: "Merriweather, Georgia, 'Times New Roman', serif",
    body: "Merriweather, Georgia, 'Times New Roman', serif",
    headingWeight: 700,
  },
  bold: {
    heading: "Montserrat, 'Archivo Black', Impact, system-ui, sans-serif",
    body: "Montserrat, system-ui, 'Segoe UI', sans-serif",
    headingWeight: 900,
  },
  minimal: {
    heading: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    body: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    headingWeight: 700,
  },
};

export type MagnetTokens = {
  primary: string;
  secondary: string;
  accent: string;
  heading: string;
  body: string;
  headingWeight: number;
  radius: number;
};

export function fontKey(value: string | null | undefined): MagnetFontKey {
  const v = (value ?? "").toLowerCase();
  if (v.includes("classic") || v.includes("serif") || v.includes("merri")) return "classic";
  if (v.includes("bold") || v.includes("display") || v.includes("montser")) return "bold";
  if (v.includes("minimal") || v.includes("dm sans")) return "minimal";
  return "modern";
}

/** Resolve the shared tokens for a generated kit. */
export function magnetTokens(config: MagnetConfig): MagnetTokens {
  const brand = config.brand;
  const key = fontKey(brand.font);
  const f = MAGNET_FONTS[key];
  return {
    primary: brand.primary_color || DEFAULT_PRIMARY,
    secondary: brand.secondary_color || DEFAULT_SECONDARY,
    accent: brand.accent_color || brand.primary_color || DEFAULT_PRIMARY,
    heading: f.heading,
    body: f.body,
    headingWeight: f.headingWeight,
    radius: typeof brand.radius === "number" ? brand.radius : 14,
  };
}

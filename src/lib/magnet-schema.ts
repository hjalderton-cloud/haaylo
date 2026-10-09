/** Shared JSON configuration schema for the Lead Magnet / Landing Page engine. */

export type CoverTemplate = "minimalist" | "bold" | "tech";

export interface MagnetFeature {
  title: string;
  body: string;
  /** Square feature graphic (cloud-hosted, CORS-enabled) */
  image_url?: string | null;
  image_prompt?: string;
}

export interface MagnetLanding {
  hero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    cta_label: string;
  };
  /** Cloud-hosted hero graphic */
  hero_image_url?: string | null;
  features: MagnetFeature[];
  optin: {
    heading: string;
    body: string;
    button_label: string;
    privacy_note: string;
  };
}

export interface EbookPage {
  heading: string;
  intro?: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface MagnetEbook {
  title: string;
  subtitle: string;
  author_line: string;
  /** Cloud-hosted cover graphic */
  cover_image_url?: string | null;
  pages: EbookPage[];
}

export interface MagnetConfig {
  brand: {
    name: string;
    primary_color: string;
    secondary_color: string;
    /** Third brand colour from Brand DNA, used for small accents. */
    accent_color?: string | null;
    /** Brand DNA font preference key: modern | classic | bold | minimal */
    font?: string | null;
    /** Shared corner radius, in px. */
    radius?: number;
    logo_url?: string | null;
  };
  landing: MagnetLanding;
  ebook: MagnetEbook;
}


export interface StrategyProfileInput {
  goal: string;
  audience: string;
  offer: string;
  tone: string;
  visual_style?: string;
}

export const DEFAULT_PRIMARY = "#E4656E";
export const DEFAULT_SECONDARY = "#141B3D";

/** Very small hex helpers used by the preview renderers. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6) || "000000", 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6) || "000000", 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#111827" : "#FFFFFF";
}

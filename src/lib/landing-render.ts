import type { LandingContent, LandingFont } from "./landing.functions";

export const FONT_STACKS: Record<LandingFont, { heading: string; body: string; weight: number }> = {
  modern: {
    heading: "Inter, 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif",
    body: "Inter, 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif",
    weight: 800,
  },
  classic: {
    heading: "Merriweather, Georgia, 'Times New Roman', serif",
    body: "Merriweather, Georgia, 'Times New Roman', serif",
    weight: 700,
  },
  bold: {
    heading: "Montserrat, 'Archivo Black', Impact, system-ui, sans-serif",
    body: "Montserrat, system-ui, 'Segoe UI', sans-serif",
    weight: 900,
  },
  minimal: {
    heading: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    body: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    weight: 700,
  },
};

const ALLOWED = new Set(["B", "STRONG", "I", "EM", "UL", "OL", "LI", "A", "P", "BR", "DIV", "SPAN"]);

/**
 * Strip everything but bold, bullets and links. Runs in the browser only;
 * server-side rendering falls back to plain text.
 */
export function sanitiseRichText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, " ");
  const host = document.createElement("div");
  host.innerHTML = html;
  const walk = (node: Element) => {
    [...node.children].forEach((child) => {
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      [...child.attributes].forEach((attr) => {
        const keep =
          child.tagName === "A" && attr.name === "href" && /^https?:\/\//i.test(attr.value);
        if (!keep) child.removeAttribute(attr.name);
      });
      if (child.tagName === "A") {
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noreferrer noopener");
      }
      walk(child);
    });
  };
  walk(host);
  return host.innerHTML;
}

export function heroBackground(content: LandingContent, heroUrl: string | null): string {
  if (heroUrl) return `linear-gradient(rgba(10,12,30,0.55), rgba(10,12,30,0.55)), url(${JSON.stringify(heroUrl)}) center/cover no-repeat`;
  return content.brandColour;
}

/** Perceived brightness of a #rrggbb colour, 0–255. */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 255;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Dark ink on light backgrounds, light ink on dark ones. */
export function contrastText(hex: string): string {
  return luminance(hex) > 150 ? "#1B1F35" : "#FFFFFF";
}

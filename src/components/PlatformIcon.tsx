type Props = { platform?: string | null; size?: number; className?: string };

export const PLATFORMS = [
  { key: "instagram", label: "Instagram", colour: "#E1306C" },
  { key: "facebook", label: "Facebook", colour: "#1877F2" },
  { key: "linkedin", label: "LinkedIn", colour: "#0A66C2" },
  { key: "tiktok", label: "TikTok", colour: "#22D3EE" },
  { key: "youtube", label: "YouTube", colour: "#FF0033" },
  { key: "x", label: "X / Twitter", colour: "#E7E7F5" },
  { key: "blog", label: "Blog", colour: "#A855F7" },
  { key: "email", label: "Email", colour: "#FACC15" },
] as const;

export function platformKey(platform?: string | null): string {
  const p = (platform || "").toLowerCase();
  if (p.includes("insta")) return "instagram";
  if (p.includes("face") || p.includes("meta")) return "facebook";
  if (p.includes("linked")) return "linkedin";
  if (p.includes("tik")) return "tiktok";
  if (p.includes("you") || p.includes("shorts")) return "youtube";
  if (p.includes("twitter") || p === "x") return "x";
  if (p.includes("blog") || p.includes("seo")) return "blog";
  if (p.includes("mail") || p.includes("news")) return "email";
  return "blog";
}

export function platformColour(platform?: string | null): string {
  const key = platformKey(platform);
  return PLATFORMS.find((p) => p.key === key)?.colour ?? "#A855F7";
}

export function platformLabel(platform?: string | null): string {
  const key = platformKey(platform);
  return PLATFORMS.find((p) => p.key === key)?.label ?? "Post";
}

/** Brand glyphs for the platforms haaylo plans content for. */
export function PlatformIcon({ platform, size = 12, className }: Props) {
  const key = platformKey(platform);
  const colour = platformColour(platform);
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor", className, style: { color: colour, flex: "0 0 auto" } } as const;

  switch (key) {
    case "instagram":
      return (
        <svg {...common} aria-label="Instagram" role="img">
          <path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.22 1 .48 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 3.2A6.6 6.6 0 1 0 18.6 12 6.6 6.6 0 0 0 12 5.4Zm0 10.9A4.3 4.3 0 1 1 16.3 12 4.3 4.3 0 0 1 12 16.3Zm6.9-11.1a1.55 1.55 0 1 1-1.55-1.55A1.55 1.55 0 0 1 18.9 5.2Z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common} aria-label="Facebook" role="img">
          <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common} aria-label="LinkedIn" role="img">
          <path d="M20.4 2H3.6A1.6 1.6 0 0 0 2 3.6v16.8A1.6 1.6 0 0 0 3.6 22h16.8a1.6 1.6 0 0 0 1.6-1.6V3.6A1.6 1.6 0 0 0 20.4 2ZM8.1 18.9H5.2V9.7h2.9ZM6.6 8.4a1.7 1.7 0 1 1 1.7-1.7 1.7 1.7 0 0 1-1.7 1.7Zm12.3 10.5H16v-4.5c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4v4.6h-2.9V9.7h2.8V11a3.1 3.1 0 0 1 2.8-1.5c3 0 3.5 2 3.5 4.5Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} aria-label="TikTok" role="img">
          <path d="M16.5 2h-3v13.1a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.5a5.9 5.9 0 0 0-.8-.1 5.7 5.7 0 1 0 5.7 5.7V8.9a7 7 0 0 0 4 1.3V7.1a4.1 4.1 0 0 1-4.1-4.1V2Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common} aria-label="YouTube" role="img">
          <path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.7-1.8C19.3 5 12 5 12 5s-7.3 0-8.9.5a2.5 2.5 0 0 0-1.7 1.8C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.7 1.8C4.7 19 12 19 12 19s7.3 0 8.9-.5a2.5 2.5 0 0 0 1.7-1.8C23 15.2 23 12 23 12ZM9.8 15.2V8.8L15.5 12Z" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} aria-label="X" role="img">
          <path d="M17.5 3h3l-6.6 7.5L21.8 21h-6l-4.7-6.1L5.7 21h-3l7-8-6.9-10h6.1l4.3 5.6ZM16.4 19.2h1.7L7.7 4.7H5.9Z" />
        </svg>
      );
    case "email":
      return (
        <svg {...common} aria-label="Email" role="img">
          <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h17A1.5 1.5 0 0 1 22 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5Zm2.3.5 7.7 5.6L19.7 6Z" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-label="Blog" role="img">
          <path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 1.8V9h4.2ZM7 12h10v1.6H7Zm0 3.4h10V17H7Z" />
        </svg>
      );
  }
}

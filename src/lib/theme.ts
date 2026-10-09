/**
 * Haaylo light palette — the single source of truth for the whole app.
 * Accent colours are used for buttons, active tabs, links and small icons only.
 */
export const BG = "#FAFAFC";
export const SURFACE = "#F6F7FA";
export const NAVY = "#171D41";
export const INDIGO = "#2D2964";
export const PURPLE = "#553EA2";
export const PINK = "#E54683";
// Supporting text uses navy for legibility. Grey remains reserved for borders
// and inactive surfaces via LINE and SURFACE.
export const GREY = NAVY;
export const LINE = "#E6E6EC";

export const TINT = {
  green: "#E8F5EE",
  greenInk: "#1E7A4E",
  pink: "#FDEAF1",
  pinkInk: "#B32C61",
  purple: "#EEEAF7",
  purpleInk: "#4A3690",
  blue: "#EDEFF5",
  blueInk: "#3A4266",
} as const;

export const font = "'Poppins', system-ui, sans-serif";

export const card: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  padding: 20,
};

export const primaryButton: React.CSSProperties = {
  padding: "13px 24px",
  borderRadius: 12,
  border: "none",
  background: PURPLE,
  color: BG,
  fontFamily: font,
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
};

export const secondaryButton: React.CSSProperties = {
  padding: "12px 20px",
  borderRadius: 12,
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  color: INDIGO,
  fontFamily: font,
  fontWeight: 500,
  fontSize: 14.5,
  cursor: "pointer",
};

export const POPPINS_LINKS: Array<
  React.DetailedHTMLProps<
    React.LinkHTMLAttributes<HTMLLinkElement>,
    HTMLLinkElement
  >
> = [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap",
  },
];

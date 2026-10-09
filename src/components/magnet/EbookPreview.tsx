import { readableOn, withAlpha, type CoverTemplate, type MagnetConfig } from "@/lib/magnet-schema";
import { magnetTokens, type MagnetTokens } from "@/lib/magnet-tokens";
import { LINE } from "@/lib/theme";

const PAGE = "guide-page relative mx-auto w-[794px] shrink-0 bg-white shadow-2xl";
/** A4 at 96dpi. Pages grow taller when the copy is long, so nothing overlaps. */
const A4 = { minHeight: 1123 } as const;

function Cover({
  config,
  template,
  t,
}: {
  config: MagnetConfig;
  template: CoverTemplate;
  t: MagnetTokens;
}) {
  const primary = t.primary;
  const secondary = t.secondary;
  const { title, subtitle, author_line, cover_image_url } = config.ebook;

  if (template === "bold") {
    return (
      <div
        className={PAGE}
        style={{ ...A4, background: primary, color: readableOn(primary), fontFamily: t.body }}
      >
        {cover_image_url ? (
          <img
            src={cover_image_url}
            alt=""
            crossOrigin="anonymous"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ mixBlendMode: "overlay", opacity: 0.55 }}
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(120% 90% at 20% 0%, ${withAlpha(secondary, 0.45)}, transparent 65%)` }}
        />
        <div className="relative flex h-full flex-col justify-between p-16">
          <p className="text-sm font-semibold uppercase tracking-[0.3em]">{config.brand.name}</p>
          <div>
            <h1
              className="text-6xl uppercase leading-[0.95] tracking-tight"
              style={{ fontFamily: t.heading, fontWeight: Math.max(t.headingWeight, 800) }}
            >
              {title}
            </h1>
            <p className="mt-6 max-w-md text-lg opacity-90">{subtitle}</p>
          </div>
          <p className="text-sm font-medium opacity-90">{author_line}</p>
        </div>
      </div>
    );
  }

  if (template === "tech") {
    const ink = readableOn(secondary);
    return (
      <div className={PAGE} style={{ ...A4, background: secondary, color: ink, fontFamily: t.body }}>
        <div className="flex h-full flex-col justify-between">
          <div className="p-14 pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.35em]" style={{ color: primary }}>
              {config.brand.name}
            </p>
            <h1
              className="mt-8 text-5xl leading-tight tracking-tight"
              style={{ fontFamily: t.heading, fontWeight: t.headingWeight }}
            >
              {title}
            </h1>
          </div>
          <div
            className="h-[230px] w-full overflow-hidden border-y"
            style={{ borderColor: withAlpha(primary, 0.5), background: withAlpha(primary, 0.12) }}
          >
            {cover_image_url ? (
              <img src={cover_image_url} alt="" crossOrigin="anonymous" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="p-14 pt-8">
            <p className="text-lg" style={{ color: ink, opacity: 0.85 }}>{subtitle}</p>
            <div className="mt-8 h-px w-24" style={{ background: t.accent }} />
            <p className="mt-4 text-sm" style={{ color: ink, opacity: 0.65 }}>{author_line}</p>
          </div>
        </div>
      </div>
    );
  }

  // minimalist
  return (
    <div className={PAGE} style={{ ...A4, background: "#FBFAF8", color: "#1B1B1B", fontFamily: t.body }}>
      <div className="flex h-full flex-col items-center justify-center px-16 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.4em]" style={{ color: primary }}>
          {config.brand.name}
        </p>
        <div
          className="mt-10 overflow-hidden border p-2"
          style={{ borderColor: withAlpha(secondary, 0.25), width: 320, height: 320, borderRadius: t.radius }}
        >
          {cover_image_url ? (
            <img src={cover_image_url} alt="" crossOrigin="anonymous" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              Cover graphic
            </div>
          )}
        </div>
        <h1
          className="mt-12 text-4xl leading-snug"
          style={{ color: secondary, fontFamily: t.heading, fontWeight: t.headingWeight }}
        >
          {title}
        </h1>
        <p className="mt-4 max-w-sm text-base text-slate-600">{subtitle}</p>
        <div className="mt-10 h-px w-16" style={{ background: t.accent }} />
        <p className="mt-5 text-xs uppercase tracking-[0.25em] text-slate-500">{author_line}</p>
      </div>
    </div>
  );
}

/** A small, non-interactive version of the cover, used by the style picker. */
export function CoverThumb({
  config,
  template,
  width = 150,
}: {
  config: MagnetConfig;
  template: CoverTemplate;
  width?: number;
}) {
  const t = magnetTokens(config);
  const scale = width / 794;
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-md border"
      style={{
        width,
        height: Math.round(width * (297 / 210)),
        borderColor: LINE,
        background: "#fff",
      }}
    >
      <div style={{ width: 794, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <Cover config={config} template={template} t={t} />
      </div>
    </div>
  );
}

/** Per-template look for the interior pages, so the style runs through the guide. */
function pageStyles(template: CoverTemplate, t: MagnetTokens) {
  if (template === "bold") {
    return {
      background: "#FFFFFF",
      headerBg: t.primary,
      headerInk: readableOn(t.primary),
      headingCase: "uppercase" as const,
      headingWeight: Math.max(t.headingWeight, 800),
      headingColor: t.secondary,
      calloutBg: withAlpha(t.primary, 0.14),
      calloutBorder: "transparent",
      rule: t.primary,
      numberFont: t.heading,
    };
  }
  if (template === "tech") {
    return {
      background: "#F5F7FB",
      headerBg: t.secondary,
      headerInk: readableOn(t.secondary),
      headingCase: "none" as const,
      headingWeight: t.headingWeight,
      headingColor: t.secondary,
      calloutBg: "#FFFFFF",
      calloutBorder: withAlpha(t.primary, 0.45),
      rule: t.accent,
      numberFont: "ui-monospace, SFMono-Regular, Menlo, monospace",
    };
  }
  return {
    background: "#FBFAF8",
    headerBg: "transparent",
    headerInk: t.primary,
    headingCase: "none" as const,
    headingWeight: t.headingWeight,
    headingColor: t.secondary,
    calloutBg: withAlpha(t.primary, 0.06),
    calloutBorder: withAlpha(t.secondary, 0.12),
    rule: withAlpha(t.secondary, 0.18),
    numberFont: t.body,
  };
}

export function EbookPreview({
  config,
  template,
}: {
  config: MagnetConfig;
  template: CoverTemplate;
}) {
  const t = magnetTokens(config);
  const secondary = t.secondary;
  const s = pageStyles(template, t);
  const centredFooter = template === "minimalist";

  return (
    <div className="flex flex-col gap-8">
      <Cover config={config} template={template} t={t} />

      {config.ebook.pages.map((p, i) => (
        <div key={i} className={PAGE} style={{ ...A4, fontFamily: t.body, background: s.background }}>
          <div className="flex h-full flex-col">
            <div
              className="flex items-center justify-between px-14 py-5"
              style={{
                background: s.headerBg,
                color: s.headerInk,
                borderBottom: s.headerBg === "transparent" ? `1px solid ${s.rule}` : "none",
              }}
            >
              <span className="text-xs font-semibold uppercase tracking-[0.25em]">
                {config.brand.name}
              </span>
              <span className="text-xs" style={{ fontFamily: s.numberFont, opacity: 0.8 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>

            <div className="flex h-full flex-col px-14 pb-14 pt-10">
              <h2
                className="text-3xl leading-tight"
                style={{
                  color: s.headingColor,
                  fontFamily: t.heading,
                  fontWeight: s.headingWeight,
                  textTransform: s.headingCase,
                  letterSpacing: s.headingCase === "uppercase" ? "-0.01em" : undefined,
                }}
              >
                {p.heading}
              </h2>
              <div className="mt-4 h-[3px] w-16" style={{ background: s.rule }} />
              {p.intro ? (
                <p className="mt-5 border-l-2 pl-4 text-base italic text-slate-600" style={{ borderColor: t.accent }}>
                  {p.intro}
                </p>
              ) : null}

              <div className="mt-6 space-y-4 text-[15px] leading-7 text-slate-700">
                {p.paragraphs.map((para, j) => (
                  <p key={j}>{para}</p>
                ))}
              </div>

              {p.bullets?.length ? (
                <div
                  className="mt-8 border p-6"
                  style={{
                    background: s.calloutBg,
                    borderColor: s.calloutBorder,
                    borderRadius: template === "bold" ? 4 : t.radius,
                  }}
                >
                  <ul className="space-y-3 text-[15px] text-slate-700">
                    {p.bullets.map((b, j) => (
                      <li key={j} className="flex gap-3">
                        <span
                          className="mt-2 inline-block h-2 w-2 shrink-0"
                          style={{
                            background: t.accent,
                            borderRadius: template === "bold" ? 0 : 999,
                          }}
                        />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div
                className="mt-auto pt-8 text-xs text-slate-400"
                style={{ textAlign: centredFooter ? "center" : "left", color: withAlpha(secondary, 0.5) }}
              >
                {config.ebook.title}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

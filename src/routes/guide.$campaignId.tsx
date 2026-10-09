import { createFileRoute, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { getPublicGuide } from "@/lib/landing.functions";
import { FONT_STACKS, contrastText, luminance } from "@/lib/landing-render";

export const Route = createFileRoute("/guide/$campaignId")({
  loader: async ({ params }) => {
    const guide = await getPublicGuide({ data: { campaignId: params.campaignId } });
    if (!guide) throw notFound();
    return guide;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Guide unavailable" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${loaderData.title} — your guide`;
    const description = loaderData.intro || "Your guide is ready to read — no download needed.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  pendingComponent: GuideSkeleton,
  errorComponent: () => <GuideMissing />,
  notFoundComponent: () => <GuideMissing />,
  component: GuidePage,
});

const PRINT_CSS = `@media print { .guide-no-print { display: none !important; } }`;

function GuideMissing() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#F6F7FB",
        color: "#1B1F35",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>This guide isn&rsquo;t available yet.</h1>
      </div>
    </main>
  );
}

function GuideSkeleton() {
  const bar = (h: number, w: string): React.CSSProperties => ({
    height: h,
    width: w,
    borderRadius: 10,
    background: "rgba(20,27,61,0.08)",
    marginBottom: 14,
  });
  return (
    <main style={{ minHeight: "100vh", background: "#F6F7FB" }}>
      <div style={{ height: 180, background: "rgba(20,27,61,0.12)" }} />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px" }}>
        <div style={bar(38, "70%")} />
        <div style={bar(16, "100%")} />
        <div style={bar(16, "94%")} />
        <div style={bar(16, "88%")} />
      </div>
    </main>
  );
}

/** Waits for every image inside a node to finish loading (or fail) before capture. */
async function settleImages(node: HTMLElement) {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
          setTimeout(resolve, 6000);
        }),
    ),
  );
}

function GuidePage() {
  const guide = Route.useLoaderData();
  const docRef = useRef<HTMLDivElement>(null);
  const [building, setBuilding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Turns the guide as shown into a print-ready A4 PDF.
  const downloadPdf = async () => {
    const source = docRef.current;
    if (!source || building) return;
    setBuilding(true);
    setNote(null);

    // Capture an offscreen copy at a fixed A4-ish width so phone layouts
    // still produce a tidy document.
    const holder = document.createElement("div");
    holder.style.cssText =
      "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;z-index:-1;";
    const clone = source.cloneNode(true) as HTMLElement;
    clone.style.width = "794px";
    holder.appendChild(clone);
    document.body.appendChild(holder);

    try {
      await settleImages(clone);
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const pxPerMm = canvas.width / pw;
      const sliceHeight = Math.floor(ph * pxPerMm);

      let offset = 0;
      let page = 0;
      while (offset < canvas.height) {
        const height = Math.min(sliceHeight, canvas.height - offset);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = height;
        const cx = slice.getContext("2d");
        if (!cx) throw new Error("canvas unavailable");
        cx.fillStyle = "#ffffff";
        cx.fillRect(0, 0, slice.width, slice.height);
        cx.drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, height / pxPerMm);
        offset += height;
        page += 1;
      }

      pdf.save(`${guide.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "guide"}.pdf`);
    } catch {
      setNote("The PDF wouldn't build. Use your browser's Print option to save the guide instead.");
    } finally {
      holder.remove();
      setBuilding(false);
    }
  };
  const font = FONT_STACKS[guide.font];
  const headerInk = contrastText(guide.brandColour);
  const darkPrimary = luminance(guide.brandColour) <= 150;
  const pageBg = darkPrimary ? "#FFFFFF" : "#FAFAFC";

  // Same custom properties as the public landing page renderer.
  const vars = {
    "--color-primary": guide.brandColour,
    "--color-secondary": guide.secondaryColour,
    "--color-text": "#1B1F35",
    "--font-family": font.body,
  } as React.CSSProperties;

  return (
    <main
      style={{
        ...vars,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: pageBg,
        color: "var(--color-text)",
        fontFamily: "var(--font-family)",
      }}
    >
      <style>{PRINT_CSS}</style>

      <div ref={docRef}>
      {/* 1. Branded header */}
      <header
        style={{
          background: "var(--color-primary)",
          color: headerInk,
          padding: "clamp(32px, 6vw, 56px) 20px",
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {guide.logoUrl ? (
            <img
              src={guide.logoUrl}
              alt={guide.businessName ?? ""}
              style={{ height: 40, maxWidth: "70%", objectFit: "contain" }}
            />
          ) : null}
          {guide.businessName ? (
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.85 }}>
              {guide.businessName}
            </span>
          ) : null}
          {/* 2. Guide title */}
          <h1
            style={{
              margin: 0,
              fontFamily: font.heading,
              fontWeight: font.weight,
              fontSize: "clamp(26px, 4.5vw, 40px)",
              lineHeight: 1.2,
              overflowWrap: "anywhere",
            }}
          >
            {guide.title}
          </h1>
        </div>
      </header>

      <article
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 760,
          margin: "0 auto",
          padding: "clamp(28px, 5vw, 48px) 20px 64px",
          boxSizing: "border-box",
        }}
      >
        {guide.coverUrl ? (
          <img
            src={guide.coverUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              display: "block",
              width: "100%",
              maxHeight: 420,
              objectFit: "cover",
              borderRadius: 18,
              marginBottom: 32,
            }}
          />
        ) : null}

        {guide.empty ? (
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "var(--color-text)", textAlign: "center" }}>
            This guide isn&rsquo;t available yet.
          </p>
        ) : (
          <>
            {/* 3. Intro */}
            {guide.intro && (
              <p
                style={{
                  margin: "0 0 34px",
                  fontSize: 17,
                  lineHeight: 1.75,
                  color: "var(--color-text)",
                  overflowWrap: "anywhere",
                  whiteSpace: "pre-wrap",
                }}
              >
                {guide.intro}
              </p>
            )}

            {/* 4. Sections */}
            {guide.sections.map((s, i) => (
              <section
                key={i}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "#FFFFFF",
                  border: "1px solid rgba(20,27,61,0.08)",
                  borderRadius: 16,
                  padding: "clamp(20px, 4vw, 32px)",
                  marginBottom: 22,
                  boxShadow: "0 2px 14px rgba(20,27,61,0.05)",
                  overflowWrap: "anywhere",
                }}
              >
                {s.heading.trim() && (
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontFamily: font.heading,
                      fontWeight: font.weight,
                      fontSize: "clamp(19px, 3vw, 23px)",
                      lineHeight: 1.3,
                      color: "var(--color-primary)",
                    }}
                  >
                    {s.heading}
                  </h2>
                )}
                {s.body
                  .split(/\n{2,}/)
                  .filter((p) => p.trim())
                  .map((p, j) => (
                    <p
                      key={j}
                      style={{
                        margin: "0 0 12px",
                        fontSize: 16,
                        lineHeight: 1.7,
                        color: "var(--color-text)",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {p.trim()}
                    </p>
                  ))}
              </section>
            ))}
          </>
        )}
      </article>
      </div>

      {/* Download — hidden when printing */}
      <div className="guide-no-print" style={{ textAlign: "center", padding: "0 20px 8px" }}>
        <button
          type="button"
          onClick={() => void downloadPdf()}
          disabled={building}
          style={{
            border: "1px solid var(--color-primary)",
            background: "transparent",
            color: "var(--color-primary)",
            fontWeight: 700,
            fontSize: 15,
            padding: "12px 22px",
            borderRadius: 999,
            cursor: building ? "default" : "pointer",
          }}
        >
          {building ? "Building your PDF…" : "Download this guide as a PDF"}
        </button>
        {note ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#5A5F7A" }}>{note}</p>
        ) : null}
      </div>

      {/* 5. CTA — hidden when printing */}
      <footer className="guide-no-print" style={{ padding: "0 20px 56px", textAlign: "center" }}>
        <a
          href="https://haaylo.com"
          style={{
            display: "inline-block",
            background: "var(--color-primary)",
            color: headerInk,
            fontWeight: 700,
            fontSize: 16,
            lineHeight: 1.4,
            padding: "16px 28px",
            borderRadius: 999,
            textDecoration: "none",
            maxWidth: "100%",
            overflowWrap: "anywhere",
          }}
        >
          Want 90 days of content like this? Build yours at Haaylo.
        </a>
      </footer>
    </main>
  );
}

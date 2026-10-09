import { AppShell } from "@/components/AppShell";
import { SURFACE, NAVY, INDIGO, PINK, LINE, font } from "@/lib/theme";

/** Placeholder panel for pillar pages that are still in build. */
export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <AppShell title={title}>
      <section
        style={{
          borderRadius: 18,
          border: `1px solid ${LINE}`,
          background: SURFACE,
          padding: "28px 24px",
        }}
      >
        <h2
          style={{
            fontFamily: font,
            fontSize: 20,
            margin: "0 0 10px",
            color: NAVY,
          }}
        >
          {title}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: INDIGO }}>{blurb}</p>
        <p style={{ margin: "14px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: PINK }}>
          In build
        </p>
      </section>
    </AppShell>
  );
}

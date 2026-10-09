import { createFileRoute, Link } from "@tanstack/react-router";
import { BG, NAVY, PINK, PURPLE, GREY, TINT, LINE, font } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome — haaylo.com" },
      {
        name: "description",
        content: "Three quick steps: train your Brain, lock your voice, generate your first on-brand content.",
      },
      { property: "og:title", content: "Welcome to haaylo" },
      {
        property: "og:description",
        content: "Three quick steps to your first on-brand generation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WelcomePage,
});

const STEPS: Array<[string, string, string, string]> = [
  ["1", "Train your Brain", "~3 min", "Answer a few essentials about your business, brand and audience."],
  ["2", "We write your brand voice", "instant", "haaylo summarises how you sound — no prompting needed."],
  ["3", "Generate your free content", "instant", "Your first generation is free: posts, captions and a plan."],
];

function WelcomePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: NAVY,
        fontFamily: font,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 620 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: TINT.pinkInk,
            marginBottom: 10,
          }}
        >
          ◆ Welcome to haaylo
        </div>
        <h1
          style={{
            fontFamily: font,
            fontSize: "clamp(26px, 4.4vw, 38px)",
            lineHeight: 1.12,
            margin: "0 0 12px",
            color: NAVY,
          }}
        >
          Here&rsquo;s how your free generation works.
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, color: GREY, margin: "0 0 18px" }}>
          Everything haaylo writes comes from your Strategy Profile, so we set that up first. It takes about three
          minutes — then your free generation is on-brand instead of generic.
        </p>

        <div
          style={{
            background: TINT.pink,
            border: `1px solid ${TINT.pink}`,
            borderRadius: 14,
            padding: "14px 16px",
            marginBottom: 24,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, color: TINT.pinkInk, letterSpacing: ".01em", marginBottom: 6 }}>
            ◆ This is just a snippet of your Brain
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: TINT.pinkInk }}>
            Right now we only collect the <strong style={{ color: NAVY }}>essential</strong> information needed
            for your free generation — your business, brand and audience basics. When you sign up to haaylo, you can
            train your Brain on <em>every</em> area of your business: upload brand assets, case studies, tone-of-voice
            documents, marketing strategy, business strategy and more. The richer the Brain, the sharper every piece of
            content haaylo writes for you.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 26 }}>
          {STEPS.map(([n, title, time, desc]) => (
            <div
              key={n}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                background: "#FFFFFF",
                border: `1px solid ${LINE}`,
                borderRadius: 14,
                padding: "16px 18px",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: `linear-gradient(135deg,${PINK},${PURPLE})`,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {n}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>
                  {title}{" "}
                  <span style={{ fontWeight: 600, fontSize: 12, color: GREY }}>· {time}</span>
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: GREY, marginTop: 4 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <Link
            to="/brain/setup"
            search={{ onboarding: "1" }}
            style={{
              background: `linear-gradient(135deg,${PINK},#B32C61)`,
              color: "#fff",
              padding: "14px 24px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 800,
              fontSize: 15.5,
              boxShadow: "0 14px 40px -10px rgba(20,20,40,0.22)",
            }}
          >
            Start — takes ~3 minutes
          </Link>
          <Link
            to="/first-post"
            style={{ color: GREY, textDecoration: "none", fontWeight: 600, fontSize: 14 }}
          >
            Skip to my first post
          </Link>
        </div>
        <div style={{ marginTop: 14, fontSize: 12.5, color: GREY }}>
          Your answers save as you go — you can stop and come back any time.
        </div>
      </div>
    </div>
  );
}

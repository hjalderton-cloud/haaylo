import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, CARD } from "@/components/AppShell";
import { GREY, PURPLE, LINE } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/tools")({
  head: () => ({
    meta: [
      { title: "Content Hub — haaylo.com" },
      {
        name: "description",
        content:
          "Plan posts from your 90-day strategy, write a one-off post, repurpose existing content, or brainstorm fresh ideas.",
      },
    ],
  }),
  component: ToolsHub,
});

type ToolCard = {
  icon: string;
  title: string;
  desc: string;
  cta: string;
  tab: "plan" | "post" | "repurpose" | "ideas" | "variator" | "hashtags" | "trends";
  /** Tools with their own screen link straight there instead of the engine tabs. */
  to?: string;
};

const TOOLS: ToolCard[] = [
  {
    icon: "📅✓",
    title: "Plan Posts",
    desc: "Write posts from your 90-day content strategy",
    cta: "Open Plan",
    tab: "plan",
  },
  {
    icon: "✍️",
    title: "New Post",
    desc: "Write a one-off post from scratch",
    cta: "Write Post",
    tab: "post",
  },
  {
    icon: "♻️",
    title: "Repurposing Suite",
    desc: "Turn a saved caption into a carousel, video script or newsletter",
    cta: "Repurpose",
    tab: "repurpose",
    to: "/repurpose",
  },
  {
    icon: "💡",
    title: "Idea Generator",
    desc: "One keyword, three post concepts in your voice",
    cta: "Get Ideas",
    tab: "ideas",
    to: "/ideas",
  },

  {
    icon: "🔀",
    title: "Caption Variator",
    desc: "Write once, get a version for every platform",
    cta: "Open Variator",
    tab: "variator",
    to: "/caption-variator",
  },
  {
    icon: "🔎",
    title: "Hashtag & Keyword Optimizer",
    desc: "Find the hashtags and keywords your audience searches",
    cta: "Find Hashtags",
    tab: "hashtags",
    to: "/hashtags",
  },
  {
    icon: "📡",
    title: "Trending Scan",
    desc: "See what your niche is talking about, and your angle on it",
    cta: "Scan Trends",
    tab: "trends",
    to: "/trends",
  },
];




function ToolsHub() {
  return (
    <AppShell title="Content Hub">
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "8px 0 40px" }}>
        <header style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Content Hub
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              color: GREY,
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            Pick a tool to start writing. Everything you create lands in your
            Content Bank as a draft — nothing goes live until you schedule it.
          </p>
        </header>

        <div
          className="haaylo-tools-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 20,
          }}
        >
          {TOOLS.map((t) => (
            <article
              key={t.tab}
              style={{
                ...CARD,
                padding: 32,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                minHeight: 220,
              }}
            >
              <div
                style={{
                  fontSize: 30,
                  lineHeight: 1,
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(99,102,241,0.18)",
                  border: "1px solid rgba(129,140,248,0.35)",
                }}
                aria-hidden
              >
                {t.icon}
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {t.title}
              </h2>
              <p
                style={{
                  margin: 0,
                  color: GREY,
                  fontSize: 14.5,
                  lineHeight: 1.5,
                  flex: 1,
                }}
              >
                {t.desc}
              </p>
              <Link
                to={t.to ?? "/engine"}
                {...(t.to ? {} : { hash: `m=content&t=${t.tab}` })}

                style={{
                  alignSelf: "flex-start",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 14.5,
                   background: PURPLE,
                   color: "#FFFFFF",
                   border: `1px solid ${LINE}`,
                   boxShadow: "0 8px 18px -6px rgba(85,62,162,0.4)",
                }}
              >
                {t.cta} →
              </Link>
            </article>
          ))}
        </div>

        <p
          style={{
            marginTop: 24,
            color: GREY,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Every post starts as a Draft in your Content Bank. Review it there or
          in the Content Calendar, then schedule it when you’re ready.
        </p>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .haaylo-tools-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
}

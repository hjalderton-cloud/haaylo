import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { joinWaitlist, getWaitlistCount } from "@/lib/waitlist.functions";
import wordmark from "@/assets/haaylo-logo-2026.png.asset.json";
import { BG, SURFACE, NAVY, INDIGO, PURPLE, PINK, LINE, font } from "@/lib/theme";

export const Route = createFileRoute("/waitlist")({
  head: () => ({
    meta: [
      { title: "One workspace for your entire marketing workflow. — Haaylo" },
      {
        name: "description",
        content:
          "Haaylo brings your strategy, content, planning, research, and brainstorm into a single system. Join the waitlist for early access.",
      },
      { property: "og:title", content: "One workspace for your entire marketing workflow." },
      {
        property: "og:description",
        content:
          "Haaylo brings your strategy, content, planning, research, and brainstorm into a single system. Join the waitlist for early access.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "One workspace for your entire marketing workflow." },
      {
        name: "twitter:description",
        content:
          "Haaylo brings your strategy, content, planning, research, and brainstorm into a single system. Join the waitlist for early access.",
      },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
    ],
    links: [{ rel: "canonical", href: "https://haaylo.com/waitlist" }],
  }),
  component: WaitlistPage,
});

const emailSchema = z
  .string()
  .trim()
  .max(255, "Email is too long")
  .email("Please enter a valid email address");

const GREY_TEXT = NAVY;

const sectionHeading: React.CSSProperties = {
  margin: "0 0 18px 0",
  fontSize: "clamp(22px, 5vw, 30px)",
  fontWeight: 700,
  letterSpacing: "-0.015em",
  color: NAVY,
  fontFamily: font,
};

function CTAButton({
  label = "Join the Waitlist",
  block = false,
}: {
  label?: string;
  block?: boolean;
}) {
  return (
    <a
      href="#join"
      style={{
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        padding: "16px 28px",
        borderRadius: 14,
        color: "#fff",
        fontSize: 17,
        fontWeight: 700,
        letterSpacing: "-0.005em",
        textDecoration: "none",
        background: PURPLE,
        fontFamily: font,
      }}
    >
      {label}
    </a>
  );
}

function TestimonialCard() {
  return (
    <div
      style={{
        padding: "24px 22px",
        borderRadius: 18,
        background: "#FFFFFF",
        border: `1px solid ${LINE}`,
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      <div
        aria-hidden
        style={{
          flex: "0 0 auto",
          width: 48,
          height: 48,
          borderRadius: 999,
          background: PURPLE,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          color: "#fff",
          fontSize: 18,
        }}
      >
        ★
      </div>
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 16,
            lineHeight: 1.6,
            color: INDIGO,
            fontStyle: "italic",
          }}
        >
          "You've really identified a gap that will save marketers hours of time. You really have
          thought of everything — from brand voice to full content planning, all in one place. It's
          exactly the kind of tool our students, and the businesses we work with, actually need."
        </p>
        <div style={{ marginTop: 12, fontSize: 13.5, color: GREY_TEXT }}>
          — Sharon Wuyts, Lecturer, Chelmsford College
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        padding: "20px 20px",
        borderRadius: 16,
        background: "#FFFFFF",
        border: `1px solid ${LINE}`,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <div
        aria-hidden
        style={{
          flex: "0 0 auto",
          width: 44,
          height: 44,
          borderRadius: 12,
          background: SURFACE,
          border: `1px solid ${LINE}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4, fontFamily: font }}>
          {title}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.55, color: GREY_TEXT }}>{body}</div>
      </div>
    </div>
  );
}

function WaitlistPage() {
  const join = useServerFn(joinWaitlist);
  const fetchCount = useServerFn(getWaitlistCount);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetchCount();
      setCount(res.count);
    } catch {
      setCount(0);
    }
  }, [fetchCount]);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please enter a valid email address");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("submitting");
    try {
      await join({ data: { email: parsed.data } });
      setStatus("done");
      loadCount();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BG,
        color: NAVY,
        fontFamily: font,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto", padding: "28px 20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
          <img src={wordmark.url} alt="haaylo" style={{ height: 44, width: "auto", display: "block" }} />
        </div>

        {/* HERO */}
        <section style={{ marginBottom: 56 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(32px, 7vw, 52px)",
              lineHeight: 1.08,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              color: NAVY,
              fontFamily: font,
            }}
          >
            One workspace for your{" "}
            <span style={{ color: PURPLE }}>
              entire marketing workflow.
            </span>
          </h1>

          <p
            style={{
              marginTop: 20,
              marginBottom: 28,
              fontSize: "clamp(16px, 4.4vw, 20px)",
              lineHeight: 1.5,
              color: GREY_TEXT,
              maxWidth: 620,
            }}
          >
            Haaylo brings your strategy, content, planning, research, and brainstorm into a single
            system — so you stop losing hours switching between tools and start reclaiming your time.
          </p>

          <CTAButton label="Join the Waitlist" />
          <div style={{ marginTop: 10, fontSize: 13, color: GREY_TEXT }}>
            Be first to get access when we launch.
          </div>
        </section>

        {/* PROBLEM */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={sectionHeading}>Strategy shouldn't live in five different tabs.</h2>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: GREY_TEXT }}>
            Most freelancers, social media managers, and small marketing teams patch their strategy
            together from scattered notes, competitor screenshots, spreadsheets, and a blank content
            calendar. There's no single place that actually holds the thinking behind the content —
            so the content itself ends up generic.
          </p>
        </section>

        {/* BENEFITS */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={sectionHeading}>What you get</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
            }}
          >
            <FeatureCard
              icon="🧠"
              title="The Strategy Profile"
              body="A persistent home for your brand voice, audience, and strategy — so everything Haaylo helps you create actually sounds like you, not generic AI copy."
            />
            <FeatureCard
              icon="🔎"
              title="Competitor research, done for you"
              body="See what competitors are doing and where the gaps are, so you know exactly where to focus."
            />
            <FeatureCard
              icon="🗺️"
              title="A 90-day strategy, built for you"
              body="Get a structured content strategy and content pillars mapped out, not just a list of random post ideas."
            />
            <FeatureCard
              icon="📅"
              title="A content plan you can actually follow"
              body="Turn your strategy into a real plan, organised and ready to execute."
            />
            <FeatureCard
              icon="✍️"
              title="Write for any platform, any format"
              body="LinkedIn post, newsletter, blog, ad copy — generate on-brand content in the format you need, pulled from your Strategy Profile, not a generic prompt."
            />
            <FeatureCard
              icon="🔑"
              title="SEO keywords, scanned for your brand"
              body="Know which keywords actually matter for your business, not a generic list."
            />
            <FeatureCard
              icon="💬"
              title="Brainstorm with a chat that knows your brand"
              body="Think out loud with an assistant that already has your strategy and voice in context."
            />
            <FeatureCard
              icon="🧲"
              title="Lead magnets, email sequences, and launch campaigns"
              body="Go from idea to a full campaign — lead magnet, nurture sequence, and launch plan — without starting from a blank page."
            />
          </div>
        </section>

        {/* COMING SOON */}
        <section style={{ marginBottom: 56 }}>
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              padding: "30px 26px",
              borderRadius: 22,
              background: "#FFFFFF",
              border: `1px solid ${LINE}`,
            }}
          >
            <div
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: SURFACE,
                border: `1px solid ${LINE}`,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: INDIGO,
                marginBottom: 16,
              }}
            >
              <span style={{ color: PINK }}>✦</span> Coming soon
            </div>
            <p
              style={{
                position: "relative",
                margin: "0 0 20px 0",
                fontSize: "clamp(19px, 4.4vw, 26px)",
                lineHeight: 1.4,
                fontWeight: 700,
                letterSpacing: "-0.015em",
                color: NAVY,
                fontFamily: font,
              }}
            >
              Scheduling, native analytics, and an image generator are on the way — join the
              waitlist to be first to hear when they land.
            </p>
            <div
              style={{
                position: "relative",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              {["📅 Scheduling", "📊 Native analytics", "🎨 Image generator"].map((item) => (
                <span
                  key={item}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 12,
                    background: SURFACE,
                    border: `1px solid ${LINE}`,
                    fontSize: 14,
                    fontWeight: 600,
                    color: INDIGO,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={sectionHeading}>Built with real feedback, not guesswork</h2>
          <p style={{ margin: "0 0 22px 0", fontSize: 16, lineHeight: 1.6, color: GREY_TEXT }}>
            Haaylo is being developed in partnership with Chelmsford College, with a founding
            technical team already building and testing it.
          </p>
          <TestimonialCard />
        </section>

        {/* PRICING / FOUNDING MEMBER */}
        <section style={{ marginBottom: 56 }}>
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              padding: "28px 26px",
              borderRadius: 22,
              background: "#FFFFFF",
              border: `2px solid ${PINK}`,
            }}
          >
            <div
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: SURFACE,
                border: `1px solid ${LINE}`,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: PINK,
                marginBottom: 16,
              }}
            >
              ⭐ Founding Member Offer
            </div>
            <h2
              style={{
                position: "relative",
                margin: "0 0 14px 0",
                fontSize: "clamp(24px, 5.5vw, 34px)",
                lineHeight: 1.15,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: NAVY,
                fontFamily: font,
              }}
            >
              £99 for 12 months — only 25 spots.
            </h2>
            <p
              style={{
                position: "relative",
                margin: "0 0 22px 0",
                fontSize: 16,
                lineHeight: 1.6,
                color: GREY_TEXT,
                maxWidth: 560,
              }}
            >
              Be a Haaylo founding member. Lock in a full year of Pro access for £99, get every new
              feature first as it drops, and help shape the product while it’s being built.
            </p>
            <div
              style={{
                position: "relative",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 24,
              }}
            >
              {[
                "£99 / 12 months",
                "Pro access included",
                "First access to new features",
                "Founding-member pricing locked in",
              ].map((item) => (
                <span
                  key={item}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 12,
                    background: SURFACE,
                    border: `1px solid ${LINE}`,
                    fontSize: 14,
                    fontWeight: 600,
                    color: INDIGO,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
            <a
              href="#join"
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "14px 24px",
                borderRadius: 14,
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.005em",
                textDecoration: "none",
                background: PURPLE,
                fontFamily: font,
              }}
            >
              Claim your founding member spot
            </a>
          </div>
        </section>

        {/* WAITLIST CTA */}
        <section id="join" style={{ marginBottom: 40, scrollMarginTop: 20 }}>
          <h2 style={sectionHeading}>Get early access</h2>
          <p style={{ margin: "0 0 22px 0", fontSize: 16, lineHeight: 1.6, color: GREY_TEXT }}>
            We're putting the finishing touches on Haaylo. Join the waitlist and we'll email you as
            soon as a spot opens up.
          </p>

          <div
            style={{
              background: "#FFFFFF",
              border: `1px solid ${LINE}`,
              borderRadius: 20,
              padding: 24,
            }}
          >
            {status === "done" ? (
              <div style={{ textAlign: "center", padding: "12px 4px" }}>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 10, color: NAVY, fontFamily: font }}>
                  You're on the list — we'll be in touch soon.
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                <input
                  id="waitlist-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === "error") {
                      setStatus("idle");
                      setError(null);
                    }
                  }}
                  disabled={status === "submitting"}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: `1px solid ${error ? PINK : LINE}`,
                    background: SURFACE,
                    color: NAVY,
                    fontSize: 16,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                {error && (
                  <div role="alert" style={{ marginTop: 8, fontSize: 13, color: PINK }}>
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  style={{
                    marginTop: 14,
                    width: "100%",
                    padding: "16px 18px",
                    borderRadius: 12,
                    border: "none",
                    color: "#fff",
                    fontSize: 17,
                    fontWeight: 700,
                    letterSpacing: "-0.005em",
                    cursor: status === "submitting" ? "wait" : "pointer",
                    background: PURPLE,
                    opacity: status === "submitting" ? 0.85 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {status === "submitting" ? "Joining…" : "Join the Waitlist"}
                </button>
              </form>
            )}
          </div>
        </section>

        <footer
          style={{
            padding: "8px 0 32px",
            textAlign: "center",
            fontSize: 13,
            color: GREY_TEXT,
          }}
        >
          No spam. Unsubscribe anytime. ·{" "}
          <a
            href="https://haaylo.com"
            style={{ color: INDIGO, textDecoration: "none", borderBottom: `1px solid ${LINE}` }}
          >
            haaylo.com
          </a>
        </footer>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import wordmarkAsset from "@/assets/haaylo-logo-2026.png.asset.json";
import { BG, SURFACE, NAVY, INDIGO, PURPLE, PINK, LINE, TINT, font } from "@/lib/theme";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // Never let a slow/failed auth call blank the landing page.
    try {
      const { data } = await Promise.race([
        supabase.auth.getUser(),
        new Promise<{ data: { user: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { user: null } }), 2500),
        ),
      ]);
      if (data?.user && !data.user.is_anonymous) {
        // Carry a Stripe checkout return through, so payment gets verified.
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("session_id");
        const canceled = params.get("canceled");
        // A Stripe return still lands on /campaign so the payment gets verified.
        if (sessionId || canceled) {
          throw redirect({
            to: "/campaign",
            search: {
              ...(sessionId ? { session_id: sessionId } : {}),
              ...(canceled ? { canceled } : {}),
            },
          });
        }
        throw redirect({ to: "/home" });
      }
    } catch (err) {
      if (err && typeof err === "object" && "to" in (err as Record<string, unknown>)) throw err;
      if (err instanceof Error && err.name === "Redirect") throw err;
      if ((err as { isRedirect?: boolean })?.isRedirect) throw err;
    }
  },
  head: () => ({
    meta: [
      { title: "Haaylo | AI Marketing Operating Platform" },
      {
        name: "description",
        content:
          "Haaylo brings your business knowledge, strategy, campaigns, content, email and lead generation into one AI marketing platform. Build your Business Brain once and use it across everything you create.",
      },
      { property: "og:title", content: "Haaylo | AI Marketing Operating Platform" },
      {
        property: "og:description",
        content:
          "Tell Haaylo about your business once, then turn that knowledge into strategy, campaigns, content, emails, landing pages and lead generation. Closed beta, invite only.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://haaylo.com/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Haaylo | AI Marketing Operating Platform" },
      {
        name: "twitter:description",
        content:
          "Plan and create your marketing in one place. Build your Business Brain once and use it across everything. Closed beta, invite only.",
      },
    ],
    links: [{ rel: "canonical", href: "https://haaylo.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Haaylo",
          applicationCategory: "BusinessApplication",
          description:
            "AI marketing operating platform. Businesses save their audience, offers, brand voice, proof and goals once, then use that context to build strategy, campaigns, social content, emails, landing pages and lead generation. Currently in closed beta with a founding member cohort.",
          operatingSystem: "Web",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What exactly does Haaylo do?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Haaylo brings your marketing knowledge, strategy, campaigns and content into one place. Build your Business Brain once, then use it to create connected campaigns, social content, emails, landing pages, lead magnets and lead-generation workflows.",
              },
            },
            {
              "@type": "Question",
              name: "Is Haaylo just for social media?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Social content is one part of Haaylo. The platform is designed to help you plan and create complete marketing campaigns, including email, landing pages, lead magnets, lead capture and campaign strategy.",
              },
            },
            {
              "@type": "Question",
              name: "What is the Business Brain?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "The Business Brain stores the information Haaylo needs to understand your business, including your audience, services, offers, tone of voice, proof, CTAs and goals. Haaylo uses this context whenever it creates something for you.",
              },
            },
            {
              "@type": "Question",
              name: "What is the difference between Haaylo and ChatGPT?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "A general AI assistant usually starts from the information you put into each prompt. Haaylo works from the business context, brand voice, strategy, offers and marketing information you have already saved, so you do not need to repeatedly explain your business.",
              },
            },
            {
              "@type": "Question",
              name: "Can Haaylo create a complete campaign?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. You can start with a campaign goal or brief and build the strategy, content, emails, landing-page copy, lead-generation assets and calls to action around it.",
              },
            },
            {
              "@type": "Question",
              name: "What is Haaylo Agent?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Haaylo Agent is the more hands-off way to use Haaylo. Give it a goal or campaign brief and it can use your Business Brain and strategy to build more of the campaign for you. You can still review and edit everything before it is used.",
              },
            },
            {
              "@type": "Question",
              name: "Can I sign up today?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Haaylo is currently in closed beta with a small founding member cohort. Request an invite and we will be in touch as places become available.",
              },
            },
            {
              "@type": "Question",
              name: "How much will Haaylo cost?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Founding members will be offered £99 access for their first year after the trial. The planned public price is £49 per month when Haaylo launches more widely.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: MarketingHome,
});

const BODY = "#6B7088";
const INVITE_MAIL =
  "mailto:hello@haaylo.com?subject=Haaylo%20founding%20member%20invite";

const BRIEF_TEXT =
  "I want to recruit 25 founding members for Haaylo over the next four weeks";

function TypewriterBrief({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    idx.current = 0;
    const timer = setInterval(() => {
      idx.current += 1;
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) {
        setDone(true);
        clearInterval(timer);
      }
    }, 38);
    return () => clearInterval(timer);
  }, [text]);

  return (
    <span style={{ flex: 1, overflow: "hidden" }}>
      {displayed}
      <span
        style={{
          display: "inline-block",
          width: 2,
          height: 16,
          background: done ? "transparent" : PURPLE,
          marginLeft: 2,
          verticalAlign: "text-bottom",
          animation: done ? "none" : "blink 0.8s step-end infinite",
          opacity: done ? 0 : 1,
        }}
      />
    </span>
  );
}

function MarketingHome() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const faqs = [
    {
      q: "What exactly does Haaylo do?",
      a: "Haaylo brings your marketing knowledge, strategy, campaigns and content into one place. Build your Business Brain once, then use it to create connected campaigns, social content, emails, landing pages, lead magnets and lead-generation workflows.",
    },
    {
      q: "Is Haaylo just for social media?",
      a: "No. Social content is one part of Haaylo. The platform is designed to help you plan and create complete marketing campaigns, including email, landing pages, lead magnets, lead capture and campaign strategy.",
    },
    {
      q: "What is the Business Brain?",
      a: "The Business Brain stores the information Haaylo needs to understand your business, including your audience, services, offers, tone of voice, proof, CTAs and goals. Haaylo uses this context whenever it creates something for you.",
    },
    {
      q: "What is the difference between Haaylo and ChatGPT?",
      a: "A general AI assistant usually starts from the information you put into each prompt. Haaylo works from the business context, brand voice, strategy, offers and marketing information you have already saved, so you do not need to keep explaining your business.",
    },
    {
      q: "Can Haaylo create a complete campaign?",
      a: "Yes. You can start with a campaign goal or brief and build the strategy, content, emails, landing-page copy, lead-generation assets and calls to action around it.",
    },
    {
      q: "What is Haaylo Agent?",
      a: "Haaylo Agent is the more hands-off way to use Haaylo. Give it a goal or campaign brief and it can use your Business Brain and strategy to build more of the campaign for you. You can still review and edit everything before it is used.",
    },
    {
      q: "Can I edit everything Haaylo creates?",
      a: "Yes. Haaylo is there to help you work faster, not to remove your control. Everything is reviewable and editable before publishing or sending.",
    },
    {
      q: "Does Haaylo publish content automatically?",
      a: "You stay in control. Content is reviewed and approved before it is scheduled or published using supported integrations.",
    },
    {
      q: "Can I sign up today?",
      a: "Haaylo is currently in closed beta with a small founding member cohort. Request an invite and we will be in touch as places become available.",
    },
    {
      q: "What does founding member access include?",
      a: "Founding members get early access to Haaylo, the chance to help shape the platform through feedback, and the option to continue for £99 for their first year after the trial.",
    },
    {
      q: "How much will Haaylo cost?",
      a: "Founding members are offered £99 access for their first year after the trial. The planned public price is £49 per month when Haaylo launches more widely.",
    },
  ];
  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: NAVY,
        fontFamily: font,
      }}
    >
       <style>{`
         @media (min-width: 900px) {
           .how-it-works-grid {
             grid-template-columns: repeat(4, 1fr) !important;
           }
           .hero-grid {
             grid-template-columns: 1fr 1.05fr !important;
             align-items: center !important;
           }
           .compare-grid {
             grid-template-columns: 1fr 1fr !important;
           }
           .plan-grid {
             grid-template-columns: repeat(4, 1fr) !important;
           }
         }
         @media (max-width: 760px) {
           .site-nav { display: none !important; }
           .site-signin { display: none !important; }
           .site-hamburger { display: inline-flex !important; }
         }
       `}</style>

       {/* Beta banner */}
       <div
         style={{
           background: NAVY,
           color: "#fff",
           textAlign: "center",
           fontSize: 13.5,
           padding: "10px 20px",
           lineHeight: 1.5,
         }}
       >
         Haaylo is closed for beta testing with our founding member cohort. Invite only.{" "}
         <a href={INVITE_MAIL} style={{ color: "#fff", fontWeight: 600 }}>
           Request an invite
         </a>
       </div>

       {/* Header */}
      <header
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 28px",
          maxWidth: 1240,
          margin: "0 auto",
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <img
            src={wordmarkAsset.url}
            alt="haaylo"
            style={{ height: 44 }}
          />
          <nav className="site-nav" style={{ display: "flex", gap: 22, alignItems: "center" }}>
            <a href="#how-it-works" style={{ color: INDIGO, textDecoration: "none", fontWeight: 500, fontSize: 14.5 }}>How it works</a>
            <a href="#the-difference" style={{ color: INDIGO, textDecoration: "none", fontWeight: 500, fontSize: 14.5 }}>Why Haaylo</a>
            <a href="#features" style={{ color: INDIGO, textDecoration: "none", fontWeight: 500, fontSize: 14.5 }}>Features</a>
            <a href="#founding-members" style={{ color: INDIGO, textDecoration: "none", fontWeight: 500, fontSize: 14.5 }}>Founding members</a>
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link
            to="/auth"
            className="site-signin"
            style={{ color: INDIGO, textDecoration: "none", fontWeight: 500, fontSize: 14.5 }}
          >
            Sign in
          </Link>
          <a
            href={INVITE_MAIL}
            className="site-start"
            style={{
              background: PURPLE,
              color: "#fff",
              fontWeight: 600,
              fontSize: 14.5,
              padding: "11px 20px",
              borderRadius: 999,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Request an invite
          </a>
          <button
            className="site-hamburger"
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((v) => !v)}
            style={{
              display: "none",
              background: "#fff",
              border: `1px solid ${LINE}`,
              borderRadius: 10,
              padding: "8px 10px",
              cursor: "pointer",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ display: "block", width: 20, height: 2, background: NAVY, position: "relative" }}>
              <span style={{ display: "block", width: 20, height: 2, background: NAVY, position: "absolute", top: -6, left: 0 }} />
              <span style={{ display: "block", width: 20, height: 2, background: NAVY, position: "absolute", top: 6, left: 0 }} />
            </span>
          </button>
        </div>

        {mobileNavOpen && (
          <div
            className="site-mobile-nav"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "#fff",
              borderBottom: `1px solid ${LINE}`,
              padding: "16px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              zIndex: 50,
            }}
          >
            <a href="#how-it-works" onClick={() => setMobileNavOpen(false)} style={{ color: NAVY, textDecoration: "none", fontWeight: 500, fontSize: 15 }}>How it works</a>
            <a href="#the-difference" onClick={() => setMobileNavOpen(false)} style={{ color: NAVY, textDecoration: "none", fontWeight: 500, fontSize: 15 }}>Why Haaylo</a>
            <a href="#features" onClick={() => setMobileNavOpen(false)} style={{ color: NAVY, textDecoration: "none", fontWeight: 500, fontSize: 15 }}>Features</a>
            <a href="#founding-members" onClick={() => setMobileNavOpen(false)} style={{ color: NAVY, textDecoration: "none", fontWeight: 500, fontSize: 15 }}>Founding members</a>
            <Link to="/auth" onClick={() => setMobileNavOpen(false)} style={{ color: NAVY, textDecoration: "none", fontWeight: 500, fontSize: 15 }}>Sign in</Link>
            <a href={INVITE_MAIL} onClick={() => setMobileNavOpen(false)} style={{ color: PURPLE, textDecoration: "none", fontWeight: 700, fontSize: 15 }}>Request an invite</a>
          </div>
        )}
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px 64px" }}>
        <div
          className="hero-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: 48 }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                color: INDIGO,
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                marginBottom: 22,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: PINK }} />
              Closed beta · Invite only
            </div>
            <h1
              style={{
                fontSize: "clamp(38px, 5.4vw, 62px)",
                lineHeight: 1.04,
                margin: "0 0 22px",
                letterSpacing: "-0.02em",
                fontWeight: 700,
                color: NAVY,
              }}
            >
              Your marketing,
              <br />
              <span style={{ color: PINK }}>planned and created in one place.</span>
            </h1>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.6,
                color: BODY,
                maxWidth: 520,
                margin: "0 0 14px",
              }}
            >
              Tell Haaylo about your business once. Then turn that knowledge into strategy,
              campaigns, content, emails, landing pages and lead-generation workflows, all from one
              place.
            </p>
            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.6,
                color: NAVY,
                fontWeight: 600,
                maxWidth: 520,
                margin: "0 0 30px",
              }}
            >
              Stay hands-on or hand over the brief to Haaylo Agent. You decide how much AI does.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
              <a
                href={INVITE_MAIL}
                style={{
                  background: PURPLE,
                  color: "#fff",
                  padding: "14px 24px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 15.5,
                }}
              >
                Request an invite
              </a>
              <a
                href="#how-it-works"
                style={{
                  background: "#fff",
                  border: `1px solid ${LINE}`,
                  color: INDIGO,
                  padding: "14px 22px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 15.5,
                }}
              >
                See how Haaylo works
              </a>
            </div>
            <div style={{ fontSize: 13.5, color: BODY }}>
              Strategy, campaigns, content, email and lead generation · Closed beta with our
              founding member cohort · £49/month when we open to everyone
            </div>
          </div>

          {/* Product panel */}
          <div
            style={{
              background: "#fff",
              border: `1px solid ${LINE}`,
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 18px 44px rgba(20,27,61,0.09)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                borderBottom: `1px solid ${LINE}`,
                fontSize: 11,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: INDIGO,
                fontWeight: 600,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: PINK }} />
                The briefing room
              </span>
              <span style={{ letterSpacing: 0, textTransform: "none", color: BODY, fontWeight: 400, fontSize: 12 }}>
                Haaylo
              </span>
            </div>
            <div style={{ background: SURFACE, padding: "22px 20px 20px" }}>
              <div
                style={{
                  background: "#fff",
                  border: `1px solid ${LINE}`,
                  borderRadius: 14,
                  padding: "13px 15px",
                  color: NAVY,
                  fontSize: 14,
                  marginBottom: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <TypewriterBrief text={BRIEF_TEXT} />
                <span
                  style={{
                    background: PURPLE,
                    color: "#fff",
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 12.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  Build it
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                {["Your Business Brain", "Your strategy", "Your offers and CTAs"].map((chip) => (
                  <span
                    key={chip}
                    style={{
                      background: "#fff",
                      border: `1px solid ${LINE}`,
                      borderRadius: 999,
                      padding: "5px 11px",
                      fontSize: 11.5,
                      color: INDIGO,
                      fontWeight: 600,
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>

              <div
                style={{
                  background: "#fff",
                  border: `1px solid ${LINE}`,
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "9px 13px",
                    borderBottom: `1px solid ${LINE}`,
                    fontSize: 11.5,
                    color: BODY,
                  }}
                >
                  <span style={{ fontWeight: 600, color: NAVY }}>Campaign built</span>
                  <span
                    style={{
                      background: TINT.green,
                      color: TINT.greenInk,
                      borderRadius: 999,
                      padding: "3px 9px",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    Ready to review
                  </span>
                </div>
                <div style={{ padding: "13px 15px", display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: NAVY }}>
                    <strong>Objective:</strong> 25 founding members in four weeks
                    <br />
                    <strong>Audience:</strong> freelancers, founders and small business owners
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      "4-week campaign plan",
                      "8 LinkedIn posts",
                      "3-email sequence",
                      "Founding member landing page",
                      "Lead capture form and follow-up",
                    ].map((item) => (
                      <div key={item} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: TINT.greenInk, fontWeight: 700, fontSize: 12.5 }}>✓</span>
                        <span style={{ fontSize: 13, color: NAVY, lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "0 15px 14px",
                    flexWrap: "wrap",
                  }}
                >
                  {["Approve campaign", "Edit brief", "View assets"].map((label, i) => (
                    <span
                      key={label}
                      style={{
                        background: i === 0 ? PURPLE : "#fff",
                        color: i === 0 ? "#fff" : INDIGO,
                        border: i === 0 ? "none" : `1px solid ${LINE}`,
                        borderRadius: 999,
                        padding: "6px 13px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}

      <section id="how-it-works" style={{ background: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
       <div style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 28px" }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: INDIGO,
            marginBottom: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: PINK }} />
          How it works
        </div>
        <h2
          style={{
            fontSize: "clamp(28px,3.6vw,42px)",
            lineHeight: 1.1,
            margin: "0 0 36px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: NAVY,
          }}
        >
          One setup. <em style={{ fontStyle: "normal", color: PINK }}>Your whole marketing system.</em>
        </h2>
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 28,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 20,
              position: "relative",
            }}
            className="how-it-works-grid"
          >
            {[
              {
                n: 1,
                title: "Build your Business Brain",
                desc: "Add your business, audience, services, offers, brand voice, proof and goals once. Haaylo keeps them at the centre of everything it creates.",
              },
              {
                n: 2,
                title: "Build your strategy",
                desc: "Turn your goals into a focused marketing plan with campaigns, themes, channels and priorities.",
              },
              {
                n: 3,
                title: "Create the campaign",
                desc: "Generate the content, emails, landing pages, lead magnets and calls to action you need from one campaign brief.",
              },
              {
                n: 4,
                title: "Review, publish and learn",
                desc: "Edit anything you want, schedule your content, capture leads and use the results to improve what comes next.",
              },
            ].map((step) => (
              <div
                key={step.n}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  background: "#fff",
                  border: `1px solid ${LINE}`,
                  borderRadius: 16,
                  padding: "22px 20px",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: 16,
                    color: TINT.purpleInk,
                    background: TINT.purple,
                    marginBottom: 16,
                  }}
                >
                  {step.n}
                </div>
                <div style={{ fontSize: 16.5, fontWeight: 600, color: NAVY, marginBottom: 8 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: BODY }}>
                  {step.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
       </div>
      </section>

      {/* The difference: before and after */}
      <section id="the-difference" style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 28px 0" }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: INDIGO,
            marginBottom: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: PINK }} />
          Why Haaylo
        </div>
        <h2
          style={{
            fontSize: "clamp(28px,4vw,44px)",
            lineHeight: 1.1,
            margin: "0 0 14px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: NAVY,
          }}
        >
          Generic AI starts from a prompt.{" "}
          <em style={{ fontStyle: "normal", color: PINK }}>Haaylo starts with your business.</em>
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: BODY, maxWidth: 640, margin: "0 0 28px" }}>
          Haaylo already knows your tone of voice, customers, products, offers, proof points and
          calls to action, so you spend less time correcting AI and more time using what it creates.
          Here is the same September brief, run for an independent home specialist.

        </p>

        <div
          className="compare-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}
        >
          {[
            {
              tag: "A general AI assistant",
              bad: true,
              body:
                "In today's competitive market, window furnishings play a crucial role in enhancing both the aesthetic appeal and functionality of your living space.\n\nOur team of dedicated professionals is committed to delivering bespoke solutions tailored to your unique requirements, ensuring maximum satisfaction at every stage of the customer journey.\n\nContact us today to learn more about how we can transform your home!",
              notes: [
                "Generic filler, no real offer",
                "Words the owner has banned",
                "Nobody talks like this on Instagram",
              ],
            },
            {
              tag: "Haaylo, using the owner's own voice",
              bad: false,
              body:
                "September is a busy month for moving house, and bare windows are usually the first thing you notice 🏠\n\nFrom shutters to blackout blinds, we help you get the privacy sorted without any guesswork. We do the measuring, you choose the fabric, and we handle the fitting too.\n\nBecause we make around 90% of our products in-house, most orders are fitted within 4 weeks.\n\nBook your free home consultation today. 👇",
              notes: [
                "Your phrasing and rhythm, not a template",
                "Real facts: in-house manufacturing, 4-week turnaround",
                "Your exact sign-off, no invented offer",
              ],


            },
          ].map((card) => (
            <div
              key={card.tag}
              style={{
                background: "#fff",
                border: `1px solid ${card.bad ? LINE : PINK}`,
                borderRadius: 18,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "13px 18px",
                  borderBottom: `1px solid ${LINE}`,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: card.bad ? BODY : PINK,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  background: card.bad ? SURFACE : "#fff",
                }}
              >
                {card.tag}
              </div>
              <div
                style={{
                  padding: "20px 18px",
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: card.bad ? BODY : NAVY,
                  whiteSpace: "pre-line",
                  flex: 1,
                }}
              >
                {card.body}
              </div>
              <div
                style={{
                  borderTop: `1px solid ${LINE}`,
                  padding: "14px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  background: SURFACE,
                }}
              >
                {card.notes.map((note) => (
                  <div key={note} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <span
                      style={{
                        color: card.bad ? "#C2416A" : TINT.greenInk,
                        fontWeight: 700,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      {card.bad ? "✕" : "✓"}
                    </span>
                    <span style={{ fontSize: 13, color: NAVY, lineHeight: 1.5 }}>{note}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 30-day plan showcase */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 28px 0" }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: INDIGO,
            marginBottom: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: PINK }} />
          The 30-day plan
        </div>
        <h2
          style={{
            fontSize: "clamp(28px,4vw,44px)",
            lineHeight: 1.1,
            margin: "0 0 14px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: NAVY,
          }}
        >
          From strategy to{" "}
          <em style={{ fontStyle: "normal", color: PINK }}>a month of marketing.</em>
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: BODY, maxWidth: 640, margin: "0 0 28px" }}>
          Haaylo turns your goals into connected campaigns and weekly themes, so your marketing has
          a purpose, rather than twelve unrelated posts filling a calendar. Here is September for an
          independent home specialist.

        </p>

        <div
          className="plan-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 20 }}
        >
          {[
            {
              week: "Week 1",
              theme: "Moving season",
              accent: PINK,
              posts: [
                {
                  title: "New house, bare windows",
                  caption: "Just picked up the keys? The whole street can see straight in. Here is what to sort first…",
                  kind: "Photo post",
                  platform: "Instagram",
                },
                {
                  title: "What happens at your free home consultation",
                  caption: "We measure up, talk you through the options and give you a no-obligation quote. No pressure…",
                  kind: "Photo post",
                  platform: "Facebook",
                },
                {
                  title: "Which blind suits which room",
                  caption: "Bay window, bedroom, conservatory. Three rooms, three different answers…",
                  kind: "Carousel",
                  platform: "Instagram",
                },
              ],
            },
            {
              week: "Week 2",
              theme: "Made in house",
              accent: PURPLE,
              posts: [
                {
                  title: "Inside the factory: a shutter being built",
                  caption: "We make around 90% of what we fit ourselves, so we know what goes in your windows…",
                  kind: "Photo post",
                  platform: "Facebook",
                },
                {
                  title: "Perfect Fit blinds: no drilling, no screws",
                  caption: "They clip straight into your window frames and move with the door, so they suit conservatories…",
                  kind: "Photo post",
                  platform: "Instagram",
                },
                {
                  title: "Made in house, fitted in as little as 4 weeks",
                  caption: "Most of what we fit is our own, so there is no waiting around on someone else's diary…",
                  kind: "Carousel",
                  platform: "Instagram",
                },
              ],
            },
            {
              week: "Week 3",
              theme: "Proof",
              accent: "#3E7CB1",
              posts: [
                {
                  title: "Shutters in a three-bed semi, room by room",
                  caption: "Same house, three windows, three different problems. Swipe through the finished results…",
                  kind: "Before & after",
                  platform: "Instagram",
                },
                {
                  title: "The bay window that took two visits to measure",
                  caption: "Bay windows are rarely square. Here is how we measure one properly, and the finished shutters…",
                  kind: "Before & after",
                  platform: "Facebook",
                },
                {
                  title: "This month's reviews, in their own words",
                  caption: "A few of the notes customers sent us this month, and the homes behind them…",
                  kind: "Testimonial",
                  platform: "Instagram",
                },
              ],
            },
            {
              week: "Week 4",
              theme: "Darker evenings",
              accent: "#2E8B6E",
              posts: [
                {
                  title: "Privacy when the streetlights come on at five",
                  caption: "Lights on, curtains open, whole street can see in. Here is the fix that isn't sitting in the dark…",
                  kind: "Photo post",
                  platform: "Instagram",
                },
                {
                  title: "Blackout blinds for better sleep",
                  caption: "Street lamp right outside the bedroom? Proper blackout, fitted to the window, not the frame…",
                  kind: "Photo post",
                  platform: "Facebook",
                },
                {
                  title: "Book your consultation before the Christmas rush",
                  caption: "Want them fitted before the family descend? With a 4-week turnaround, now is the time to order…",
                  kind: "Offer post",
                  platform: "Facebook",
                },
              ],
            },
          ].map((col) => (
            <div
              key={col.week}
              style={{
                background: "#fff",
                border: `1px solid ${LINE}`,
                borderRadius: 16,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ height: 4, background: col.accent }} />
              <div style={{ padding: "16px 16px 0" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: ".14em",
                      textTransform: "uppercase",
                      color: col.accent,
                      fontWeight: 700,
                    }}
                  >
                    {col.week}
                  </span>
                  <span style={{ fontSize: 11.5, color: BODY, fontWeight: 600 }}>3 posts a week</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 10 }}>
                  {col.theme}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "0 16px 16px",
                  flex: 1,
                }}
              >
                {col.posts.slice(0, 1).map((p) => (
                  <div
                    key={p.title}
                    style={{
                      background: SURFACE,
                      border: `1px solid ${LINE}`,
                      borderRadius: 10,
                      padding: "10px 11px",
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: ".1em",
                        textTransform: "uppercase",
                        color: BODY,
                        fontWeight: 700,
                        marginBottom: 3,
                      }}
                    >
                      Topic
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: NAVY,
                        lineHeight: 1.45,
                        fontWeight: 600,
                        marginBottom: 5,
                        height: 38,
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 2,
                        overflow: "hidden",
                      }}
                    >
                      {p.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: BODY,
                        lineHeight: 1.5,
                        fontStyle: "italic",
                        marginBottom: 8,
                        height: 54,
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 3,
                        overflow: "hidden",
                      }}
                    >
                      {p.caption}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: col.accent,
                          background: "#fff",
                          border: `1px solid ${LINE}`,
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}
                      >
                        {p.kind}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: INDIGO,
                          background: "#fff",
                          border: `1px solid ${LINE}`,
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}
                      >
                        {p.platform}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                      {["Approve", "Edit", "Schedule"].map((action, i) => (
                        <span
                          key={action}
                          style={{
                            fontSize: 10.5,
                            textAlign: "center",
                            fontWeight: 700,
                            background: i === 0 ? PURPLE : "#fff",
                            color: i === 0 ? "#fff" : INDIGO,
                            border: i === 0 ? "none" : `1px solid ${LINE}`,
                            borderRadius: 999,
                            padding: "3px 10px",
                          }}
                        >
                          {action}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: SURFACE,
            border: `1px solid ${LINE}`,
            borderRadius: 16,
            padding: "16px 18px",
            fontSize: 14,
            color: NAVY,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <span>
            Every theme and example above comes from the strategy and business knowledge you saved.
          </span>
          <span
            style={{
              background: PURPLE,
              color: "#fff",
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Build this month's content
          </span>
        </div>
      </section>

      {/* Use Haaylo your way */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 28px 0" }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: INDIGO,
            marginBottom: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: PINK }} />
          Manual or agent
        </div>
        <h2
          style={{
            fontSize: "clamp(28px,4vw,44px)",
            lineHeight: 1.1,
            margin: "0 0 14px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: NAVY,
          }}
        >
          Use Haaylo <em style={{ fontStyle: "normal", color: PINK }}>your way.</em>
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: BODY, maxWidth: 640, margin: "0 0 28px" }}>
          The same Business Brain powers everything. You choose how hands-on you want to be.
        </p>
        <div
          className="compare-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20, marginBottom: 18 }}
        >
          {[
            {
              tag: "Stay in control",
              desc: "Use Haaylo as your marketing workspace. Build your strategy, campaigns and assets step by step, with AI helping when you need it.",
              accent: INDIGO,
            },
            {
              tag: "Hand over the brief",
              desc: "Tell Haaylo Agent what you want to achieve and let it use your Business Brain and strategy to build the campaign for you.",
              accent: PINK,
            },
          ].map((card) => (
            <div
              key={card.tag}
              style={{
                background: "#fff",
                border: `1px solid ${LINE}`,
                borderRadius: 18,
                overflow: "hidden",
              }}
            >
              <div style={{ height: 4, background: card.accent }} />
              <div style={{ padding: "22px 22px 24px" }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    color: card.accent,
                    marginBottom: 10,
                  }}
                >
                  {card.tag}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.65, color: NAVY }}>{card.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            background: SURFACE,
            border: `1px solid ${LINE}`,
            borderRadius: 16,
            padding: "16px 18px",
            fontSize: 14,
            color: NAVY,
          }}
        >
          Same business knowledge. Same tools. You decide how much AI does.
        </div>
      </section>

       {/* What you get */}
      <section id="features" style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 28px 0" }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: INDIGO,
            marginBottom: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: PINK }} />
          What you get
        </div>
        <h2
          style={{
            fontSize: "clamp(28px,4vw,44px)",
            lineHeight: 1.1,
            margin: "0 0 28px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: NAVY,
          }}
        >
          One place to <em style={{ fontStyle: "normal", color: PINK }}>plan, create and run</em>{" "}
          your marketing.
        </h2>
        {[
          {
            stage: "Plan",
            accent: PURPLE,
            items: [
              ["Your Business Brain, saved once", "Your audience, offers, services, writing samples, testimonials, CTAs, contact details and brand information live in one place. Haaylo uses them across everything it creates."],
              ["The Briefing Room", "Tell Haaylo what you want to achieve in plain English, from a single post to a complete campaign, and build from one clear brief."],
              ["Strategy and campaign planning", "Turn your business goals into focused marketing priorities, campaign ideas, weekly themes and channel plans."],
              ["Full campaigns", "Create joined-up campaigns from one brief, including the strategy, social content, emails, landing-page copy and lead-generation assets."],
            ],
          },
          {
            stage: "Create",
            accent: PINK,
            items: [
              ["Social content", "Posts written from your own wording, offers and calls to action, for the channels you actually use."],
              ["Email sequences", "Create welcome sequences, nurture campaigns, offers and newsletters using the same tone, audience and messaging as the rest of your marketing."],
              ["Landing pages", "Create campaign and lead-generation pages with the messaging, CTA and sign-up form connected."],
              ["Lead magnets", "Turn useful ideas into guides, checklists and downloadable resources designed to capture leads."],
              ["AI image generation", "Generate on-brand campaign images from your product, industry and brand colours, then open them in the Design Studio to add your logo, copy or overlays."],
              ["Your own graphics", "Create branded campaign graphics using your own colours, logos, copy and imagery."],
              ["Repurpose what you already have", "Turn blogs, newsletters, videos or transcripts into platform-ready content without starting again."],
            ],
          },
          {
            stage: "Run",
            accent: INDIGO,
            items: [
              ["The Content Bank", "Keep campaign content and drafts together so you can edit, reuse and manage everything from one place."],
              ["The scheduler", "Approve your content and schedule it across supported platforms."],
              ["Lead capture", "Keep enquiries from landing pages and campaigns in one place so leads do not disappear into different tools."],
              ["Insights & Analytics", "See how your campaigns and content are performing across reach, engagement, leads and channel breakdowns, all in one view."],
            ],
          },
        ].map((group) => (
          <div key={group.stage} style={{ marginBottom: 32 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: group.accent,
                marginBottom: 14,
              }}
            >
              <span style={{ width: 22, height: 3, borderRadius: 999, background: group.accent }} />
              {group.stage}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 20,
              }}
            >
              {group.items.map(([title, desc]) => (
                <div
                  key={title}
                  style={{
                    background: "#fff",
                    border: `1px solid ${LINE}`,
                    borderRadius: 16,
                    padding: "22px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 16,
                      letterSpacing: "-0.01em",
                      color: NAVY,
                    }}
                  >
                    {title}
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65, color: BODY }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div
          style={{
            background: SURFACE,
            border: `1px solid ${LINE}`,
            borderRadius: 16,
            padding: "16px 18px",
            fontSize: 14,
            color: NAVY,
          }}
        >
          Spend less time briefing different tools and rewriting AI. Keep your marketing connected
          from strategy through to execution.
        </div>
      </section>

      {/* Founding members */}
      <section
        id="founding-members"
        style={{
          maxWidth: 1120,
          margin: "72px auto 0",
          padding: "0 28px",
        }}
      >
        <div
          style={{
            background: SURFACE,
            border: `1px solid ${LINE}`,
            borderRadius: 18,
            padding: "44px 28px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(24px,3vw,34px)",
              lineHeight: 1.15,
              margin: "0 0 12px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: NAVY,
            }}
          >
            Help shape Haaylo <em style={{ fontStyle: "normal", color: PINK }}>before it launches.</em>
          </h2>
          <p
            style={{
              fontSize: 15,
              color: BODY,
              margin: "0 auto 28px",
              lineHeight: 1.65,
              maxWidth: 620,
            }}
          >
            We're inviting a small group of freelancers, founders, marketers and small businesses to
            test Haaylo before the public launch. Try the platform, tell us what works and what
            doesn't, and help shape what we build next.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
              textAlign: "left",
              marginBottom: 28,
            }}
          >
            {[
              ["Early access to Haaylo", "Use the platform before public launch and test the tools in your own business."],
              ["Have your say", "Your feedback will directly influence what we improve and build next."],
              ["Founding member access", "After your trial, choose whether you want to continue as a founding member for £99 for your first year."],
            ].map(([title, desc]) => (
              <div
                key={title}
                style={{
                  background: "#fff",
                  border: `1px solid ${LINE}`,
                  borderRadius: 14,
                  padding: "20px 18px",
                }}
              >
                <div style={{ fontSize: 15.5, fontWeight: 600, color: NAVY, marginBottom: 8 }}>
                  {title}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: BODY }}>{desc}</div>
              </div>
            ))}
          </div>
          <p
            style={{
              fontSize: 14,
              color: NAVY,
              lineHeight: 1.65,
              margin: "0 auto 26px",
              maxWidth: 620,
            }}
          >
            Selected founding members will also be invited to take part in the Haaylo project with
            Chelmsford College, including a live feedback session with marketing students and the
            chance to connect with the wider project.
          </p>
          <a
            href={INVITE_MAIL}
            style={{
              display: "inline-block",
              background: PURPLE,
              color: "#fff",
              padding: "15px 30px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            Request an invite
          </a>
          <div style={{ marginTop: 14, fontSize: 13.5, color: BODY }}>
            £49 a month when Haaylo opens to everyone.
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 820, margin: "0 auto", padding: "72px 28px 0" }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: INDIGO,
            marginBottom: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: PINK }} />
          FAQ
        </div>
        <h2
          style={{
            fontSize: "clamp(28px,3.6vw,42px)",
            lineHeight: 1.1,
            margin: "0 0 28px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: NAVY,
          }}
        >
          Questions, answered
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {faqs.map((faq, i) => {
            const open = openFaq === i;
            return (
              <div
                key={faq.q}
                style={{
                  background: "#fff",
                  border: `1px solid ${open ? PINK : LINE}`,
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : i)}
                  aria-expanded={open}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    color: NAVY,
                    padding: "18px 20px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    fontSize: 15.5,
                    fontWeight: 600,
                    fontFamily: font,
                  }}
                >
                  <span>{faq.q}</span>
                  <span style={{ flexShrink: 0, color: PINK, fontSize: 18 }}>
                    {open ? "−" : "+"}
                  </span>
                </button>
                {open && (
                  <div
                    style={{
                      padding: "0 20px 18px",
                      fontSize: 14,
                      lineHeight: 1.65,
                      color: BODY,
                    }}
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <footer
        style={{
          marginTop: 72,
          borderTop: `1px solid ${LINE}`,
          padding: "28px",
          textAlign: "center",
          fontSize: 13.5,
          color: BODY,
        }}
      >
        <div style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/pricing" style={{ color: INDIGO, textDecoration: "none" }}>
            Pricing
          </Link>
          <Link to="/terms" style={{ color: INDIGO, textDecoration: "none" }}>
            Terms
          </Link>
          <Link to="/privacy" style={{ color: INDIGO, textDecoration: "none" }}>
            Privacy
          </Link>
          <a href="mailto:hello@haaylo.com" style={{ color: INDIGO, textDecoration: "none" }}>
            Contact
          </a>
        </div>
        <div style={{ marginTop: 12, color: BODY }}>
          © {new Date().getFullYear()} haaylo
        </div>
      </footer>
    </div>
  );
}

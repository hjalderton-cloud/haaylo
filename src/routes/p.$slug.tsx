import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicLandingPage, submitLandingLead, type LandingContent } from "@/lib/landing.functions";
import { FONT_STACKS, contrastText, heroBackground, sanitiseRichText } from "@/lib/landing-render";
import { HaayloBadge } from "@/components/public/HaayloBadge";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const page = await getPublicLandingPage({ data: { slug: params.slug } });
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Page unavailable" }, { name: "robots", content: "noindex" }] };
    }
    const title = loaderData.content.seoTitle || loaderData.content.headline;
    const description = loaderData.content.seoDescription || loaderData.content.subheadline;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  pendingComponent: PageSkeleton,
  errorComponent: () => <PageMissing />,
  notFoundComponent: () => <PageMissing />,
  component: PublicLandingPage,
});

function shell(children: React.ReactNode) {
  return (
    <main style={{ minHeight: "100vh", background: "#141B3D", color: "#F5F3FF", fontFamily: "system-ui, sans-serif" }}>
      {children}
    </main>
  );
}

function PageMissing() {
  return shell(
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>This page isn&rsquo;t available</h1>
        <p style={{ color: "#9AA0C0" }}>The link may have changed or the page has been taken down.</p>
      </div>
    </div>,
  );
}

const block = (h: number, w: string = "100%"): React.CSSProperties => ({
  height: h,
  width: w,
  borderRadius: 12,
  background: "rgba(255,255,255,0.08)",
  margin: "0 auto 14px",
});

function PageSkeleton() {
  return shell(
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "72px 20px" }}>
      <div style={block(34, "140px")} />
      <div style={block(44)} />
      <div style={block(20, "80%")} />
      <div style={{ ...block(230), marginTop: 34 }} />
    </div>,
  );
}

function PublicLandingPage() {
  const { id, content, heroUrl, businessName, campaign } = Route.useLoaderData();
  const submit = useServerFn(submitLandingLead);
  const navigate = useNavigate();
  const font = FONT_STACKS[content.font];

  const [values, setValues] = useState({ firstName: "", lastName: "", email: "", company: "", phone: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const is30Day = campaign?.duration === "30-day";
  const phase = campaign?.phase ?? 0;
  const waitlist = is30Day && phase === 1;
  const educational = is30Day && phase === 2;
  const salesPage = is30Day && phase === 3;
  const closing = is30Day && phase === 4;
  const checkoutUrl = campaign?.checkoutUrl ?? null;
  const closesAt = campaign?.cartClosesAt ?? null;

  const headline = waitlist
    ? "Join the waitlist"
    : salesPage
      ? "Get access now"
      : closing
        ? "Last chance to join"
        : content.headline;


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      const res = await submit({
        data: {
          pageId: id,
          firstName: values.firstName.trim() || values.email.trim().split("@")[0],
          email: values.email.trim(),
          ...(content.fields.lastName && !waitlist ? { lastName: values.lastName.trim() } : {}),
          ...(content.fields.company && !waitlist ? { company: values.company.trim() } : {}),
          ...(content.fields.phone && !waitlist ? { phone: values.phone.trim() } : {}),
        },
      });
      if (res.campaignId && campaign?.hasGuide !== false) {
        void navigate({ to: "/guide/$campaignId", params: { campaignId: res.campaignId } });
        return;
      }
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      setState("idle");
    }
  }

  const body = sanitiseRichText(content.bodyHtml);
  const heroBg = heroBackground(content as LandingContent, heroUrl);
  const heroInk = heroUrl ? "#FFFFFF" : contrastText(content.brandColour);

  const vars = {
    "--color-primary": content.brandColour,
    "--color-secondary": content.secondaryColour,
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
        background: "#F6F7FB",
        color: "var(--color-text)",
        fontFamily: "var(--font-family)",
      }}
    >
      <section
        style={{
          background: heroBg,
          color: heroInk,
          padding: "clamp(48px, 9vw, 84px) 20px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {content.showLogo && (content.logoUrl ? (
            <img src={content.logoUrl} alt={businessName ?? ""} style={{ height: 40, maxWidth: "70%", objectFit: "contain" }} />
          ) : businessName ? (
            <span style={{ fontWeight: 800, letterSpacing: 0.4, fontSize: 15 }}>{businessName}</span>
          ) : null)}
          <h1
            style={{
              margin: 0,
              fontFamily: font.heading,
              fontWeight: font.weight,
              fontSize: "clamp(28px, 5vw, 46px)",
              lineHeight: 1.15,
              overflowWrap: "anywhere",
            }}
          >
            {headline}
          </h1>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 17, opacity: 0.94, overflowWrap: "anywhere" }}>
            {content.subheadline}
          </p>
        </div>
      </section>

      <div style={{ flex: 1, width: "100%", maxWidth: 620, margin: "0 auto", padding: "34px 20px 72px", boxSizing: "border-box" }}>
        {!waitlist && content.bodyEnabled && body.trim() !== "" && (
          <div
            style={{ fontSize: 16, lineHeight: 1.7, color: "#3A3F5C", marginBottom: 26, overflowWrap: "anywhere" }}
            dangerouslySetInnerHTML={{ __html: body }}
          />
        )}

        {closing && closesAt && <Countdown closesAt={closesAt} colour={content.brandColour} font={font.heading} />}

        {educational && (
          <p
            style={{
              margin: "0 0 22px",
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(20,27,61,0.06)",
              fontSize: 14.5,
              fontWeight: 700,
              color: "#3A3F5C",
            }}
          >
            Doors are opening soon — leave your email and you&rsquo;ll hear the moment they do.
          </p>
        )}

        {(salesPage || closing) && checkoutUrl && (
          <a
            href={checkoutUrl}
            style={{
              display: "block",
              textAlign: "center",
              marginBottom: 22,
              background: "var(--color-primary)",
              color: contrastText(content.brandColour),
              borderRadius: 12,
              padding: "15px 18px",
              fontSize: 16,
              fontWeight: 800,
              fontFamily: font.heading,
              textDecoration: "none",
              overflowWrap: "anywhere",
            }}
          >
            {closing ? "Join before the doors close" : "Get access now"}
          </a>
        )}

        <div style={{ background: "#fff", borderRadius: 18, padding: 26, boxShadow: "0 16px 44px rgba(20,27,61,0.10)" }}>

          {state === "done" ? (
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, textAlign: "center", fontFamily: font.heading }}>
              {content.thankYou}
            </p>
          ) : (
            <form onSubmit={onSubmit}>
              <h2 style={{ margin: "0 0 16px", fontFamily: font.heading, fontWeight: font.weight, fontSize: 21, overflowWrap: "anywhere" }}>
                {waitlist ? "Be first to know" : salesPage ? "Ready when you are" : closing ? "Final call" : content.formHeading}
              </h2>
              <div style={{ display: "grid", gap: 10 }}>
                {!waitlist && (
                  <Field label="First name" required value={values.firstName} onChange={(v) => setValues({ ...values, firstName: v })} />
                )}
                {!waitlist && content.fields.lastName && (
                  <Field label="Last name" value={values.lastName} onChange={(v) => setValues({ ...values, lastName: v })} />
                )}
                <Field label="Email address" type="email" required value={values.email} onChange={(v) => setValues({ ...values, email: v })} />
                {!waitlist && content.fields.company && (
                  <Field label="Company name" value={values.company} onChange={(v) => setValues({ ...values, company: v })} />
                )}
                {!waitlist && content.fields.phone && (
                  <Field label="Phone number" type="tel" value={values.phone} onChange={(v) => setValues({ ...values, phone: v })} />
                )}
                {error && <p style={{ margin: 0, color: "#C0392B", fontSize: 13 }}>{error}</p>}
                <button
                  type="submit"
                  disabled={state === "sending"}
                  style={{
                    marginTop: 4,
                    background: "var(--color-primary)",
                    color: contrastText(content.brandColour),
                    border: "none",
                    borderRadius: 10,
                    padding: "13px 18px",
                    fontSize: 15,
                    fontWeight: 800,
                    fontFamily: font.heading,
                    cursor: "pointer",
                  }}
                >
                  {state === "sending"
                    ? "Sending…"
                    : waitlist
                      ? "Join the waitlist"
                      : salesPage
                        ? "Get access now"
                        : closing
                          ? "Join before it closes"
                          : content.buttonLabel}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {content.showBadge && <HaayloBadge />}
    </main>
  );
}

/** Live countdown to the campaign's cart close time. */
function Countdown({ closesAt, colour, font }: { closesAt: string; colour: string; font: string }) {
  const target = new Date(closesAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!Number.isFinite(target)) return null;
  const left = Math.max(0, target - now);
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const parts = [
    { n: d, label: "days" },
    { n: h, label: "hrs" },
    { n: m, label: "min" },
    { n: s, label: "sec" },
  ];
  return (
    <div
      style={{
        marginBottom: 22,
        padding: "16px 14px",
        borderRadius: 14,
        background: colour,
        color: contrastText(colour),
        textAlign: "center",
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 800, letterSpacing: 0.4 }}>
        {left === 0 ? "Doors are closed" : "Closing in"}
      </p>
      {left > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          {parts.map((p) => (
            <span key={p.label} style={{ minWidth: 56 }}>
              <span style={{ display: "block", fontSize: 26, fontWeight: 800, fontFamily: font }}>{p.n}</span>
              <span style={{ display: "block", fontSize: 12, opacity: 0.85 }}>{p.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#5A6079" }}>
      {label}
      <input
        type={type}
        required={required}
        value={value}
        maxLength={255}
        onChange={(e) => onChange(e.target.value)}
        style={{
          display: "block",
          width: "100%",
          marginTop: 5,
          border: "1px solid #DFE2EE",
          borderRadius: 10,
          padding: "11px 13px",
          fontSize: 15,
          color: "#1B1F35",
          boxSizing: "border-box",
        }}
      />
    </label>
  );
}

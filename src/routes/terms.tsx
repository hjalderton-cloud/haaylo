import { createFileRoute, Link } from "@tanstack/react-router";
import { BG, NAVY, PURPLE, font, POPPINS_LINKS } from "@/lib/theme";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — haaylo.com" },
      {
        name: "description",
        content:
          "The terms that apply when you use haaylo.com: membership and billing, acceptable use, your content, connected social accounts, and cancellation.",
      },
      { property: "og:title", content: "Terms of Service — haaylo.com" },
      {
        property: "og:description",
        content: "Membership, billing, acceptable use and cancellation terms for haaylo.com.",
      },
      { property: "og:url", content: "https://haaylo.com/terms" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "canonical", href: "https://haaylo.com/terms" },
      ...POPPINS_LINKS,
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: BG,
        fontFamily: font,
        color: NAVY,
      }}
    >
      <div className="max-w-[760px] mx-auto px-6 py-12 sm:py-16">
        <Link to="/" className="inline-block text-sm mb-8" style={{ color: PURPLE }}>
          ← Back
        </Link>

        <h1
          className="text-4xl sm:text-5xl mb-2 font-bold"
          style={{ fontFamily: font, color: NAVY }}
        >
          Terms of Service
        </h1>
        <p className="mb-10 text-sm" style={{ color: NAVY }}>Last updated: 5 September 2026</p>

        <div className="space-y-8" style={{ color: NAVY, lineHeight: 1.7 }}>
          <section>
            <p>
              These terms apply when you use haaylo.com ("haaylo", "we", "us"). By creating an
              account or paying for a membership you agree to them. haaylo is operated from the
              United Kingdom.
            </p>
          </section>

          <Section title="1. Your account">
            <p>
              You need an account to use haaylo. Keep your password to yourself and tell us at{" "}
              <Mail /> if you think someone else has access. You must be 18 or over and using
              haaylo for a business or professional purpose.
            </p>
          </Section>

          <Section title="2. Membership and billing">
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Founding Member pricing covers your first 12 months. After that, membership renews
                at £49 per month unless you cancel. The price you'll pay is shown before you enter
                any card details.
              </li>
              <li>Payments are taken by Stripe. We never see or store your card number.</li>
              <li>
                Memberships renew automatically. Cancel any time from Account &amp; Billing — you
                keep access until the end of the period you've paid for.
              </li>
              <li>
                We don't offer refunds for part-used periods, but if something has gone wrong, email{" "}
                <Mail /> and we'll sort it out.
              </li>
              <li>
                We may change prices with at least 30 days' notice by email. Existing Founding
                Member terms are honoured for the period stated when you joined.
              </li>
            </ul>
          </Section>

          <Section title="3. What you can and can't do">
            <ul className="list-disc pl-6 space-y-2">
              <li>Don't use haaylo to produce unlawful, hateful, deceptive or harassing content.</li>
              <li>Don't resell or share your account with people outside your organisation.</li>
              <li>
                Don't attempt to break, overload or reverse-engineer the service, or scrape it
                automatically.
              </li>
              <li>
                Follow the rules of any social network you connect. Their terms apply to anything
                published there.
              </li>
            </ul>
          </Section>

          <Section title="4. Your content">
            <p>
              Everything you put into haaylo — your brand answers, briefs, images and posts — stays
              yours, as does the content haaylo generates for you. You give us permission to store
              and process it only to run the service for you. You're responsible for checking
              anything before it's published.
            </p>
          </Section>

          <Section title="5. AI-generated content">
            <p>
              haaylo uses AI models to draft content. Output can be wrong, dated or resemble other
              text, so review it before publishing. We don't guarantee any particular result,
              reach or revenue from using haaylo.
            </p>
          </Section>

          <Section title="6. Connected social accounts">
            <p>
              When you connect LinkedIn, Facebook or Instagram, you authorise haaylo to publish the
              content you schedule. You can disconnect an account at any time, which deletes the
              stored access token. We aren't responsible for a network changing its rules,
              rejecting a post or suspending your account.
            </p>
          </Section>

          <Section title="7. Availability">
            <p>
              We aim to keep haaylo running continuously, but we may take it down for maintenance
              or updates. Features described as coming soon may change or not ship.
            </p>
          </Section>

          <Section title="8. Ending your account">
            <p>
              You can cancel or ask us to delete your account at any time by emailing <Mail />. We
              may suspend or close an account that breaches these terms, and will explain why where
              we can.
            </p>
          </Section>

          <Section title="9. Liability">
            <p>
              Nothing here limits liability that can't legally be limited. Otherwise, our total
              liability to you is capped at the amount you paid us in the 12 months before the
              claim, and we aren't liable for lost profits, lost data or indirect losses.
            </p>
          </Section>

          <Section title="10. These terms">
            <p>
              We may update these terms and will post the new version here with a fresh date;
              material changes will be emailed to members. These terms are governed by the law of
              England and Wales, and the courts of England and Wales have jurisdiction.
            </p>
            <p className="mt-3">
              Questions? Email <Mail />. See also our{" "}
              <Link className="underline" style={{ color: PURPLE }} to="/privacy">
                privacy policy
              </Link>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl mb-3 font-semibold" style={{ fontFamily: font, color: NAVY }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Mail() {
  return (
    <a className="underline" style={{ color: PURPLE }} href="mailto:hello@contentcollectiv.co.uk">
      hello@contentcollectiv.co.uk
    </a>
  );
}

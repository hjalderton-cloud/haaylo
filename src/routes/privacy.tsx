import { createFileRoute, Link } from "@tanstack/react-router";
import { BG, NAVY, INDIGO, PURPLE, LINE, font, POPPINS_LINKS } from "@/lib/theme";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — haaylo.com" },
      {
        name: "description",
        content:
          "haaylo.com privacy policy: what data the Inbound Engine and Social Scheduler collect, how social account tokens are stored, and how to request deletion.",
      },
      { property: "og:title", content: "Privacy Policy — haaylo.com" },
      {
        property: "og:description",
        content:
          "How haaylo.com handles your account data, connected social accounts (LinkedIn, Facebook, Instagram) and scheduled content.",
      },
      { property: "og:url", content: "https://appcontentcollectiv.lovable.app/privacy" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://appcontentcollectiv.lovable.app/privacy" },
      ...POPPINS_LINKS,
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
        <Link
          to="/"
          className="inline-block text-sm mb-8"
          style={{ color: PURPLE }}
        >
          ← Back
        </Link>

        <h1
          className="text-4xl sm:text-5xl mb-2 font-bold"
          style={{ fontFamily: font, color: NAVY }}
        >
          Privacy Policy
        </h1>
        <p className="mb-10 text-sm" style={{ color: NAVY }}>
          Last updated: 30 June 2026
        </p>

        <div className="space-y-8" style={{ color: NAVY, lineHeight: 1.7 }}>
          <section>
            <p>
              This privacy policy explains how haaylo.com ("we", "us")
              handles personal data when you use the Inbound Engine and Social
              Scheduler app at{" "}
              <a className="underline" style={{ color: PURPLE }} href="https://appcontentcollectiv.lovable.app">
                appcontentcollectiv.lovable.app
              </a>
              . The haaylo.com marketing site at{" "}
              <a className="underline" style={{ color: PURPLE }} href="https://contentcollectiv.co.uk">
                contentcollectiv.co.uk
              </a>{" "}
              is covered by its own policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl mb-3 font-semibold" style={{ fontFamily: font, color: NAVY }}>
              1. Who we are
            </h2>
            <p>
              haaylo.com is operated from the United Kingdom. For any
              privacy question, account deletion request, or data export, email{" "}
              <a className="underline" style={{ color: PURPLE }} href="mailto:hello@contentcollectiv.co.uk">
                hello@contentcollectiv.co.uk
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl mb-3 font-semibold" style={{ fontFamily: font, color: NAVY }}>
              2. What we collect
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong style={{ color: INDIGO }}>Account data:</strong> email address and an encrypted
                password (or an anonymous session ID until you upgrade).
              </li>
              <li>
                <strong style={{ color: INDIGO }}>Engine content:</strong> brand-voice answers, strategy
                briefs, generated posts and funnel copy you create in the app.
              </li>
              <li>
                <strong style={{ color: INDIGO }}>Connected social accounts:</strong> when you connect
                LinkedIn, Facebook Pages or Instagram Business, we receive your
                profile/page name, profile picture URL, page IDs and an OAuth
                access token. Tokens are encrypted at rest (AES-GCM) and only
                used to publish the content you schedule.
              </li>
              <li>
                <strong style={{ color: INDIGO }}>Scheduled posts & media:</strong> the captions, images
                and videos you upload to the Scheduler, plus the times and
                channels you've chosen.
              </li>
              <li>
                <strong style={{ color: INDIGO }}>Billing:</strong> Stripe customer ID and subscription
                status. We do not store card numbers — Stripe does.
              </li>
              <li>
                <strong style={{ color: INDIGO }}>Technical logs:</strong> standard server logs (IP,
                timestamp, request path) for security and debugging, kept for
                up to 30 days.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl mb-3 font-semibold" style={{ fontFamily: font, color: NAVY }}>
              3. How we use it
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To run the Inbound Engine (generate brand voice, strategy and post drafts).</li>
              <li>To publish posts to the social accounts you've connected, at the times you schedule.</li>
              <li>To process payments via Stripe.</li>
              <li>To keep the service secure and prevent abuse.</li>
            </ul>
            <p className="mt-3">
              We do not sell your data, and we do not use your content or
              connected-account data to train third-party AI models. AI
              generations are sent to the Lovable AI Gateway (Google Gemini)
              solely to produce the output you asked for.
            </p>
          </section>

          <section>
            <h2 className="text-2xl mb-3 font-semibold" style={{ fontFamily: font, color: NAVY }}>
              4. Sub-processors
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong style={{ color: INDIGO }}>Supabase</strong> — database, authentication, file storage (EU region).</li>
              <li><strong style={{ color: INDIGO }}>Cloudflare</strong> — application hosting and edge runtime.</li>
              <li><strong style={{ color: INDIGO }}>Stripe</strong> — payments.</li>
              <li><strong style={{ color: INDIGO }}>Lovable AI Gateway / Google Gemini</strong> — AI generation.</li>
              <li><strong style={{ color: INDIGO }}>LinkedIn, Meta (Facebook & Instagram)</strong> — only when you connect those accounts, and only to publish content you schedule.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl mb-3 font-semibold" style={{ fontFamily: font, color: NAVY }}>
              5. LinkedIn, Facebook & Instagram permissions
            </h2>
            <p>
              When you connect a social account we request the minimum
              permissions needed to publish on your behalf (for example
              <code style={{ color: PURPLE }}> w_member_social</code> for
              LinkedIn, and <code style={{ color: PURPLE }}>pages_manage_posts</code> /
              <code style={{ color: PURPLE }}> instagram_content_publish</code> for Meta).
              You can disconnect any account at any time from the Scheduler →
              Connections tab; doing so deletes the stored access token.
            </p>
          </section>

          <section>
            <h2 className="text-2xl mb-3 font-semibold" style={{ fontFamily: font, color: NAVY }}>
              6. Retention & deletion
            </h2>
            <p>
              Your content and connections are kept for as long as your account
              is active. Email <a className="underline" style={{ color: PURPLE }} href="mailto:hello@contentcollectiv.co.uk">hello@contentcollectiv.co.uk</a>{" "}
              to delete your account; we'll erase your profile, generated
              content, scheduled posts and OAuth tokens within 30 days. Billing
              records are retained for the period required by UK tax law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl mb-3 font-semibold" style={{ fontFamily: font, color: NAVY }}>
              7. Your rights (UK / EU GDPR)
            </h2>
            <p>
              You have the right to access, correct, export or delete your
              personal data, and to object to or restrict processing. To
              exercise any of these rights, email us at the address above. You
              also have the right to complain to the UK Information
              Commissioner's Office (ico.org.uk).
            </p>
          </section>

          <section>
            <h2 className="text-2xl mb-3 font-semibold" style={{ fontFamily: font, color: NAVY }}>
              8. Changes
            </h2>
            <p>
              If we materially change this policy we'll update the date at the
              top and, for significant changes, notify you by email.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

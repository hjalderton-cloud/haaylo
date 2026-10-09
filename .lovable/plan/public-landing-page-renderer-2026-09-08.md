# Public Landing Page Renderer

A hosted, fully branded public page at `haaylo.com/p/<page-name>` that reads everything from your account: brand look from Brand DNA, words from the campaign, layout from the page builder. Plus a matching guide page people land on after they sign up, and a small "Powered by Haaylo" badge at the bottom.

The public page at `/p/...` already exists with a headline, sub-headline, logo, brand colour and a sign-up form. This work extends it rather than replacing it, so live links keep working.

## What changes for you

- **Branding is automatic.** The page uses your Brand DNA: main colour, a new second colour, your chosen font and your logo. Body text colour is worked out automatically so it always reads clearly on light or dark sections.
- **Campaign words flow through.** A page can be linked to a campaign; its headline and sub-heading come from that campaign and stay in step with it.
- **Sign-ups go where they already go.** New sign-ups keep landing in your Lead Tracker, now tagged with the campaign, the page they came from and a status of "new".
- **After sign-up they get the guide.** Instead of a plain thank-you, people are sent to a public guide page for that campaign showing the lead magnet you generated. If no guide has been generated yet, they see the thank-you message instead, so nothing ever dead-ends.
- **30-day campaigns change shape by phase.** Days 1–10 show a stripped-back waitlist page ("Join the waitlist", email only). Days 16–25 show the full sales page with a "Get access now" button in place of the form. Phase is worked out from the campaign start date, and you can override it by hand on the campaign hub.
- **Badge at the bottom.** "Powered by Haaylo — Build your own 90-day content and landing pages here", linking to haaylo.com. Small, quiet, with a switch in the page builder to turn it off.
- **Never looks broken.** Grey placeholder blocks while it loads, wrapping layouts so long or short headlines never overlap, one column under 640px, and no sidebar or account links on public pages.

## Sections in order

1. Logo (or business name if no logo)
2. Headline and sub-heading
3. Optional body copy
4. Sign-up form — first name and email always, extra fields as chosen in the builder, button label from the builder (default "Send it to me")
5. Footer badge

If something goes wrong on submit, an inline "Something went wrong — please try again" appears and nothing typed is lost.

## Technical notes

Database changes are additive only; nothing existing is dropped or renamed.

- `campaigns`: add `landing_page_headline`, `landing_page_subheadline` (text, nullable), `current_phase` (int, default 1), `phase_override` (boolean, default false), `phase_started_at` (timestamptz, nullable — falls back to `created_at`), `lead_magnet_content` (jsonb, nullable) for the guide page.
- `landing_pages`: add `campaign_id` (uuid, nullable, FK to campaigns).
- `landing_page_leads`: add `campaign_id` (uuid, nullable), `source_slug` (text, nullable), `status` (text, default `'new'`). `created_at` serves as captured_at.
- Brand: extend the Brand DNA JSON (`business_brains.data.brand`) with `secondary_color` and `font_preference`; surface both in the Brand DNA screen. No new profile table — brand values are read server-side through the existing public landing fetch.
- Renderer: `src/routes/p.$slug.tsx` rewritten to inject `--color-primary`, `--color-secondary`, `--font-family` and an auto-contrast `--color-text` on the page root; font preference maps to the existing `FONT_STACKS`, extended with the new options.
- `getPublicLandingPage` extended to return brand variables, linked campaign fields, resolved phase and badge setting in one call; still admin-side, live-only, returning null → 404 for any other status.
- `submitLandingLead` extended to write `campaign_id`, `source_slug`, `status`, and to return the campaign id so the client can redirect to `/guide/$campaignId`.
- New public route `src/routes/guide.$campaignId.tsx` with its own head metadata, rendering `campaigns.lead_magnet_content` with the same brand variables; falls back to a branded "your guide is on its way" page when empty.
- Phase resolution: helper computes phase from `phase_started_at`/`created_at` for `campaign_duration = '30-day'`; `phase_override = true` pins `current_phase`. Campaign hub gets a phase selector writing both fields.
- Landing page builder gains: campaign link picker, badge on/off toggle.
- Regenerate Supabase types after the migration.

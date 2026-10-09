# Lead Funnel: campaign-driven magnet with matching page and guide

Rework `/funnel` so the lead magnet is built from the campaign you're working on, wearing the brand design saved in Brand DNA — and so the page and the guide always look like the same thing.

## What changes on the page

**Campaign picker at the top.** A dropdown listing the selected client's campaigns, newest first, plus "New Campaign". The picker drives everything below it. Switching campaign clears the current preview and reloads that campaign's own theme, problem and offer, so nothing bleeds across campaigns or clients. If the client has no campaigns yet, the funnel still works from Brand DNA alone and simply saves nothing back.

**Brief filled from two places, not from mock text.**
- Design (colours, secondary, accent, font, logo) comes only from Brand DNA for the selected client.
- Wording (theme, problem, offer, headline, sub-headline) comes only from the chosen campaign record.
- Any leftover placeholder copy in the funnel inputs is removed.

**One button, both previews.** "Generate magnet" writes the landing copy and the guide in a single pass, then applies the same brand tokens to both. The landing preview and the ebook preview sit side by side and update together, sharing colours, heading font, body font, button shape and type weights.

**Saving back to the campaign.** After generating, the copy is written to the campaign: headline and sub-headline, guide title, intro and sections, and the structured lead magnet content. If that campaign already has copy, a short confirm appears before it is replaced.

**Build the page.** The landing page created from the funnel is linked to the campaign, so a visitor who signs up on `/p/your-slug` is sent straight to `/guide/that-campaign`.

## Technical notes

- New `getCampaignFunnelContext` server function: returns the campaign row (title, theme, duration, headline, subheadline, guide fields, `lead_magnet_content`) plus resolved Brand DNA tokens from `business_brains.data.brand` with `brand_brain` only as fallback. Workspace-scoped through `owns_project`/RLS as today.
- `generateMagnetKit` gains an optional `campaignId`. When present it grounds the prompt in the campaign theme/problem/offer instead of only the Strategy Profile, and returns the same `MagnetConfig` shape.
- Extend `MagnetConfig.brand` in `src/lib/magnet-schema.ts` with `accent_color`, `font`, `radius`. `LandingPreview.tsx` and `EbookPreview.tsx` read these from one shared token object so the two previews cannot drift; token resolution lives in a small `magnet-tokens.ts` helper reused by the public `/p/$slug` renderer's font map.
- Ebook preview fields map structurally onto `campaigns.lead_magnet_content` (`{ title, subtitle, author_line, cover_image_url, pages[] }`), so what you see is what is stored.
- New `saveMagnetToCampaign` server function (authenticated, project-scoped) writes `landing_page_headline`, `landing_page_subheadline`, `guide_title`, `guide_intro`, `guide_sections`, `lead_magnet_content`, and marks the relevant `asset_status` entries ready.
- `createLandingPageFromMagnet` takes `campaignId` and sets `landing_pages.campaign_id`; `submitLandingLead` already returns `campaignId` from the page row, so the `/guide/${campaignId}` redirect starts working once the link exists.
- No schema changes needed — `campaigns.lead_magnet_content`, `guide_*` and `landing_pages.campaign_id` all exist.

## Files

- `src/routes/_authenticated/funnel.tsx` — campaign picker, context wiring, confirm-before-overwrite
- `src/components/magnet/MagnetEngine.tsx` — campaign-aware brief, dual preview, save-back, build page
- `src/components/magnet/LandingPreview.tsx`, `EbookPreview.tsx` — shared design tokens
- `src/lib/magnet-schema.ts`, new `src/lib/magnet-tokens.ts`
- `src/lib/magnet.functions.ts` — campaign context, campaign-grounded generation, save-back
- `src/lib/landing.functions.ts` — campaign link on creation

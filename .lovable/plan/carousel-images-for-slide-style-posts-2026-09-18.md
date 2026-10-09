# Carousel images for slide-style posts

When a repurposed post is written as a slide script ("Slide 1 — …", "Slide 2 — …"), Generate image should produce a full on-brand carousel — one image per slide, with the slide wording printed on it — rather than a single picture.

## What you'll see

On any post whose wording contains slide or page markers, the image box offers **Generate carousel** alongside the existing Generate image and Upload image.

Pressing it:

1. Reads the post, splits it into its slides (one image per slide found in the copy, up to 10) and keeps each slide's heading and line of copy.
2. Builds each slide on your brand colours, with your brand name and the slide wording set in a clean, readable layout — slide 1 styled as the opener, the rest as follow-ons, and a closing slide gets a call to action if the copy has one.
3. Shows progress slide by slide ("Slide 3 of 6…").

When it finishes:

- **Slide 1 becomes the post image**, exactly as a single generated image does today.
- **The remaining slides appear in a strip underneath**, numbered Page 1, Page 2 and so on.
- Each slide in the strip has **Edit in studio**, which opens the design studio with that slide loaded so you can move text, change colours or swap the background, then save it back over that slide.
- Slides can be removed individually, and **Regenerate** rebuilds the whole set.

The set is saved against the post straight away, so it survives a refresh, and existing posts with a single image are unaffected.

## Also fixed: image generation failing with a 400

Generate image currently fails on this workspace with "Unknown parameter: 'response_format'". The post-image generator prefers a directly configured OpenAI key and sends a parameter that key's account no longer accepts. It will be changed to use the built-in Lovable AI image model for every post image, dropping that rejected parameter, so Generate image works again for single images and carousels alike.

## Technical detail

**Storage.** No schema change. `content_posts.media_url` / `media_path` keep holding slide 1. The full set is stored on the existing `content_posts.meta` jsonb under a `carousel` key: `{ slides: [{ index, path, url, heading, body }], created_at }`. `setPostImage` in `src/lib/content.functions.ts` gains an optional `meta` patch so the strip persists with the image. Anything that reads `media_url` today (calendar, scheduler, Zernio publishing, the campaign asset grid) is unchanged and simply keeps posting slide 1.

**Slide parsing.** A shared helper `parseSlides(text)` in a new `src/lib/carousel.ts` recognises `Slide N —/-/:`, `Page N`, and numbered `1.` openers, returning `{ heading, body }` per slide; used by both the server function and the client to decide whether to show the Generate carousel button.

**Server.** New `generatePostCarousel` in `src/lib/image.functions.ts`: auth + workspace-scoped, reads the Brand DNA (name, colours, tone) as `generatePostGraphic` does, then for each slide calls the Lovable AI Gateway image endpoint with a prompt that requests a 1:1 social slide carrying that slide's heading and body text in the brand palette, consistent layout across slides, slide number shown small. Each result is uploaded to `scheduler-media` under `{user}/carousel/{uuid}.png` and signed for a year. Slides are generated sequentially with per-slide failures reported rather than losing the whole set.

**Gateway fix.** `generatePostGraphic` drops the `OPENAI_API_KEY` branch (and its `response_format`/`dall-e-3` body) and always calls `https://ai.gateway.lovable.dev/v1/images/generations` with the gateway image model, matching `generateBrandImage` and `refinePostGraphic`, which already work.

**Client.** `src/components/content/PostImageZone.tsx` gains carousel state: the extra button when slides are detected, per-slide progress, the numbered strip with Remove and Edit in studio, and Regenerate. Edit in studio reuses the existing `GraphicStudio` component in a modal (it already supports a background image, brand colours, logo and multi-page export) and saves the exported PNG back over that slide via the existing `saveStudioDesign`, updating the strip and, for slide 1, the post image.

**Checks before done:** typecheck passes; one real carousel generated end to end through the running app for a slide-script post, confirming slide 1 lands on the post and the strip persists after a refresh; single-image Generate image confirmed working again after the gateway fix.

---

# Grouping the Content Bank and tidying the campaigns page

## Content Bank

Posts currently sit in one long list. They will be grouped into collapsible sections instead:

- When a campaign is selected, posts group by **phase** — "Phase 1", "Phase 2", and "No phase" for anything unassigned.
- When **All campaigns** is selected, the top level groups by **campaign** (with "No campaign" last), and each campaign's posts group by phase inside it.
- Each section header shows its name and a count, and opens or closes on click. The first section starts open, the rest closed, and the open/closed state is remembered per workspace between visits.
- The filters (pillar, platform, status, search) work exactly as they do now and apply inside the groups; empty groups are hidden.
- Card layout, actions and the image box are unchanged.

Detail: phase comes from the existing `meta.phase` number on `content_posts`; grouping is presentation-only inside `src/routes/_authenticated/bank.tsx`, with no query or schema change.

## Campaigns page

The campaign list becomes easier to scan:

- Each campaign shows its name, duration and status on one line, with the "Built by Haaylo" marker kept, and a compact row of counts underneath — posts, emails, landing page, guide, blog — so the state of the work is visible without opening it.
- Campaigns group under **Active** and **Past**, each collapsible, newest first.
- Wording, links and the wizard are untouched.

Detail: changes stay in `src/routes/_authenticated/campaign.index.tsx` and `CampaignSwitcher.tsx`, reading counts from the existing campaign asset fields already loaded for the list.

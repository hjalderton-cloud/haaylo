# Context-aware image prompting

Right now, when you press "Generate image" on a post, the app writes a short visual idea from the caption and adds a light brand note. Audience, tone and your exact brand colours are not reliably used, so the pictures drift off-brand. This changes the recipe behind every image.

## What changes for you

- Every image is built from three inputs at once: the post itself, your Strategy Profile (who you're talking to and how you sound), and your Brand Assets (your exact colours).
- The picture style is pinned to a premium look: clean, modern, real lighting, shallow depth of field, workspace or macro framing. Cheesy stock clichés, cartoon over-saturation, floating garbled text and generic laptop-screen shots are explicitly ruled out.
- Your primary and secondary colours drive the lighting, background wash and any graphic accents.
- While an image is being made, the post image card shows a branded overlay spinner in place of the current plain bar, and the finished picture appears on the card the moment it's ready.
- The new picture is saved against that post straight away, on both the Content Bank cards and the post editor. Design Studio's generate and refine actions use the same recipe.

## How it works

**Prompt builder (new shared helper in `src/lib/image.functions.ts`)**

A single `buildContextPrompt` used by `generatePostGraphic`, `generateBrandImage` and `refinePostGraphic`:

1. Post theme — caption and title summarised into one visual concept via the existing chat model step (kept, with the summariser told to name the concrete subject/theme rather than restating the words).
2. Strategy Profile — from `business_brains.data`: `audience.ideal_customer`, `audience.pain_points`, `brand.tone_of_voice`, `business.industry`, `business.name`.
3. Brand colours — `brand.primary_color` / `secondary_color` / `accent_color`, falling back to parsing hexes out of the free-text `brand.colors`. Hex values are injected literally into the prompt as the dominant lighting and background accent tones. No colours found means the guardrail text is skipped rather than inventing colours.
4. Fixed quality block appended: composition and lighting rules, colour-dominance rule with the hex variables, and an explicit "strictly avoid" list. Existing rules stay (no rendered text or logos, platform aspect ratio, space left for copy).

**Frontend (`src/components/content/PostImageZone.tsx`)**

- Replace the current busy state with an overlay: the card keeps its size (and shows the existing image dimmed when regenerating), with a centred spinner in the Haaylo pink and a short status line. Upload keeps its 0–100% progress.
- On success the card swaps to the new image instantly and `setPostImage` persists `media_url` / `media_path` to `content_posts` — unchanged behaviour, just now also from the overlay path.
- `PostImageZone` passes the post's platform through so the aspect ratio matches (Instagram square, LinkedIn/Facebook landscape) — already wired, kept.

**Design Studio (`src/routes/_authenticated/image.tsx`)**

No UI restructure; it calls the same server functions, so it inherits the new prompt pipeline. The existing brand-colour toggle continues to control whether the colour guardrails are applied.

Notes: images continue to use the current Lovable AI image model and the private `scheduler-media` bucket with signed URLs. Post records stay on `content_posts` (`media_url` / `media_path`), the fields the rest of the app already reads.

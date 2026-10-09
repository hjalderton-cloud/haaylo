# Brand DNA screen (Strategy pillar)

Rebuild `/brain/setup` as a single scrollable Brand DNA page with four collapsible sections, a completion bar, tag inputs, tone pills, auto-save on blur and a fixed save bar. It keeps saving into the existing per-workspace brand store, so every campaign, magnet and post generator picks the changes up with no rewiring.

## Page structure

Completion bar at the top: percentage of filled required fields (Sections 1 and 2), with a short "x of y done" label.

Section 1 — Business Foundation (required)

- Business name, website URL
- Founder story (textarea, 3+ lines)
- Company vision (textarea)
- Core values (tag input, max 5)
- Product and Services
- USP 
- Mission
- Business Goals 
- competitors
-  CTAs and offers,

Section 2 — Target Audience (required)

- Primary audience description (textarea)
- Market niche (text)
- Industry descriptors (tag input, max 5)
- objections, buying triggers

Section 3 — Proof & Authority (optional)

- Testimonials: repeatable name + quote rows, up to 5
- Case study results (textarea)
- Notable clients or press (tag input)

Section 4 — Brand Voice

- Tone of voice: pills, pick up to 3 (Authoritative, Conversational, Inspirational, Bold, Witty, Educational, Warm, Direct)
- Words to always use (tag input)
- Words to never use (tag input)

Section 5 — Advanced (collapsed by default)
Everything the current three-step setup covers that the four sections above don't: location, years trading,   keywords, channels, budget, post length, CTA style, emoji preference, formality, platforms, language/timezone/country. Nothing is lost.

Upload marketing strategy: a document upload sits at the top of the page, reusing the existing upload-and-extract flow. Uploaded documents are read by AI and suggested values are shown for review before they fill any field.

Save: fixed bar at the bottom with "Save Strategy Profile", plus quiet auto-save when a field loses focus and its value changed. Small "Saved" confirmation, and a clear message if a save fails.

Colour, primary font and logo stay where they are today (Brand Assets), as agreed.

## Storage

Brand DNA stays per workspace, so Haaylo and Paymentsave keep separate brand foundations. No new table and no migration.

Technical notes:

- Values are stored on `business_brains.data` (jsonb) through the existing `getBrain` / `saveBrain` server functions in `src/lib/brain.functions.ts`.
- `src/lib/brain-schema.ts` gains typed fields for the new structured values: `core_values: string[]`, `industry_descriptors: string[]`, `notable_clients: string[]`, `tone_of_voice: string[]`, `words_always_use: string[]`, `words_never_use: string[]`, `testimonials: {name, quote}[]`, plus `vision`, `market_niche`, `founder_story`, `target_audience`, `case_study_results`.
- Existing free-text equivalents (`brand.values`, `brand.tone_of_voice`, `proof.testimonials`, `founder.origin_story`, `audience.ideal_customer`, `founder.banned_words`) are read as a fallback when the new fields are empty, and both are kept in sync on save, so current generators that read the old keys keep working unchanged.
- Section 5 renders the remaining `BRAIN_SECTIONS` fields not surfaced above.
- The three-step wizard in `src/routes/_authenticated/brain.setup.tsx` is replaced; the connect-channels step moves to a link to the existing `/connect` page. `ChannelConnect` stays in place and unchanged.
- New components: `BrandDnaSection`, `TagInput`, `TonePills`, `TestimonialList` under `src/components/brand-dna/`.
- Completion is computed client-side from the required fields only.

## Out of scope

No changes to campaign generation logic, the `campaigns` flow, or any other page. Routing and labelling elsewhere stay as they are.
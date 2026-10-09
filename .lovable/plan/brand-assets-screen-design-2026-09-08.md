# Brand Assets screen (Design)

Turn the "Brand Assets" placeholder into the real screen: one home for the logo, the three brand colours, the font choice, and a library of reusable images — all tied to the workspace currently selected, and all automatically picked up by the landing page builder, the guide/lead magnet and the image generator.

## What the user gets

Page at Design > Brand Assets, in the Haaylo navy/pink styling, with four sections:

1. **Logo** — upload a PNG or SVG (max 5MB), shown side by side on a white and a dark panel so contrast problems are obvious. "Remove logo" clears it.
2. **Brand colours** — primary, secondary and accent, each with a colour picker and a HEX box that accepts typed values. A palette strip underneath shows all three together plus a sample button and heading using them.
3. **Typography** — dropdown with Modern Sans (Inter), Classic Serif (Merriweather), Bold Display (Montserrat), Clean Minimal (DM Sans). A live preview renders a heading, subheading and body paragraph in the chosen font.
4. **Asset library** — drag-and-drop or click to upload PNG, JPG, SVG, WebP up to 10MB each. Thumbnails in a grid, each with filename, upload date, "Copy URL" and "Delete".

Everything saves on change (colours debounced while typing), with a "Saved" tick appearing top-right for two seconds. Switching workspace reloads that workspace's assets.

## Where the data lives

There is no `strategy_profile` table in this project — the Strategy Profile is already stored per workspace in `business_brains.data.brand`, and the logo already lives in `brain_assets` with kind `logo`. The landing page renderer, guide and image generator all read from those two places today, so the screen writes there rather than introducing a parallel store that nothing reads.

- `primary_color`, `secondary_color`, `font_preference` — existing fields on `business_brains.data.brand`.
- `accent_color` — new key in that same JSON (no migration needed).
- Logo and library images — `brain_assets` rows (kinds `logo` and `image`) with files in the existing private `scheduler-media` bucket, served through signed URLs, matching how the logo already reaches public pages.

## Technical notes

- New `src/routes/_authenticated/brand-assets.tsx` replacing the ComingSoon placeholder; keeps its head metadata.
- Reuse `createBrainAssetUploadUrl` / `registerBrainAsset` / `listBrainAssets` / `deleteBrainAsset` from `src/lib/brain-assets.functions.ts`; extend the size/type checks client-side (5MB logo, 10MB library, SVG allowed).
- Reuse `getBrain` / `updateBrain` for the colour and font fields; add `accent_color` to `BrainData['brand']` in `src/lib/brain-schema.ts` and to the Brand DNA field list so the two screens stay in sync.
- Extend `mapFont` and the brand resolver in `src/lib/landing.functions.ts` to understand the four dropdown values and pass `accent_color` through, so public pages honour the choices.
- Ensure the chosen fonts are loaded via a `<link>` in `src/routes/__root.tsx` (Merriweather, Montserrat, DM Sans as needed).
- "Copy URL" copies a signed link, which expires; the UI will say the link is temporary and best used for previews.

## Out of scope

No change to how campaigns, posts or landing pages are generated beyond reading the new accent colour and font values.

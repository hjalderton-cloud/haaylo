# Caption Variator

A new tool under Content > Content Hub that takes one master caption and rewrites it for LinkedIn, Instagram and Facebook in a single click, in your own brand voice.

## What you'll see

New page at `/caption-variator`, reached from a fifth card on the Content Hub ("Caption Variator — write once, get a version for every platform") and from the Content sidebar group is unchanged.

Heading: "Caption Variator". Subheading: "Write once. Get versions for every platform instantly."

Input:
- Large auto-growing textarea, minimum height 120px, placeholder "Paste your master caption here".
- Source platform pills (optional, single choice): LinkedIn | Instagram | Facebook | None. The matching result card gets an "Original" tag.
- Target platform checkboxes, all ticked by default, each with its short style note (LinkedIn: professional, slightly longer, no hashtags in body; Instagram: hook-heavy opening, conversational, hashtags at the end; Facebook: warm, community-focused, slightly shorter).
- Full-width filled button: "Vary this caption". Disabled until there's a caption and at least one platform ticked.

Output:
- One card per selected platform, side by side on desktop, stacked on mobile, in the existing dark card style.
- Each card: platform icon and name, the full rewritten caption, character count, and two buttons — "Copy" and "Save to Content Bank" (saves as a Draft for that platform, with a confirmation and a link to the bank).
- "Regenerate all" link below the cards re-runs every selected platform with fresh wording.
- While generating, each card shows a loading state; if one platform fails the others still show, with a plain retry on the failed card.

Brand voice comes from the workspace's Brand DNA (tone of voice, signature phrases, what you do and don't say), so the rewrites sound like you rather than generic. If Brand DNA is empty, a short line points to the Brand DNA screen and generation still works.

## Technical notes

- New server function file `src/lib/caption-variator.functions.ts` with `varyCaption`, authenticated via `requireSupabaseAuth`, validated with Zod (caption max 3000 chars, source platform optional, targets from a fixed list).
- Brand voice is loaded server-side from the active workspace's `business_brains.data` (tone_of_voice, signature phrases, sample posts) exactly as `magnet.functions.ts` does; the workspace is resolved from the passed project id, matching existing tools.
- Generation uses the existing Lovable AI chat gateway pattern already used across `competitors.functions.ts` and `campaign-generate.functions.ts`: one call returning strict JSON keyed by platform, parsed defensively, with the same friendly error mapping (credits/rate limit) used elsewhere.
- Saving reuses `saveContentPost` from `src/lib/content.functions.ts` with status `draft`, the chosen platform, and the caption body — nothing new in the database, no migration.
- New route file `src/routes/_authenticated/caption-variator.tsx` with its own page title and description meta, following the existing AppShell/CARD styling; a card is added to `TOOLS` in `src/routes/_authenticated/tools.tsx`.

## Note on the data source

The request mentions a `strategy_profile` table for brand voice. This project keeps the Strategy Profile / Brand DNA in `business_brains.data` (with brand colours in `brand_brain`); there is no `strategy_profile` table. The plan reads from the existing store so the tool matches the rest of the app.

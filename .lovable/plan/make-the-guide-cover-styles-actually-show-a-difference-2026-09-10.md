# Make the guide cover styles actually show a difference

The three style cards do register your click — the chosen card highlights, and the guide's front cover is rebuilt in that style. The problem is you can't see it happen:

- The guide sits below the landing page preview, so the cover that changed is off-screen when you click.
- Only the front cover changes. Every inside page is laid out identically for all three styles, so scrolling down looks the same whichever you pick.
- The choice is forgotten. Leave the page and come back and it silently returns to The Minimalist Executive, even if you exported the PDF as The Bold Creator.

## What changes

1. **A live cover thumbnail beside the choices.** Each of the three cards shows a small live version of your own guide cover in that style, so the difference is visible before anything is scrolled. The selected card also gets a clear "Selected" mark.

2. **Clicking a style jumps you to the guide.** Choosing a style scrolls the guide preview into view so you see the full-size result immediately.

3. **The style carries through the whole guide, not just the cover.** Inside pages pick up the chosen look:
   - Minimalist Executive: light cream pages, serif headings, centred page numbers, hairline rules.
   - Bold Creator: brand-colour heading bands, heavy uppercase headings, solid colour callout blocks.
   - Tech Modernist: dark slate headers with a coloured rule, mono-style page numbers, bordered callouts.
   Body text stays clean and readable in all three; the exported PDF uses the same styling it shows on screen.

4. **The choice is remembered** per workspace and per campaign (and for a standalone freebie), so reopening the funnel shows the style you last picked.

The landing page preview is unaffected — it keeps following your brand colours and type as it does now.

## Technical notes

- `src/components/magnet/EbookPreview.tsx`: thread `template` through the interior page renderer, with a per-template style map (page background, header treatment, heading font/weight/case, callout style, footer). Export a small `CoverThumb` that renders the existing `Cover` scaled down (`transform: scale`, fixed frame) for the picker.
- `src/components/magnet/MagnetEngine.tsx`: render `CoverThumb` inside each `COVER_OPTIONS` button using `shownConfig` (fall back to the plain card while no config exists); add a ref on the guide preview block and `scrollIntoView({ behavior: "smooth", block: "start" })` on selection; initialise `cover` from `localStorage` key `haaylo-magnet-cover:${scopeKey}` and write on change.
- Hidden export node already renders `EbookPreview` with the same `template`, so the PDF follows automatically.

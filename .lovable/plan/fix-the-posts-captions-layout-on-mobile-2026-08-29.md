# Fix the Posts & Captions layout on mobile

On a phone the topic cards run off the right edge: headlines get cut mid-sentence, the format dropdown and the pink Write button are clipped, and the whole panel scrolls sideways.

## What's causing it

Two things, both in the Engine page (`public/engine/index.html`):

1. **The format dropdown sets the card's minimum width.** Each card holds a `<select>` with long labels ("LinkedIn carousel · 6–8 slides", "Instagram caption · 40–70 words"). A grid item's default minimum size is its content's natural width, so the select's full label width forces the card — and the grid track — wider than the phone screen, even though the mobile rule already sets a single column. `width:100%` on the select does not override that.
2. **No text-size-adjust rule.** iOS Safari inflates text inside an iframe when it thinks a block is wider than the viewport, which enlarges the topic text further and makes the overflow worse.

## The fix

- Add `min-width: 0` and `max-width: 100%` to `.sugg-card` and its children so cards can shrink to the column width instead of the dropdown's natural width.
- Constrain the format `<select>` inside the card: `max-width: 100%`, `box-sizing: border-box`, and truncate its rendered label rather than letting it expand the card.
- Add `overflow-wrap: anywhere` to `.sugg-card-topic` so long headlines and URLs wrap instead of pushing sideways.
- Set `-webkit-text-size-adjust: 100%` on `html` in the Engine document so iOS stops inflating the text.
- Let the Write button wrap normally on narrow screens instead of `white-space: nowrap`.

## Technical notes

All changes sit in the stylesheet and the inline styles of `CardWriter` in `public/engine/index.html` — presentation only, no change to generation, saving or scheduling behaviour. I'll verify at 390px width with a browser check before confirming.

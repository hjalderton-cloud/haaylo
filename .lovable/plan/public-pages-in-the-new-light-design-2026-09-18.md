# Public pages in the new light design

Bring the public side of Haaylo into the same calm light look as the signed-in app,
taking layout cues from marqeable.com: lots of white space, a strong dark headline,
a small eyebrow label, two clear buttons, and a large product panel beside the words.

## What changes

**Homepage (haaylo.com)**
- Off-white background (#FAFAFC) instead of the dark purple-black, with pale surface
  bands (#F6F7FA) to separate sections.
- Headline in deep navy (#171D41), large and tight, so titles stand out on the page.
  One short accent phrase in pink for emphasis, as on the reference site.
- Eyebrow label above the headline ("AGENTIC MARKETING PLATFORM" style — for Haaylo:
  "Your marketing team, built in"), with a small pink dot.
- Two buttons: solid purple "Start free" and a white outlined "See how it works".
- A framed product panel to the right of the hero showing the Briefing Room, in the
  same rounded white card the reference uses.
- How it works, features, FAQ and footer restyled as white cards on pale grey,
  12–16px corners, flat, no gradients or glow.
- Poppins throughout, replacing Space Grotesk and Archivo Black.

**Pricing** — same light treatment, navy headings, white plan cards, purple primary
button on the recommended plan, pink used only as an accent.

**Waitlist** — light background, navy headline, single white form card.

**Sign in / reset password** — light card on off-white, navy headings, purple button.

**Privacy and terms** — light background, navy headings, comfortable reading width.

Site header and footer get one consistent light treatment across all of these, with
the pink monogram plus navy wordmark.

## What does not change

- Wording stays as it is, apart from the short hero eyebrow line. No new claims,
  prices or features.
- Customer-facing lead pages (`/p/...`) and downloadable guides keep their own
  cover styles — those follow each client's brand, not Haaylo's.
- Email templates, the signed-in app and the Engine screens are untouched.
- No functionality, routing, schema or pricing logic changes.

## Technical notes

- Files: `src/routes/index.tsx`, `pricing.tsx`, `waitlist.tsx`, `auth.tsx`,
  `reset-password.tsx`, `privacy.tsx`, `terms.tsx`.
- Palette comes from the existing `src/lib/theme.ts` (BG #FAFAFC, SURFACE #F6F7FA,
  NAVY #171D41, INDIGO #2D2964, PURPLE #553EA2, PINK #E54683, GREY #CECDD4,
  LINE #E6E6EC) so public and signed-in sides can never drift apart.
- Poppins is already loaded in the root route; the Space Grotesk / Archivo Black
  font links on these pages get removed.
- The `theme-color` meta in `__root.tsx` moves from navy to #FAFAFC once the public
  pages are light.
- Existing structured data, canonical links and meta descriptions are kept exactly
  as they are.
- Hero product panel uses a screenshot of the Briefing Room captured from the running
  app and stored in `src/assets`.

## Checks before I call it done

- Typecheck passes.
- Screenshots of each public page at desktop and mobile widths, checking headline
  contrast and that nothing dark is left behind.
- Sign in, start free and pricing links all still go where they did.

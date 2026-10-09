# Auto-Link Injector

One-click way to drop your live landing page link onto the bottom of any post.

## What you'll see

**On every post card in the Content Bank**
- A new "Inject link" button next to Edit and Schedule.
- One live page: the link is appended to that post's body straight away and a confirmation appears — "Link added — haaylo.com/p/your-slug". The card body preview updates immediately.
- More than one live page: a small dropdown opens under the button listing each live page (title + its haaylo.com/p/ address). Picking one appends it.
- No live pages: a short inline note — "You don't have a live landing page yet." with "Build one now →" going to Landing Pages.

**Inside the post editor** (the Edit box in Content Bank, and the editor drawer on Schedule & Publish)
- The same "Inject link" step. The body text box updates in real time so you can see and adjust the link before saving.

**Saving**
- Nothing saves automatically. On a card, the injected link is held as an unsaved change with a visible "Save" (and "Discard") action on that card. In the editor you save with the existing Save or Schedule buttons.
- The link is always added on a new line at the very end of the body, and the same link is never added twice to one post.

## Technical notes

- Live pages come from the existing `listLandingPages` server function, filtered to `status === "live"` and scoped to the selected workspace (the same project scoping the rest of the Content Bank uses). Loaded once per page via TanStack Query and shared by all cards.
- New shared piece `src/components/content/LinkInjector.tsx`: renders the button, the dropdown, the empty-state prompt, and returns the chosen absolute URL (`https://haaylo.com/p/<slug>`, matching the value already used in `schedule.functions.ts`). A small helper `appendLink(body, url)` handles the newline prefix and duplicate check.
- `src/routes/_authenticated/bank.tsx`: add the button to each card's action row, hold per-card pending caption edits in local state, show unsaved/save/discard affordances, and reuse the existing `saveContentPost` call on save. Add the same injector step to the card's Edit modal form.
- `src/routes/_authenticated/calendar.tsx`: replace the current single-page "Inject landing page link" button with the shared injector so multiple live pages are selectable; existing Save / Schedule & queue behaviour is untouched.
- No database or schema changes.

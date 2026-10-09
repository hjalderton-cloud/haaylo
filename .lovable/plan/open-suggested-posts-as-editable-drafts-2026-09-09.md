# Open suggested posts as editable drafts

Two things to fix on the Content Tools screen.

## 1. Feed it your real 90-Day Plan

Right now the "90-Day Strategy Captions" panel only reads an old copy of a plan kept in the browser, not the plan saved against your workspace. That is why Haaylo shows "Nothing to suggest yet" even though your plan is there.

- The saved plan for the selected workspace is sent into the tools screen when it loads and whenever you switch workspace.
- Its pillars, their topics and the weekly themes become the suggested posts.
- Arriving from "View posts" on a pillar still shows just that pillar's topics.

## 2. Suggested posts open as a proper draft

Clicking a suggested post opens a draft panel instead of the small preview strip. In it you can:

- **Write / rewrite** the caption in the chosen format.
- **Edit** the text directly and save your changes.
- **Refine** it with a short instruction ("shorter", "warmer opening").
- **Generate an image** for the post, and refine that image with an instruction — same picture engine used elsewhere.
- **Add to Content Bank**, already tagged with your strategy name, the pillar and "90-day strategy".
- **Approve and add to the calendar**, carrying the image with it.
- **Add to plan** — pin the post against its week so the 90-Day Plan shows it as covered.

Drafts stay saved per topic and format, so you can leave and come back to a half-finished one. The week each topic came from is shown on the draft.

## Technical notes

- `src/routes/engine.tsx`: send the workspace `strategy_plans` row to the iframe as a new `engine:strategy` message (on ready, on plan refresh and on workspace change); include the plan name so bank tagging stops re-fetching.
- `public/engine/index.html`: store that payload, and have `SuggestionPanel` build pillars/weeks from it, falling back to the existing `ie-mod-strategy-out` parse when absent.
- Replace `CardWriter`'s inline `open` preview with a modal draft editor component reusing `generateCaptionInline`, `updateWrittenPost`, `engine:generate-graphic` / `engine:refine-graphic` / `engine:graphic-ready` (as in `OutBox`), `engine:save-bank` with `source:'strategy-captions'` plus pillar, and `engine:schedule` with `mediaUrl`/`mediaPath`.
- "Add to plan" posts the topic + week back to the parent, which writes it onto the workspace strategy plan via `saveStrategyPlan`; no migration needed.

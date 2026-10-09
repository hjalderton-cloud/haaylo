# Send "View posts" to the strategy captions screen, and name every strategy

Right now "View posts" on a content pillar drops you into the Content Bank, which is usually empty because nothing has been written yet. It should take you to the captions screen for that pillar, where the topics are waiting to be written.

## 1. "View posts" opens the captions screen

- Each pillar's "View posts" button opens Content Tools on the captions tab, already filtered to that pillar's topics.
- If you want the finished posts instead, the Content Bank is still one click away from there.

## 2. Tidy the captions screen

- Remove the "Pull from Brain" button. The strategy was already built from your Brain, so pulling again is redundant. "Clear fields" stays.
- Rename the tab and heading from "Captions" to "90-Day Strategy Captions", so it's obvious these come from the plan.

## 3. Name each strategy

- When you generate a 90-day plan you give it a name (pre-filled with something like "90-Day Plan — September 2026"), and the name can be edited later on the plan page.
- The name shows at the top of the 90-Day Plan page.

## 4. Posts tag themselves automatically

- Anything saved to the Content Bank from the strategy captions screen is filed under the strategy's name and tagged with its pillar, plus a "90-day strategy" tag.
- In the Content Bank you can then filter to one strategy or one pillar and see exactly what has been written against the plan.
- Existing saved posts are untouched; this applies from now on.

## Technical notes

- `src/routes/_authenticated/plan.tsx`: "View posts" navigates to `/engine` with hash `m=content&t=plan&pillar=<name>` instead of `/bank`. Add a name input beside the goal input in the generate form, show/edit the name on the saved plan header.
- `src/lib/strategy.functions.ts` + `strategy.server.ts`: add an optional `name` string to the plan schema/type (stored inside the existing `strategy_plans.plan` JSON — no migration needed); accept it on generate and save, defaulting to a dated name.
- `public/engine/index.html` (embedded engine app): drop `onPullFromBrain` from the Content Tools module toolbar; relabel the `t==='plan'` tab and section heading; read a `pillar` value from the `#m=content&t=plan` deep link and filter the suggestion pillars to it; on "Add to Content Bank" post `engine:save-bank` with `source:'strategy-captions'`, the pillar and the topic.
- `src/routes/engine.tsx`: when a `save-bank` message carries `source:'strategy-captions'`, fetch the workspace plan name via `getStrategyPlan` and pass `collection` = strategy name, `tags` = ['90-day strategy', pillar, 'caption'] into `saveToBank`.
- Content Bank pillar filter already reads `meta`/tags, so tagged items appear under the existing pillar dropdown; the collection filter covers the strategy name.

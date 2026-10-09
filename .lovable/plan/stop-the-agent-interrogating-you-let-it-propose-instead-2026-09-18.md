# Stop the agent interrogating you — let it propose instead

Two things are wrong on the Briefing Room screen.

## 1. It asks instead of recommending

Right now, before it writes a single line of a plan, the agent checks for four saved facts (business name, ideal customer, tone of voice, preferred channels). If any one is blank it refuses to plan and shows the question form. That is backwards: it should read whatever your Brand DNA does hold, decide the rest itself, and show you the proposal.

New behaviour:

- The agent always produces a proposal. No blocking questions.
- Where something is missing, it makes a sensible call from what it does know — your website copy, past posts, your 90-day plan, the brief you typed — and says so.
- The proposal gains a short line, "Assumptions I made", listing anything it decided for you (for example: audience, channels, tone). Each assumption has a small "Change" control that re-plans with your correction.
- Anything you correct is still saved to Brand DNA, so it only guesses once.
- Only one case still stops it: a completely empty Brand DNA and a brief too vague to work from. Then it asks one question, not four.

## 2. The red error block

That wall of red text on your screen is a separate bug in the save step. When you answer some questions but not all, the save is rejected because it expects every field. It will accept a partial set.

## Technical notes

- `src/lib/agent-brief.functions.ts` — `planBrief`: drop the `gaps` early-return gate; pass a "known/unknown" summary into the model prompt and require it to return an `assumptions` array (field, value, why) alongside the blueprint. Add `assumptions` to `blueprintSchema` (optional, max 6, coerced like `assetSummary`). Keep the gap list only for the empty-brain-plus-thin-brief case.
- `saveBrainAnswers`: make the `z.record` value schema partial/optional so a subset of fields validates.
- `src/routes/_authenticated/home.tsx` — replace the questions gate with an assumptions strip inside the proposal card; "Change" writes the answer via `saveBrainAnswers` and re-runs `planBrief`. Keep the existing one-question fallback UI for the rare blocked case.
- No schema change, no route change, workspace scoping and writing rules untouched.

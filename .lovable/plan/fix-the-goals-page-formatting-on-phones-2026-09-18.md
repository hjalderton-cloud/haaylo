# Fix the Goals page formatting on phones

## What's wrong

On the Goals screen, each goal is one long unbroken line: "Draft three LinkedIn posts about our new service and queue them for my approval" runs straight off the right edge instead of wrapping. That stretches the page wider than the phone screen, which is why everything above it — the tab pills, the input card, "Your goals" — sits squashed into the left portion of the display with empty space beside it.

The cause is the shared button style: the whole goal row is a button, and buttons are set never to wrap their text. The same applies to the step trail and approval rows further down the page, so they overflow too once a step description gets long.

## The fix

- Goal rows wrap their text over as many lines as needed, with the status pill staying on the left.
- The Continue button drops below the text on narrow screens rather than squeezing it.
- The same wrapping fix applied to the step trail and approval rows on this page, so a long step description behaves the same way.
- Nothing may push the page wider than the screen, so the content sits at full width on a phone again.
- Tab pills stay as they are (wrapping onto extra rows is fine); they only looked wrong because of the overflow.

No change to what the page does, to the agent, or to any other screen.

## Technical detail

In `src/routes/_authenticated/agent/goals.tsx`:
- The shadcn `Button` base class includes `whitespace-nowrap`; add `className="whitespace-normal"` plus `minWidth: 0` and `overflowWrap: "anywhere"` on the text `<span>` for the goal-row button, the step rows and the approval rows.
- Goal row container: `flexWrap: "wrap"` so Continue moves below on narrow widths; inner button `flex: "1 1 220px"`.
- Add `maxWidth: "100%"`/`minWidth: 0` on the flex children so a long word cannot force the row wider than the card.

**Check before done:** typecheck and the test suite, then screenshots of `/agent/goals` at 390px and desktop width confirming the goal text wraps, the page fills the screen, and there is no sideways scroll.

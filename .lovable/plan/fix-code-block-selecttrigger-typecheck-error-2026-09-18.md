# Fix: code-block SelectTrigger typecheck error

## Problem
`bunx tsgo --noEmit` fails with one error:

```
src/components/ai-elements/code-block.tsx(532,5): error TS2322:
  Property 'size' does not exist on type '...SelectTriggerProps...'
```

`CodeBlockLanguageSelectorTrigger` passes `size="sm"` to `SelectTrigger`, which doesn't accept that prop. This blocks the build.

## Fix
Remove the `size="sm"` prop from `SelectTrigger` at `src/components/ai-elements/code-block.tsx:532`. The height is already controlled by the `className` (`h-7`), so the visual result is unchanged.

## Verification
- `bunx tsgo --noEmit` passes with zero errors.
- No functional or visual change — the select trigger keeps its `h-7` height from the existing className.

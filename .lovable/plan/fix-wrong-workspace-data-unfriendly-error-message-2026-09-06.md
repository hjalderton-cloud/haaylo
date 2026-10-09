# Fix: wrong workspace data + unfriendly error message

Two small fixes in the Lead Funnel / Lead Magnet area. Both are contained — one afternoon-sized change, low cost.

## 1. It keeps pulling Haaylo when Paymentsave is selected

Confirmed cause: the Lead Magnet brief loader ignores which client you have selected. It always picks your default (first) workspace, and it also mixes in the account-level brand details (name, audience, voice), which are stored once per account rather than per client — those are the Haaylo ones.

Fix:
- Pass the selected workspace into the brief loader, so it reads that client's Strategy Profile.
- Prefer the selected client's own brand details (tone, colours, audience) and only fall back to the account-level ones when that client has nothing saved.
- Do the same for the cover/image colours so Paymentsave covers use Paymentsave colours.
- Re-load the brief when you switch client, the same way the funnel page already does.

The Lead Funnel fields (problem / offer) are already workspace-aware; no change needed there.

## 2. The raw error box

When a field is too long, the screen currently shows the raw technical validation text. Fix:
- Show a plain sentence instead, naming the field: "Your offer is too long — please keep it under 1,200 characters."
- Raise the brief limits (offer / audience / goal) so normal-length answers stop tripping it, and trim overly long profile text when pre-filling rather than failing.

## Technical notes

- `src/lib/magnet.functions.ts` — `getMagnetPrefill` gains an optional `projectId` input, resolves it via the same default-project fallback used in `funnel.functions.ts`, and reads `business_brains.data.brand` before `brand_brain`. Same resolution applied to the brand colour lookup used by image/cover generation.
- `src/components/magnet/MagnetEngine.tsx` — uses `useActiveProject`, includes the project id in the query key, passes it to `getMagnetPrefill` and `generateMagnetKit`, and maps Zod issues to friendly copy in the two error paths (lines 397, 443).
- Input schema limits raised; prefill `join()` slices stay under the new caps.
- No database or schema changes.

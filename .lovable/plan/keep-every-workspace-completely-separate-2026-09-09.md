# Keep every workspace completely separate

The database has the correct separate plans: Haaylo starts with “The Context-Switching Headache”, while Paymentsave contains the card-processing themes shown in your screenshot. The wrong plan is reaching the campaign screen because workspace selection is currently copied between separate parts of the page through browser storage and events, while server requests can still fall back to the default workspace if the selected workspace has not arrived yet.

## 1. Make the selected workspace the single source of truth

- Introduce one shared workspace state for the signed-in app instead of letting the client picker, campaign modal and individual pages each read browser storage independently.
- Initialise it once from the saved selection, confirm that the workspace belongs to the signed-in account, and expose both the selected workspace ID and name.
- Keep browser storage only for remembering the choice between visits, not as the live source used by each screen.

## 2. Make campaign creation strictly workspace-bound

- Pass the selected workspace directly into every New Campaign modal, including the sidebar and campaign switcher versions.
- Do not request plan weeks until that exact workspace is known.
- Remove the default-workspace fallback from campaign creation and its plan lookup; if the workspace is unavailable, show a short loading state rather than displaying another workspace’s content.
- Reset plan weeks immediately when the workspace changes, cancel or ignore any earlier response, and only display a response matching the current workspace.
- Show the selected workspace name beside the plan-week field so it is clear which strategy is being used.

## 3. Enforce the same boundary on the server

- Validate that every supplied workspace belongs to the signed-in user before reading or writing its data.
- Require an explicit workspace for workspace-specific plan and campaign operations instead of silently substituting the account default.
- Keep account-level operations separate from workspace-level operations.

## 4. Audit the other workspace-aware screens

- Check Strategy Profile, 90-Day Plan, campaigns, Content Bank, content tools, calendar, funnels, landing pages, leads, Brand Assets and analytics for the same fallback pattern.
- Ensure queries, saved items and generated content always include the selected workspace and clear their previous results when it changes.
- Keep existing URLs and stored records unchanged.

## 5. Verify the reported case

- Select Haaylo, open New Campaign and confirm the first week is “The Context-Switching Headache”.
- Switch to Paymentsave and confirm its card-processing weeks appear instead.
- Switch back without refreshing and confirm no Paymentsave content remains in the modal or other workspace screens.
- Test the same flow on the mobile layout shown in the screenshot.

## Technical notes

- Replace the independent `ContextBar`/`useActiveProjectState` synchronisation with a provider mounted around the authenticated app shell.
- Change `CampaignEngineModal` to receive the current workspace from that provider and key its plan request by the confirmed workspace ID.
- Tighten `getStrategyPlan`, `createCampaign` and related workspace functions so an omitted workspace cannot trigger a default lookup during normal signed-in use.
- Preserve existing data and project IDs; no database migration is expected.
